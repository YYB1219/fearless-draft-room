#!/usr/bin/env python3
"""
build_scouting_from_grid.py — build data/scouting.json from REAL GRID data.

Reads the official GRID starter dataset for the Cloud9 × JetBrains
Hackathon (https://github.com/cloud9esports/stl-hackathon-2026-grid-starter),
streams the LoL series feeds for a selected set of pro teams, extracts the
full draft (ordered bans + picks from `team-banned-character` /
`team-picked-character` events), game winners and patches, joins player
names from meta/rosters.csv — and then writes ONLY AGGREGATES.

Why aggregates only: the GRID data license (see the starter repo's
LICENSE.md) allows building with the data during the hackathon but forbids
redistributing it — committing raw feeds or per-game extracts to a project
repo would be redistribution. The starter repo's README states the line
explicitly: "Your code, charts, screenshots and aggregate results are fine
to commit." This script therefore keeps every per-game record in memory,
aggregates it via tools/aggregate.py, and writes nothing else.

Usage:
  STL_DATA_DIR=/path/to/stl-hackathon-2026-grid-starter \
    python3 tools/build_scouting_from_grid.py [output.json]

Requires: python3 + `pip install zstandard`.
"""
import csv
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aggregate import aggregate  # noqa: E402

try:
    import zstandard
except ImportError:
    sys.exit("Missing dependency: pip install zstandard")

DATA_DIR = os.environ.get(
    "STL_DATA_DIR",
    os.path.expanduser("~/workspace/projects/grid-starter-data"))
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    PROJECT_DIR, "data", "scouting.json")

# Selected pro teams (canonical slug -> name as in meta/teams.csv, tag).
# Cloud9 Kia is the hackathon host's LoL team; the rest are the most-played
# LCK / LEC / LCS teams in the dataset, so every profile has a real sample.
SELECTED = {
    "cloud9-kia": ("Cloud9 Kia", "C9"),
    "t1": ("T1", "T1"),
    "geng": ("Gen.G Esports", "GEN"),
    "hle": ("Hanwha Life Esports", "HLE"),
    "kt": ("KT Rolster", "KT"),
    "dk": ("Dplus KIA", "DK"),
    "g2": ("G2 Esports", "G2"),
    "fnatic": ("Fnatic", "FNC"),
    "kc": ("Karmine Corp", "KC"),
    "mkoi": ("Movistar KOI", "MKOI"),
    "giantx": ("GIANTX", "GX"),
    "tl": ("Team Liquid Alienware", "TL"),
}


def norm_name(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def load_champion_maps():
    with open(os.path.join(PROJECT_DIR, "data", "champions.json")) as f:
        champs = json.load(f)["champions"]
    by_name, roles = {}, {}
    for c in champs:
        by_name[norm_name(c["name"])] = c["id"]
        roles[c["id"]] = c["roles"][0]
    return by_name, roles


def read_csv(path):
    with open(os.path.join(DATA_DIR, path), newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if rows and "title" in rows[0]:  # meta/*.csv mix both titles; series.csv has none
        rows = [r for r in rows if r["title"] == "lol"]
    return rows


def parse_feed(path):
    """Stream one GRID series feed -> (teams_by_id, games) or None.

    games: {gameNumber: {"blue": teamId, "red": teamId,
                         "actions": [(side, "ban"|"pick", champName)],
                         "winner": teamId}}
    Draft events precede each game's start, so a draft event belongs to
    game (number of series-started-game events seen so far) + 1.
    Three feeds contain two sessions; a second grid-started-feed resets
    everything and the later session supersedes the first.
    """
    teams, games = {}, {}
    started = 0
    sessions = 0
    fmt = None
    with zstandard.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            env = json.loads(line)
            for ev in env["events"]:
                t = ev["type"]
                if t == "grid-started-feed":
                    sessions += 1
                    if sessions > 1:
                        teams, games, started = {}, {}, 0
                elif t == "tournament-started-series":
                    st = ev["target"]["state"]
                    fmt = st.get("format")
                    for tm in st.get("teams", []):
                        teams[tm["id"]] = tm["name"]
                elif t == "series-started-game":
                    started += 1
                elif t in ("team-banned-character", "team-picked-character"):
                    gn = started + 1
                    g = games.setdefault(gn, {"actions": [], "winner": None,
                                              "sides": {}})
                    actor = ev["actor"]["state"]
                    g["sides"][actor["id"]] = actor.get("side")
                    g["actions"].append((
                        actor["id"],
                        "ban" if t == "team-banned-character" else "pick",
                        ev["target"]["state"]["name"]))
                    teams.setdefault(actor["id"], actor["name"])
                elif t == "team-won-game":
                    gn = started  # the currently running game
                    if gn in games:
                        games[gn]["winner"] = ev["actor"]["id"]
                        teams.setdefault(ev["actor"]["id"],
                                           ev["actor"]["state"]["name"])
    return teams, games, fmt


def main():
    champ_by_name, champ_role = load_champion_maps()

    teams_csv = read_csv("meta/teams.csv")
    id_to_slug, teams_meta = {}, {}
    for row in teams_csv:
        for slug, (name, tag) in SELECTED.items():
            names = [row["name"]] + [x.strip() for x in
                                     (row.get("other_names") or "").split(";")]
            if name in names:
                id_to_slug[row["team_id"]] = slug
                teams_meta[slug] = {"name": name, "tag": tag}
    missing = set(SELECTED) - set(teams_meta)
    if missing:
        print("WARNING: selected teams not found in meta/teams.csv:", missing)

    games_csv = read_csv("meta/games.csv")
    wanted_series = set()
    game_meta = {}  # (series_id, game_number) -> {patch, valid}
    for row in games_csv:
        if row["team1_id"] in id_to_slug or row["team2_id"] in id_to_slug:
            wanted_series.add(row["series_id"])
        game_meta[(row["series_id"], int(row["game_number"]))] = {
            "patch": row["patch"],
            "valid": row["session_valid"] == "True",
        }
    print(f"Selected teams: {len(teams_meta)} · series to parse: {len(wanted_series)}")

    rosters = {}
    for row in read_csv("meta/rosters.csv"):
        if row["participation_status"] != "active":
            continue
        key = (row["series_id"], int(row["game_number"]), row["team_id"],
               norm_name(row["character_name"]))
        rosters.setdefault(key, row["player_name"])

    series_csv = {r["series_id"]: r for r in read_csv("lol/series.csv")}

    records, report = [], {"feeds": 0, "gamesKept": 0, "gamesDropped": 0,
                           "unmappedChampions": set(), "winnerMismatch": 0}
    for sid in sorted(wanted_series):
        row = series_csv.get(sid)
        if not row:
            continue
        path = os.path.join(DATA_DIR, row["file"])
        if not os.path.exists(path):
            print("missing feed file:", row["file"])
            continue
        report["feeds"] += 1
        teams, games, fmt = parse_feed(path)
        # Canonical id: the slug for selected teams, a stable pseudo-id for
        # opponents (aggregates only ever profile the selected teams, but a
        # game's sides and winner need both teams represented).
        slug_of = {tid: id_to_slug.get(tid) or f"grid-{tid}" for tid in teams}
        for gn, g in sorted(games.items()):
            meta = game_meta.get((sid, gn), {"valid": True})
            picks = [a for a in g["actions"] if a[1] == "pick"]
            bans = [a for a in g["actions"] if a[1] == "ban"]
            if len(picks) != 10 or len(bans) != 10 or not meta["valid"]:
                report["gamesDropped"] += 1
                continue
            # sides for this game
            side_of = {}
            for tid, side in g["sides"].items():
                if slug_of.get(tid):
                    side_of[side] = slug_of[tid]
            if "blue" not in side_of or "red" not in side_of:
                report["gamesDropped"] += 1
                continue
            winner_slug = slug_of.get(g["winner"]) if g["winner"] else None
            if winner_slug is None:
                report["gamesDropped"] += 1
                continue

            def to_pick(action, team_grid_id):
                champ = champ_by_name.get(norm_name(action[2]))
                if not champ:
                    report["unmappedChampions"].add(action[2])
                    champ = action[2]
                player = rosters.get((sid, gn, team_grid_id, norm_name(action[2])))
                return {"champion": champ, "role": champ_role.get(champ, "Mid"),
                        "player": player}

            rec = {
                "seriesId": sid,
                "format": {"best-of-1": "BO1", "best-of-3": "BO3",
                           "best-of-5": "BO5"}.get(fmt, "BO3"),
                "gameNumber": gn,
                "blueTeam": side_of["blue"], "redTeam": side_of["red"],
                "winnerTeam": winner_slug,
                "bluePicks": [], "redPicks": [], "blueBans": [], "redBans": [],
            }
            grid_id_of_slug = {v: k for k, v in slug_of.items() if v}
            for tid, kind, champ_name in g["actions"]:
                slug = slug_of.get(tid)
                if not slug:
                    continue
                champ = champ_by_name.get(norm_name(champ_name))
                if not champ:
                    report["unmappedChampions"].add(champ_name)
                    champ = champ_name
                side = g["sides"].get(tid)
                if kind == "pick":
                    rec["bluePicks" if side == "blue" else "redPicks"].append(
                        to_pick((tid, kind, champ_name), tid))
                else:
                    rec["blueBans" if side == "blue" else "redBans"].append(champ)
            # Picks must be in draft order per side — feed order preserves it.
            records.append(rec)
            report["gamesKept"] += 1

    print("Build report:", {k: (sorted(v) if isinstance(v, set) else v)
                            for k, v in report.items()})

    result = aggregate(records, teams_meta)
    result["meta"] = {
        "kind": "grid",
        "label": "Real data: GRID official hackathon dataset — LCK, LEC, "
                 "LTA North/South & LCS, 2025–2026 seasons (aggregates only)",
        "source": "GRID starter dataset for the Cloud9 × JetBrains Hackathon "
                  "(github.com/cloud9esports/stl-hackathon-2026-grid-starter)",
        "note": "Aggregates computed locally from GRID series feeds by "
                "tools/build_scouting_from_grid.py. Raw GRID data is "
                "license-restricted and is NOT included in this project.",
        "seriesProcessed": report["feeds"],
        "gamesProcessed": report["gamesKept"],
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"Wrote {OUT_PATH} ({os.path.getsize(OUT_PATH)//1024} KB), "
          f"{len(records)} games, {len(result['teams'])} team profiles")


if __name__ == "__main__":
    main()
