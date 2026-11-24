"""
aggregate.py — shared aggregation for Fearless Draft Room.

Consumes normalised game records (produced either from real GRID feeds by
build_scouting_from_grid.py, or synthetically by generate_sample_data.py)
and emits the profile schema consumed by js/scouting.js:

  {
    "meta": {...},                      # filled in by the caller
    "championStats": {champ: {games, wins}},
    "teams": [{id, name, tag, players: {role: playerName}}],
    "profiles": { teamId: {
        games, wins,
        firstPicks:      {champ: count},
        bannedAgainst:   {champ: count},
        rolePools:       {role: {distinct, champions: {champ: {games, wins}}}},
        tendencies:      {champ: {pickedGames, pickedWins, unpickedGames,
                                  unpickedWins, bannedAgainstGames,
                                  bannedAgainstWins}},
        fearlessShift:   {seriesCount, byGame: [{gameNumber, topPicks,
                                  removedAvg, poolRemovedAvg, seriesN}]},
        lateSeries:      {longSeries, avgTop5GoneByG4, top5, dryRoles},
        sideSplits:      {blue: {games, wins, firstPicks, bannedAgainst},
                          red:  {games, wins, firstPicks, bannedAgainst}}
                          # per-side splits; firstPicks / bannedAgainst
                          # hold only the top 5 champions by count
    }}
  }

A record is:
  {seriesId, format, gameNumber, blueTeam, redTeam, winnerTeam,
   bluePicks: [{champion, role, player}], redPicks: [...],
   blueBans: [champId], redBans: [champId]}
Team ids in records are the canonical team ids.
"""
from collections import Counter, defaultdict

ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]


def _team_games(records, team_id):
    """Yield (record, perspective) for every game a team played."""
    for r in records:
        if r["blueTeam"] == team_id:
            yield r, {
                "side": "blue", "won": r["winnerTeam"] == team_id,
                "myPicks": r["bluePicks"], "oppPicks": r["redPicks"],
                "myBans": r["blueBans"], "oppBans": r["redBans"],
            }
        elif r["redTeam"] == team_id:
            yield r, {
                "side": "red", "won": r["winnerTeam"] == team_id,
                "myPicks": r["redPicks"], "oppPicks": r["bluePicks"],
                "myBans": r["redBans"], "oppBans": r["blueBans"],
            }


def aggregate(records, teams_meta):
    """teams_meta: {team_id: {"name":..., "tag":...}}"""
    # Global champion stats (draft heuristic input)
    champ_stats = defaultdict(lambda: {"games": 0, "wins": 0})
    for r in records:
        for side_key, team_key in (("bluePicks", "blueTeam"), ("redPicks", "redTeam")):
            for p in r[side_key]:
                st = champ_stats[p["champion"]]
                st["games"] += 1
                if r["winnerTeam"] == r[team_key]:
                    st["wins"] += 1

    # Players per role (most frequent player per team+role)
    player_votes = defaultdict(Counter)
    for r in records:
        for side_key, team_key in (("bluePicks", "blueTeam"), ("redPicks", "redTeam")):
            for p in r[side_key]:
                if p.get("player"):
                    player_votes[(r[team_key], p["role"])][p["player"]] += 1

    profiles = {}
    for team_id in teams_meta:
        games = list(_team_games(records, team_id))
        n = len(games)
        wins = sum(1 for _, g in games if g["won"])

        first_picks = Counter()
        banned_against = Counter()
        role_pools = {role: defaultdict(lambda: {"games": 0, "wins": 0}) for role in ROLES}
        tendencies = defaultdict(lambda: {
            "pickedGames": 0, "pickedWins": 0, "unpickedGames": 0,
            "unpickedWins": 0, "bannedAgainstGames": 0, "bannedAgainstWins": 0})

        for _, g in games:
            if g["myPicks"]:
                first_picks[g["myPicks"][0]["champion"]] += 1
            for champ in set(g["oppBans"]):
                banned_against[champ] += 1
            my_champs = set()
            for p in g["myPicks"]:
                my_champs.add(p["champion"])
                rec = role_pools[p["role"]][p["champion"]]
                rec["games"] += 1
                if g["won"]:
                    rec["wins"] += 1
            for champ in my_champs:
                t = tendencies[champ]
                t["pickedGames"] += 1
                if g["won"]:
                    t["pickedWins"] += 1
            opp_banned = set(g["oppBans"])
            for champ in opp_banned:
                t = tendencies[champ]
                t["bannedAgainstGames"] += 1
                if g["won"]:
                    t["bannedAgainstWins"] += 1
        # Unpicked splits need every champion the team did NOT pick per game;
        # only champions they picked at least once overall are tracked.
        tracked = set(tendencies.keys())
        for _, g in games:
            my_champs = {p["champion"] for p in g["myPicks"]}
            for champ in tracked - my_champs:
                t = tendencies[champ]
                t["unpickedGames"] += 1
                if g["won"]:
                    t["unpickedWins"] += 1

        role_pools_out = {}
        for role in ROLES:
            champs = dict(role_pools[role])
            if champs:
                role_pools_out[role] = {"distinct": len(champs), "champions": champs}

        # ---- Fearless shift (series where the team played 3+ games) ----
        by_series = defaultdict(list)
        for r, g in games:
            by_series[r["seriesId"]].append((r, g))
        long_series = {sid: gs for sid, gs in by_series.items() if len(gs) >= 3}
        picks_by_gn = defaultdict(Counter)
        removed_sum = Counter()
        pool_removed_sum = Counter()
        series_n = Counter()
        for sid, gs in long_series.items():
            gs_sorted = sorted(gs, key=lambda x: x[0]["gameNumber"])
            my_earlier, all_earlier = set(), set()
            for r, g in gs_sorted:
                gn = r["gameNumber"]
                removed_sum[gn] += len(my_earlier)
                pool_removed_sum[gn] += len(all_earlier)
                series_n[gn] += 1
                for p in g["myPicks"]:
                    picks_by_gn[gn][p["champion"]] += 1
                    my_earlier.add(p["champion"])
                for p in g["myPicks"] + g["oppPicks"]:
                    all_earlier.add(p["champion"])
        fearless_shift = {
            "seriesCount": len(long_series),
            "byGame": [
                {
                    "gameNumber": gn,
                    "topPicks": dict(picks_by_gn[gn].most_common(5)),
                    "removedAvg": round(removed_sum[gn] / series_n[gn], 1),
                    "poolRemovedAvg": round(pool_removed_sum[gn] / series_n[gn], 1),
                    "seriesN": series_n[gn],
                }
                for gn in sorted(picks_by_gn)
            ],
        }

        # ---- Late-series pool exhaustion (series with 4+ games) ----
        pick_totals = Counter()
        for _, g in games:
            for p in g["myPicks"]:
                pick_totals[p["champion"]] += 1
        top5 = [c for c, _ in pick_totals.most_common(5)]
        very_long = {sid: gs for sid, gs in by_series.items() if len(gs) >= 4}
        gone4_total, gone4_checks = 0, 0
        gone5_total, gone5_checks = 0, 0
        dry_role_votes = Counter()
        for sid, gs in very_long.items():
            gs_sorted = sorted(gs, key=lambda x: x[0]["gameNumber"])
            all_earlier = set()
            for r, g in gs_sorted:
                if r["gameNumber"] == 4:
                    # Measured AT Game 4: all_earlier holds exactly the
                    # picks of games 1-3 of this series at this point.
                    gone4_total += len([c for c in top5 if c in all_earlier])
                    gone4_checks += 1
                    for role in ROLES:
                        pool = role_pools_out.get(role)
                        if not pool:
                            continue
                        # The role's top 5 BY PLAY VOLUME (games desc,
                        # wins desc, name) — not dict insertion order.
                        champs = [c for c, _ in sorted(
                            pool["champions"].items(),
                            key=lambda kv: (-kv[1]["games"], -kv[1]["wins"],
                                            kv[0]))[:5]]
                        if champs and sum(1 for c in champs if c in all_earlier) / len(champs) >= 0.5:
                            dry_role_votes[role] += 1
                elif r["gameNumber"] == 5:
                    # Measured AT Game 5: picks of games 1-4 are gone.
                    gone5_total += len([c for c in top5 if c in all_earlier])
                    gone5_checks += 1
                for p in g["myPicks"] + g["oppPicks"]:
                    all_earlier.add(p["champion"])
        late_series = {
            "longSeries": len(very_long),
            "avgTop5GoneByG4": round(gone4_total / gone4_checks, 1) if gone4_checks else 0,
            "avgTop5GoneByG5": round(gone5_total / gone5_checks, 1) if gone5_checks else 0,
            "top5": top5,
            "dryRoles": [role for role, v in dry_role_votes.most_common()
                         if gone4_checks and v / gone4_checks >= 0.5],
        }

        # ---- Side splits (blue vs red) ----
        # The perspective from _team_games carries the side the team
        # played THIS game (records always know both teams' sides —
        # build_scouting_from_grid.py drops games whose feed states no
        # side for either team, so no side is ever guessed here). The
        # counting mirrors the overall tables above: first pick = the
        # team's first pick of the game; banned-against counts each
        # distinct champion the opponent banned, once per game. Only
        # the top 5 by count are kept for each list.
        side_splits = {}
        for side in ("blue", "red"):
            side_games = [g for _, g in games if g["side"] == side]
            side_fp = Counter()
            side_ba = Counter()
            for g in side_games:
                if g["myPicks"]:
                    side_fp[g["myPicks"][0]["champion"]] += 1
                for champ in set(g["oppBans"]):
                    side_ba[champ] += 1
            side_splits[side] = {
                "games": len(side_games),
                "wins": sum(1 for g in side_games if g["won"]),
                "firstPicks": dict(side_fp.most_common(5)),
                "bannedAgainst": dict(side_ba.most_common(5)),
            }

        profiles[team_id] = {
            "games": n,
            "wins": wins,
            "firstPicks": dict(first_picks),
            "bannedAgainst": dict(banned_against),
            "rolePools": role_pools_out,
            "tendencies": {k: dict(v) for k, v in tendencies.items()},
            "fearlessShift": fearless_shift,
            "lateSeries": late_series,
            "sideSplits": side_splits,
        }

    teams_out = []
    for team_id, meta in teams_meta.items():
        players = {}
        for role in ROLES:
            votes = player_votes.get((team_id, role))
            if votes:
                players[role] = votes.most_common(1)[0][0]
        teams_out.append({
            "id": team_id, "name": meta["name"], "tag": meta["tag"],
            "players": players,
        })

    return {
        "championStats": {k: dict(v) for k, v in champ_stats.items()},
        "teams": teams_out,
        "profiles": profiles,
    }
