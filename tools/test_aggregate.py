#!/usr/bin/env python3
"""
test_aggregate.py — unit tests for tools/aggregate.py.

Synthetic fixture, designed so the two historical bugs change the
output (the tests FAIL against the pre-fix aggregation):

  1. dryRoles role-pool top-5 must be selected BY PLAY VOLUME
     (games desc, wins desc, name) — not by dict insertion order.
     In this fixture, insertion order puts Alpha's Top pool as
     [TopA, TopB, TopC, TopX, TopE], of which 3 are gone by Game 4
     (3/5 >= 0.5 -> "dry"); volume order puts it as
     [TopX, TopZ, TopA, TopB, TopD], of which only 2 are gone
     (2/5 < 0.5 -> NOT dry). Correct behaviour: Top is NOT dry.

  2. avgTop5GoneByG4 must be measured ONLY at gameNumber == 4
     (picks of games 1-3 gone), with avgTop5GoneByG5 measured
     separately at gameNumber == 5. In this fixture Alpha's top-5
     comfort picks {TopX, J1, TopZ, M1, D1} have 3 gone at Game 4
     and 4 gone at Game 5 of series s1, so the correct values are
     3.0 and 4.0; the old ">= 4" bucket averaged them into 3.5.

  3. sideSplits must bucket each game by the side the team actually
     played. The second fixture below gives Alpha different first
     picks, different bans-against and a different win rate on blue
     (series y1) vs red (series y2), so a side-blind aggregation
     cannot pass; the pre-sideSplits aggregation has no "sideSplits"
     key at all and fails outright.

Run: python3 tools/test_aggregate.py   (exit code 0 = all passed)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aggregate import aggregate  # noqa: E402

ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]
failures = 0


def check(name, cond):
    global failures
    print(("PASS" if cond else "FAIL") + "  " + name)
    if not cond:
        failures += 1


def picks(names, team):
    return [{"champion": c, "role": ROLES[i], "player": team + "-p" + str(i)}
            for i, c in enumerate(names)]


def game(series, gn, blue, red, winner, blue_picks, red_picks):
    return {
        "seriesId": series, "format": "BO5", "gameNumber": gn,
        "blueTeam": blue, "redTeam": red, "winnerTeam": winner,
        "bluePicks": picks(blue_picks, blue), "redPicks": picks(red_picks, red),
        "blueBans": [], "redBans": [],
    }


def filler(tag):
    return [tag + "T", tag + "J", tag + "M", tag + "D", tag + "S"]


records = [
    # s1 — Alpha (blue) vs Beta, 5 games. Alpha wins G1/G2 only.
    game("s1", 1, "alpha", "beta", "alpha",
         ["TopA", "J1", "M1", "D1", "S1"], filler("b1")),
    game("s1", 2, "alpha", "beta", "alpha",
         ["TopB", "J1", "M2", "D2", "S2"], filler("b2")),
    game("s1", 3, "alpha", "beta", "beta",
         ["TopC", "J2", "M1", "D3", "S3"], filler("b3")),
    game("s1", 4, "alpha", "beta", "beta",
         ["TopX", "J3", "M3", "D1", "S4"], filler("b4")),
    game("s1", 5, "alpha", "beta", "beta",
         ["TopE", "J1", "M4", "D4", "S5"], filler("b5")),
    # s2 — Alpha vs Gamma, 3 games, Alpha wins all.
    game("s2", 1, "alpha", "gamma", "alpha",
         ["TopX", "J4", "M5", "D5", "S6"], filler("g1")),
    game("s2", 2, "alpha", "gamma", "alpha",
         ["TopX", "J5", "M6", "D6", "S7"], filler("g2")),
    game("s2", 3, "alpha", "gamma", "alpha",
         ["TopY", "J6", "M7", "D7", "S8"], filler("g3")),
    # s3 — Alpha vs Delta, 3 games, Alpha wins G1/G2.
    game("s3", 1, "alpha", "delta", "alpha",
         ["TopZ", "J7", "M8", "D8", "S9"], filler("d1")),
    game("s3", 2, "alpha", "delta", "alpha",
         ["TopD", "J8", "M9", "D9", "S10"], filler("d2")),
    game("s3", 3, "alpha", "delta", "delta",
         ["TopZ", "J9", "M10", "D10", "S11"], filler("d3")),
]

teams_meta = {t: {"name": t.capitalize(), "tag": t[:2].upper()}
              for t in ("alpha", "beta", "gamma", "delta")}

result = aggregate(records, teams_meta)
alpha = result["profiles"]["alpha"]
late = alpha["lateSeries"]

check("fixture: Alpha played 11 games", alpha["games"] == 11)
check("fixture: Alpha Top pool has TopX at 3 games",
      alpha["rolePools"]["Top"]["champions"]["TopX"]["games"] == 3)
check("lateSeries: exactly one 4+ game series", late["longSeries"] == 1)
check("top5 comfort set is {TopX, J1, TopZ, M1, D1}",
      set(late["top5"]) == {"TopX", "J1", "TopZ", "M1", "D1"})
check("avgTop5GoneByG4 measured ONLY at Game 4 (3.0, not the 3.5 blend)",
      late["avgTop5GoneByG4"] == 3.0)
check("avgTop5GoneByG5 measured at Game 5 (4.0)",
      late["avgTop5GoneByG5"] == 4.0)
check("dryRoles: Top NOT dry under volume-sorted top-5 (2/5 gone < 50%)",
      "Top" not in late["dryRoles"])

# ---------------------------------------------------------------------------
# Side splits fixture: Alpha is BLUE for all of y1 and RED for all of y2,
# with deliberately different tendencies per side.
#   y1 (Alpha blue vs Beta): first pick BlueOpener every game, Beta bans
#     BlueTarget every game, Alpha wins G1 only -> blue 3 games / 1 win.
#   y2 (Alpha red vs Beta): first pick RedOpener every game, Beta bans
#     RedTarget every game, Alpha wins G1+G2 -> red 3 games / 2 wins.
def game_with_bans(series, gn, blue, red, winner, blue_picks, red_picks,
                   blue_bans, red_bans):
    rec = game(series, gn, blue, red, winner, blue_picks, red_picks)
    rec["blueBans"] = blue_bans
    rec["redBans"] = red_bans
    return rec


side_records = [
    game_with_bans("y1", 1, "alpha", "beta", "alpha",
                   ["BlueOpener", "J1", "M1", "D1", "S1"], filler("y1a"),
                   [], ["BlueTarget"]),
    game_with_bans("y1", 2, "alpha", "beta", "beta",
                   ["BlueOpener", "J2", "M2", "D2", "S2"], filler("y1b"),
                   [], ["BlueTarget"]),
    game_with_bans("y1", 3, "alpha", "beta", "beta",
                   ["BlueOpener", "J3", "M3", "D3", "S3"], filler("y1c"),
                   [], ["BlueTarget"]),
    game_with_bans("y2", 1, "beta", "alpha", "alpha",
                   filler("y2a"), ["RedOpener", "J4", "M4", "D4", "S4"],
                   ["RedTarget"], []),
    game_with_bans("y2", 2, "beta", "alpha", "alpha",
                   filler("y2b"), ["RedOpener", "J5", "M5", "D5", "S5"],
                   ["RedTarget"], []),
    game_with_bans("y2", 3, "beta", "alpha", "beta",
                   filler("y2c"), ["RedOpener", "J6", "M6", "D6", "S6"],
                   ["RedTarget"], []),
]
side_alpha = aggregate(side_records, teams_meta)["profiles"]["alpha"]
splits = side_alpha["sideSplits"]
blue_top_fp = list(splits["blue"]["firstPicks"].items())[0]
red_top_fp = list(splits["red"]["firstPicks"].items())[0]
blue_top_ba = list(splits["blue"]["bannedAgainst"].items())[0]
red_top_ba = list(splits["red"]["bannedAgainst"].items())[0]

check("sideSplits: Alpha has 3 blue games and 3 red games",
      splits["blue"]["games"] == 3 and splits["red"]["games"] == 3)
check("sideSplits: blue wins 1, red wins 2 (per-side records differ)",
      splits["blue"]["wins"] == 1 and splits["red"]["wins"] == 2)
check("sideSplits: blue top first pick is BlueOpener x3",
      blue_top_fp == ("BlueOpener", 3))
check("sideSplits: red top first pick is RedOpener x3",
      red_top_fp == ("RedOpener", 3))
check("sideSplits: the two sides' top first picks DIFFER (not side-blind)",
      blue_top_fp[0] != red_top_fp[0])
check("sideSplits: top banned-against differs per side (BlueTarget/RedTarget x3)",
      blue_top_ba == ("BlueTarget", 3) and red_top_ba == ("RedTarget", 3))
check("sideSplits: splits sum back to the overall record (6 games, 3 wins)",
      splits["blue"]["games"] + splits["red"]["games"] == side_alpha["games"] == 6
      and splits["blue"]["wins"] + splits["red"]["wins"] == side_alpha["wins"] == 3)

# Cap fixture: one team plays 7 blue games with 6 distinct first picks;
# the split must keep only the top 5 by count, and the never-played red
# side must come out as a well-formed empty split.
cap_records = []
for i in range(7):
    fp = "CapA" if i < 2 else "Cap" + str(i)  # CapA x2, Cap2..Cap6 x1 each
    cap_records.append(game("cap", i + 1, "solo", "opp", "solo",
                            [fp, "J", "M", "D", "S"], filler("c" + str(i))))
cap_meta = {"solo": {"name": "Solo", "tag": "SO"},
            "opp": {"name": "Opp", "tag": "OP"}}
cap_splits = aggregate(cap_records, cap_meta)["profiles"]["solo"]["sideSplits"]
check("sideSplits: first-pick list is capped at the top 5 by count",
      len(cap_splits["blue"]["firstPicks"]) == 5
      and cap_splits["blue"]["firstPicks"].get("CapA") == 2)
check("sideSplits: a side never played is an empty, well-formed split",
      cap_splits["red"] == {"games": 0, "wins": 0,
                            "firstPicks": {}, "bannedAgainst": {}})

print("\n" + (str(failures) + " FAILURE(S)" if failures else "ALL TESTS PASSED"))
sys.exit(1 if failures else 0)
