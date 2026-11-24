/*
 * scouting.js — tendency analytics over precomputed team profiles.
 *
 * The bundled dataset (data/scouting.json) contains AGGREGATES ONLY,
 * computed offline by tools/build_scouting_from_grid.py (real GRID data)
 * or tools/generate_sample_data.py (clearly-labeled sample data). See
 * README "Data provenance" for why no per-game records are shipped.
 *
 * Every aggregate carries its sample size, and every "How to Win" card
 * prints the evidence it was derived from. Cards are RULE-GENERATED from
 * the aggregates — thresholds are the explicit constants below and
 * nothing is hardcoded per team.
 *
 * Profile schema (per team):
 *   games, wins,
 *   firstPicks:      { champ: count }
 *   bannedAgainst:   { champ: count }              // games banned vs them
 *   rolePools:       { role: { distinct, champions: { champ: {games, wins} } } }
 *   tendencies:      { champ: { pickedGames, pickedWins, unpickedGames,
 *                               unpickedWins, bannedAgainstGames,
 *                               bannedAgainstWins } }
 *   fearlessShift:   { seriesCount, byGame: [{ gameNumber, topPicks,
 *                               removedAvg, poolRemovedAvg, seriesN }] }
 *   lateSeries:      { longSeries, avgTop5GoneByG4, avgTop5GoneByG5,
 *                      top5, dryRoles }
 *   sideSplits:      { blue: { games, wins, firstPicks, bannedAgainst },
 *                      red:  { games, wins, firstPicks, bannedAgainst } }
 *                    // per-side splits; the two count tables hold only
 *                    // the top 5 champions by count (see aggregate.py)
 */
(function (global) {
  "use strict";

  /* Localization hooks (js/i18n.js), resolved lazily like copilot.js
   * resolves DraftCore. Card text is generated in the active locale;
   * champion display names come from the optional nameOf argument. */
  function T(key, params) {
    var I = global.I18n;
    return I && typeof I.t === "function" ? I.t(key, params) : key;
  }
  function roleName(r) {
    var I = global.I18n;
    return I && typeof I.role === "function" ? I.role(r) : r;
  }

  var INSIGHT_RULES = {
    comfortMinTeamGames: 20,    // team sample needed for a comfort claim
    comfortPickGames: 8,        // champion picked in >= this many games
    comfortWinRate: 0.7,        // ...won >= 70% of those
    comfortDiff: 0.12,          // ...and >= 12 pts better than without it
    comfortMaxCards: 3,
    firstPickMinCount: 7,       // first-picked at least this often...
    firstPickRatio: 2.0,        // ...at >= 2x the dataset-wide rate for it
    wastedBanMinBans: 6,        // banned-against at least this many games
    wastedBanEdge: 0.05,        // WR in those games >= baseline + 5 pts
    wastedBanMaxCards: 3,
    shallowTop2Share: 0.7,      // role's top-2 champions cover >= 70%...
    shallowMinRoleGames: 20,    // ...of >= 20 games at that role
    fearlessMinSeries: 2        // series of 3+ games needed for a shift claim
  };

  function teamById(data, teamId) {
    return data.teams.find(function (t) { return t.id === teamId; }) || null;
  }

  function profile(data, teamId) {
    return (data.profiles || {})[teamId] || null;
  }

  /* Champion win rate / presence across the dataset (draft heuristic). */
  function championStats(data) {
    return data.championStats || {};
  }

  function sortedCounts(obj, limit) {
    return Object.keys(obj || {})
      .map(function (k) { return { champion: k, count: obj[k] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 10);
  }

  /* --- Tendency tables ------------------------------------------------- */

  function firstPickFrequency(data, teamId, limit) {
    var p = profile(data, teamId);
    if (!p) return { n: 0, rows: [] };
    return { n: p.games, rows: sortedCounts(p.firstPicks, limit || 5) };
  }

  function bannedAgainst(data, teamId, limit) {
    var p = profile(data, teamId);
    if (!p) return { n: 0, rows: [] };
    return { n: p.games, rows: sortedCounts(p.bannedAgainst, limit || 8) };
  }

  function rolePools(data, teamId) {
    var team = teamById(data, teamId);
    var p = profile(data, teamId);
    var out = {};
    if (!p) return out;
    Object.keys(p.rolePools || {}).forEach(function (role) {
      var pool = p.rolePools[role];
      out[role] = {
        player: team && team.players ? team.players[role] : null,
        distinct: pool.distinct,
        champions: Object.keys(pool.champions)
          .map(function (champ) {
            var c = pool.champions[champ];
            return { champion: champ, games: c.games, wins: c.wins,
                     winRate: c.games ? c.wins / c.games : 0 };
          })
          .sort(function (a, b) { return b.games - a.games; })
          .slice(0, 5)
      };
    });
    return out;
  }

  /* Per-side (blue / red) splits: record, win rate and the top-5
   * first-pick / banned-against tables for each side. Returns null
   * when the loaded dataset carries no side splits for the team. */
  function sideSplits(data, teamId) {
    var p = profile(data, teamId);
    if (!p || !p.sideSplits) return null;
    var norm = function (s) {
      s = s || {};
      return {
        games: s.games || 0,
        wins: s.wins || 0,
        winRate: s.games ? s.wins / s.games : 0,
        firstPicks: sortedCounts(s.firstPicks, 5),
        bannedAgainst: sortedCounts(s.bannedAgainst, 5)
      };
    };
    return { blue: norm(p.sideSplits.blue), red: norm(p.sideSplits.red) };
  }

  function fearlessShift(data, teamId) {
    var p = profile(data, teamId);
    if (!p || !p.fearlessShift) return { seriesCount: 0, byGame: [] };
    return {
      seriesCount: p.fearlessShift.seriesCount,
      byGame: p.fearlessShift.byGame.map(function (row) {
        return {
          gameNumber: row.gameNumber,
          topPicks: sortedCounts(row.topPicks, 5),
          removedCount: row.removedAvg,
          poolRemoved: row.poolRemovedAvg,
          seriesN: row.seriesN
        };
      })
    };
  }

  /* --- "How to Win" insight cards (rule-generated, evidence attached) -- */

  function insights(data, teamId, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    var R = INSIGHT_RULES;
    var team = teamById(data, teamId);
    var p = profile(data, teamId);
    var cards = [];
    if (!team || !p || !p.games) return cards;
    var n = p.games;
    var teamName = team.name;
    var pct = function (x) { return Math.round(x * 100) + "%"; };

    var baseline = n ? p.wins / n : 0;
    var comfortChamps = {}; // champions with a Ban card; wasted-ban skips them

    // Rule 1 — comfort pick (Ban suggestion): frequent + winning, with the
    // win-rate DIFFERENTIAL (with vs without the champion) as evidence.
    // Capped at the strongest few — a coach wants targets, not a phone book.
    if (n >= R.comfortMinTeamGames) {
      var comfort = [];
      Object.keys(p.tendencies || {}).forEach(function (champ) {
        var t = p.tendencies[champ];
        if (t.pickedGames < R.comfortPickGames) return;
        var rate = t.pickedGames / n;
        var wrWith = t.pickedWins / t.pickedGames;
        var wrWithout = t.unpickedGames ? t.unpickedWins / t.unpickedGames : 0;
        if (wrWith >= R.comfortWinRate &&
            (wrWith - wrWithout) >= R.comfortDiff) {
          comfort.push({ champ: champ, t: t, rate: rate, wrWith: wrWith,
                         wrWithout: wrWithout, diff: wrWith - wrWithout });
        }
      });
      comfort.sort(function (a, b) { return b.diff - a.diff; });
      comfort.slice(0, R.comfortMaxCards).forEach(function (c) {
        comfortChamps[c.champ] = true;
        cards.push({
          type: "ban-target",
          title: T("insight.banTitle", { champ: nameOf(c.champ) }),
          body: T("insight.banBody", {
            team: teamName, champ: nameOf(c.champ), picked: c.t.pickedGames,
            n: n, rate: pct(c.rate), wrWith: pct(c.wrWith),
            wrWithout: pct(c.wrWithout), unpicked: c.t.unpickedGames,
            diff: Math.round(c.diff * 100)
          }),
          // Sample badge = the champion's picked-games sample the
          // differential rests on (matches brief.js ban targets),
          // not the team's total game count.
          n: c.t.pickedGames
        });
      });
    }

    // Rule 2 — first-pick priority: a champion this team first-picks far
    // more often than the dataset at large does. The comparison baseline
    // is computed across every profiled team, so the claim is relative,
    // not an absolute-share guess.
    (function () {
      var globalCount = {}, globalGames = 0;
      Object.keys(data.profiles || {}).forEach(function (tid) {
        var prof = data.profiles[tid];
        globalGames += prof.games;
        Object.keys(prof.firstPicks || {}).forEach(function (c) {
          globalCount[c] = (globalCount[c] || 0) + prof.firstPicks[c];
        });
      });
      var best = null;
      Object.keys(p.firstPicks || {}).forEach(function (champ) {
        var count = p.firstPicks[champ];
        if (count < R.firstPickMinCount || !globalGames) return;
        var teamShare = count / n;
        var globalShare = (globalCount[champ] || 0) / globalGames;
        if (!globalShare) return;
        var ratio = teamShare / globalShare;
        if (ratio >= R.firstPickRatio && (!best || ratio > best.ratio)) {
          best = { champ: champ, count: count, teamShare: teamShare,
                   globalShare: globalShare, ratio: ratio };
        }
      });
      if (best) {
        cards.push({
          type: "first-pick",
          title: T("insight.fpTitle", { champ: nameOf(best.champ) }),
          body: T("insight.fpBody", {
            team: teamName, champ: nameOf(best.champ), count: best.count,
            n: n, share: pct(best.teamShare),
            ratio: Math.round(best.ratio * 10) / 10,
            global: pct(best.globalShare)
          }),
          n: n
        });
      }
    })();

    // Rule 3 — wasted ban: banned against often, yet the team wins those
    // games at a rate ABOVE its own baseline (the ban isn't hurting them).
    var wasted = [];
    Object.keys(p.tendencies || {}).forEach(function (champ) {
      var t = p.tendencies[champ];
      if (comfortChamps[champ]) return; // Ban card already covers this one
      if (t.bannedAgainstGames < R.wastedBanMinBans) return;
      var wr = t.bannedAgainstWins / t.bannedAgainstGames;
      if (wr >= baseline + R.wastedBanEdge) {
        wasted.push({ champ: champ, t: t, wr: wr, edge: wr - baseline });
      }
    });
    wasted.sort(function (a, b) {
      return (b.t.bannedAgainstGames * b.edge) - (a.t.bannedAgainstGames * a.edge);
    });
    wasted.slice(0, R.wastedBanMaxCards).forEach(function (w) {
      cards.push({
        type: "wasted-ban",
        title: T("insight.wastedTitle", { champ: nameOf(w.champ) }),
        body: T("insight.wastedBody", {
          champ: nameOf(w.champ), team: teamName,
          bans: w.t.bannedAgainstGames, wins: w.t.bannedAgainstWins,
          wr: pct(w.wr), baseline: pct(baseline)
        }),
        n: w.t.bannedAgainstGames
      });
    });

    // Rule 4 — concentrated role pool: a role where two champions cover
    // almost everything is a phase-2 ban target, however wide the full
    // pool looks over a long season.
    var pools = rolePools(data, teamId);
    Object.keys(pools).forEach(function (role) {
      var pool = pools[role];
      var roleGames = pool.champions.reduce(function (s, c) { return s + c.games; }, 0);
      // roleGames only counts the top-5 shown; recompute from raw profile:
      var raw = (p.rolePools || {})[role];
      if (!raw) return;
      var total = Object.keys(raw.champions).reduce(function (s, k) {
        return s + raw.champions[k].games;
      }, 0);
      if (total < R.shallowMinRoleGames || pool.champions.length < 2) return;
      var top2 = pool.champions[0].games + pool.champions[1].games;
      var share2 = top2 / total;
      if (share2 >= R.shallowTop2Share) {
        var pinchParams = {
          team: teamName, role: roleName(role),
          c1: nameOf(pool.champions[0].champion),
          c2: nameOf(pool.champions[1].champion),
          share: pct(share2), total: total
        };
        if (pool.player) pinchParams.player = pool.player;
        cards.push({
          type: "shallow-pool",
          title: T("insight.pinchTitle", { role: roleName(role) }),
          body: pool.player
            ? T("insight.pinchBodyPlayer", pinchParams)
            : T("insight.pinchBody", pinchParams),
          n: total
        });
      }
    });

    // Rule 5 — Fearless depth by Game 3.
    var shift = fearlessShift(data, teamId);
    if (shift.seriesCount >= R.fearlessMinSeries) {
      var g3 = shift.byGame.find(function (x) { return x.gameNumber === 3; });
      if (g3 && g3.removedCount > 0) {
        cards.push({
          type: "fearless-depth",
          title: T("insight.fearlessTitle"),
          body: T("insight.fearlessBody", {
            series: shift.seriesCount, team: teamName,
            removed: g3.removedCount, pool: g3.poolRemoved
          }),
          n: shift.seriesCount
        });
      }
    }

    // Rule 6 — Late-series pool exhaustion (Game 4/5 warning): how much of
    // the team's top-5 comfort pool is already gone when a series goes to
    // a 4th game, and which roles run dry first. The Fearless-specific edge.
    var late = p.lateSeries;
    if (late && late.longSeries >= 1 && late.avgTop5GoneByG4 > 0) {
      cards.push({
        type: "pool-exhaustion",
        title: T("insight.exhaustTitle"),
        body: T("insight.exhaustMain", {
            series: late.longSeries, avg: late.avgTop5GoneByG4,
            team: teamName, top5: late.top5.map(nameOf).join(", ")
          }) +
          (late.dryRoles && late.dryRoles.length
            ? T("insight.exhaustDry", {
                // dryRoles is ordered most-critical first; naming
                // all of them says nothing — cap at the top 2.
                roles: late.dryRoles.slice(0, 2).map(roleName).join(", ")
              })
            : T("insight.exhaustNoDry")),
        n: late.longSeries
      });
    }

    return cards;
  }

  var api = {
    INSIGHT_RULES: INSIGHT_RULES,
    teamById: teamById,
    profile: profile,
    championStats: championStats,
    firstPickFrequency: firstPickFrequency,
    bannedAgainst: bannedAgainst,
    sideSplits: sideSplits,
    rolePools: rolePools,
    fearlessShift: fearlessShift,
    insights: insights
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Scouting = api;
})(typeof window !== "undefined" ? window : globalThis);
