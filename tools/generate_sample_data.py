#!/usr/bin/env python3
"""
generate_sample_data.py — SAMPLE dataset generator (fallback only).

The shipped dataset (data/scouting.json) is built from REAL GRID data by
build_scouting_from_grid.py. This generator exists so the app still runs
with meaningful content if that file is absent: it synthesises plausible
pro-style series with a seeded RNG and pushes them through the SAME
aggregation code (tools/aggregate.py), producing the identical schema.

The data is FICTIONAL: invented teams and players, simulated drafts. It is
labeled "sample" in the output meta, in the UI badge/footer, and in the
README. It must never be presented as real match data.

Plausibility notes (so the sample behaves like real pro data):
  * Champion pools are role-locked and meta-weighted (a small S-tier core
    per role, a long tail), mirroring real pick distributions.
  * Drafts inside a series obey the Fearless rule, like real Fearless
    series — pools visibly shrink by Game 4/5.
  * Each fictional team has tendencies (a comfort pick, a first-pick
    priority, one concentrated role pool) so the insight rules have real
    structure to find — the same structure the rules find in GRID data.
  * Win probability blends team strength with comfort-pick presence.

Usage: python3 tools/generate_sample_data.py [output.json]
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aggregate import aggregate  # noqa: E402

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    PROJECT_DIR, "data", "scouting.sample.json")
SEED = 20261124

# Role pools: (championId, weight). Head = current-meta core, tail = pocket.
POOLS = {
    "Top": [("Rumble", 10), ("KSante", 9), ("Gnar", 8), ("Renekton", 8),
            ("Aatrox", 7), ("Jax", 6), ("Camille", 5), ("Gwen", 5),
            ("Aurora", 5), ("Jayce", 4), ("Sion", 3), ("Ornn", 3)],
    "Jungle": [("Pantheon", 10), ("XinZhao", 9), ("Vi", 9), ("Skarner", 8),
               ("Sejuani", 7), ("MonkeyKing", 7), ("Kindred", 5),
               ("Nidalee", 5), ("Maokai", 4), ("Naafiri", 4)],
    "Mid": [("Azir", 10), ("Orianna", 9), ("Sylas", 8), ("Ahri", 8),
            ("Taliyah", 7), ("Viktor", 7), ("Aurora", 6), ("Yone", 6),
            ("Annie", 5), ("Ryze", 4), ("Galio", 4)],
    "ADC": [("Kalista", 10), ("Varus", 9), ("Ashe", 9), ("Ezreal", 8),
            ("Kaisa", 7), ("Corki", 7), ("Senna", 6), ("Jinx", 5),
            ("Xayah", 4), ("MissFortune", 4), ("Yunara", 5)],
    "Support": [("Renata", 9), ("Neeko", 9), ("Rakan", 8), ("Nautilus", 8),
                ("Leona", 6), ("Karma", 6), ("Lulu", 5), ("Braum", 4),
                ("Alistar", 4), ("Rell", 5)],
}
ROLES = list(POOLS.keys())
GLOBAL_BAN_WEIGHTS = [("Azir", 9), ("Kalista", 9), ("Pantheon", 8),
                      ("Rumble", 7), ("Skarner", 6), ("Yunara", 6),
                      ("Orianna", 5), ("Vi", 5), ("Neeko", 5), ("Varus", 4)]

TEAMS = {
    "aurora": {"name": "Aurora Five", "tag": "AUR", "strength": 0.54,
               "players": {"Top": "Vesper", "Jungle": "Moth", "Mid": "Ion",
                           "ADC": "Quill", "Support": "Fable"},
               # comfort: Sylas (Mid) — picked often, wins more with it
               "comfort": {"Sylas": 3.0}, "firstPickBias": {"Rumble": 3.0}},
    "basalt": {"name": "Basalt Kings", "tag": "BSK", "strength": 0.50,
               "players": {"Top": "Cairn", "Jungle": "Flint", "Mid": "Ostra",
                           "ADC": "Pumice", "Support": "Grit"},
               # concentrated ADC pool: Kalista/Ashe dominate
               "comfort": {"Gnar": 2.5}, "firstPickBias": {"Kalista": 2.5},
               "roleFocus": {"ADC": ["Kalista", "Ashe", "Varus"]}},
    "cinder": {"name": "Cinder Wolves", "tag": "CNW", "strength": 0.46,
               "players": {"Top": "Ashpaw", "Jungle": "Ember", "Mid": "Soot",
                           "ADC": "Coal", "Support": "Wick"},
               # narrow overall pools -> Fearless late-series pain
               "comfort": {"Ahri": 2.5}, "firstPickBias": {"Pantheon": 2.5},
               "narrow": True},
}


def weighted_choice(rng, items):
    total = sum(w for _, w in items)
    x = rng.uniform(0, total)
    for name, w in items:
        x -= w
        if x <= 0:
            return name
    return items[-1][0]


def pool_for(team, role):
    items = POOLS[role]
    focus = TEAMS[team].get("roleFocus", {}).get(role)
    if focus:
        items = [(c, w * (4.0 if c in focus else 0.35)) for c, w in items]
    if TEAMS[team].get("narrow"):
        head = {c for c, _ in items[:6]}
        items = [(c, w * (1.6 if c in head else 0.3)) for c, w in items]
    comfort = TEAMS[team].get("comfort", {})
    items = [(c, w * comfort.get(c, 1.0)) for c, w in items]
    return items


def simulate_series(rng, sid, blue, red, fmt):
    need = {"BO3": 2, "BO5": 3}[fmt]
    wins = {blue: 0, red: 0}
    fearless = set()
    games = []
    gn = 0
    while max(wins.values()) < need:
        gn += 1
        unavailable = set(fearless)
        # --- bans: global meta + opponent comfort targeting ---
        bans = {blue: [], red: []}
        for i in range(10):
            side = blue if i % 2 == 0 else red
            opp = red if side == blue else blue
            ban_pool = list(GLOBAL_BAN_WEIGHTS)
            for champ, mult in TEAMS[opp].get("comfort", {}).items():
                ban_pool.append((champ, 6 * mult))
            for _ in range(20):
                cand = weighted_choice(rng, ban_pool)
                if cand not in unavailable and cand not in bans[blue] + bans[red]:
                    bans[side].append(cand)
                    break
        # --- picks: role by role in a plausible draft order ---
        picks = {blue: [], red: []}
        order = [(blue, "Top"), (red, "Jungle"), (red, "Mid"), (blue, "Jungle"),
                 (blue, "Mid"), (red, "Top"), (red, "ADC"), (blue, "ADC"),
                 (blue, "Support"), (red, "Support")]
        first_bias = TEAMS[blue].get("firstPickBias", {})
        for idx, (side, role) in enumerate(order):
            items = pool_for(side, role)
            if idx == 0 and first_bias:
                items = [(c, w * first_bias.get(c, 1.0)) for c, w in items]
            for _ in range(30):
                cand = weighted_choice(rng, items)
                if cand not in unavailable:
                    break
            unavailable.add(cand)
            picks[side].append({"champion": cand, "role": role,
                                "player": TEAMS[side]["players"][role]})
        # --- winner ---
        def comfort_count(team):
            return sum(1 for p in picks[team]
                       if p["champion"] in TEAMS[team].get("comfort", {}))
        p_blue = 0.5 + (TEAMS[blue]["strength"] - TEAMS[red]["strength"]) \
            + 0.05 * (comfort_count(blue) - comfort_count(red)) \
            - (0.02 * (gn - 1) if TEAMS[blue].get("narrow") else 0) \
            + (0.02 * (gn - 1) if TEAMS[red].get("narrow") else 0)
        winner = blue if rng.random() < max(0.05, min(0.95, p_blue)) else red
        wins[winner] += 1
        for side in (blue, red):
            for p in picks[side]:
                fearless.add(p["champion"])
        games.append({
            "seriesId": sid, "format": fmt, "gameNumber": gn,
            "blueTeam": blue, "redTeam": red, "winnerTeam": winner,
            "bluePicks": picks[blue], "redPicks": picks[red],
            "blueBans": bans[blue], "redBans": bans[red],
        })
    return games


def main():
    rng = random.Random(SEED)
    records = []
    sid = 0
    pairs = [("aurora", "basalt"), ("aurora", "cinder"), ("basalt", "cinder")]
    for a, b in pairs:
        for i in range(7):
            sid += 1
            blue, red = (a, b) if (i + sid) % 2 == 0 else (b, a)
            records += simulate_series(rng, f"SMP-{sid}", blue, red, "BO3")
        for i in range(3):
            sid += 1
            blue, red = (a, b) if (i + sid) % 2 == 0 else (b, a)
            records += simulate_series(rng, f"SMP-{sid}", blue, red, "BO5")

    teams_meta = {tid: {"name": t["name"], "tag": t["tag"]}
                  for tid, t in TEAMS.items()}
    result = aggregate(records, teams_meta)
    result["meta"] = {
        "kind": "sample",
        "label": "SAMPLE data — fictional teams, simulated drafts, for "
                 "demonstration only. Not real match data.",
        "source": "Generated by tools/generate_sample_data.py (seeded) and "
                  "aggregated by tools/aggregate.py",
        "note": "The shipped data/scouting.json is built from real GRID "
                "data; this sample is only a fallback.",
        "seriesProcessed": sid,
        "gamesProcessed": len(records),
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"Wrote {OUT_PATH} ({os.path.getsize(OUT_PATH)//1024} KB), "
          f"{len(records)} simulated games across {sid} series")


if __name__ == "__main__":
    main()
