/*
 * brief.js — AI Brief Generator （赛前简报）: pure logic, no DOM.
 *
 * Turns one opponent's aggregate profile (data/scouting.json schema, see
 * js/scouting.js) into a structured pre-match brief. Everything is
 * DETERMINISTIC and derived from the aggregates at call time — no
 * hand-written per-team text, no invented numbers: every claim carries
 * the sample size it came from, in the same honesty style as the
 * "How to Win" insight cards.
 *
 * Brief sections:
 *   1. overview     — team record, top first picks, top banned-against
 *   2. banTargets   — top 3 ban targets (win-rate differential evidence)
 *   3. firstPick    — first-pick priorities (+ dataset-relative priority)
 *   4. lateRisk     — Fearless late-series risks (pool exhaustion,
 *                     dry roles, concentrated role pools)
 *   5. seriesPlan   — a Game 1–5 draft plan that shifts as Fearless
 *                     bans accumulate, derived from the sections above
 *
 * Environment-agnostic: module.exports under Node, window.BriefGen in
 * browsers (same pattern as draft.js / scouting.js).
 */
(function (global) {
  "use strict";

  var RULES = {
    banTargetMinPicked: 5,     // preferred evidence floor for a ban target
    banTargetFallbacks: [3, 1],// relax the floor until targets exist
    shallowTop2Share: 0.7,     // same threshold as scouting.js Rule 4
    shallowMinRoleGames: 20
  };

  function profileOf(data, teamId) {
    return (data.profiles || {})[teamId] || null;
  }

  function teamOf(data, teamId) {
    return (data.teams || []).find(function (t) { return t.id === teamId; }) || null;
  }

  function sortedCounts(obj, limit) {
    return Object.keys(obj || {})
      .map(function (k) { return { champion: k, count: obj[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.champion < b.champion ? -1 : 1); })
      .slice(0, limit || 10);
  }

  function pct(x) { return Math.round(x * 100) + "%"; }
  function pts(x) { return (x >= 0 ? "+" : "") + Math.round(x * 100) + " pts"; }

  /* --- Section 2: ban targets -------------------------------------------
   * Ranked by win-rate differential (with vs. without the champion),
   * the same evidence the scouting "Ban" cards use, but returned as
   * structured data so the brief can build a series plan on top of it. */
  function banTargets(p, n) {
    var floors = [RULES.banTargetMinPicked].concat(RULES.banTargetFallbacks);
    for (var f = 0; f < floors.length; f++) {
      var out = [];
      Object.keys(p.tendencies || {}).forEach(function (champ) {
        var t = p.tendencies[champ];
        if (t.pickedGames < floors[f] || !t.pickedGames) return;
        var wrWith = t.pickedWins / t.pickedGames;
        var wrWithout = t.unpickedGames ? t.unpickedWins / t.unpickedGames : 0;
        out.push({
          champion: champ,
          pickedGames: t.pickedGames,
          pickedWins: t.pickedWins,
          wrWith: wrWith,
          unpickedGames: t.unpickedGames,
          wrWithout: wrWithout,
          diff: wrWith - wrWithout,
          bannedAgainstGames: t.bannedAgainstGames,
          n: t.pickedGames
        });
      });
      out.sort(function (a, b) {
        return (b.diff - a.diff) || (b.pickedGames - a.pickedGames) ||
               (a.champion < b.champion ? -1 : 1);
      });
      if (out.length) return out.slice(0, 3);
    }
    return [];
  }

  /* --- Section 3 helper: dataset-relative first-pick priority ----------
   * Same construction as scouting.js Rule 2: a champion this team
   * first-picks at >= 2x the rate of the whole dataset. */
  function firstPickPriority(data, p, n) {
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
      if (count < 7 || !globalGames) return;
      var globalShare = (globalCount[champ] || 0) / globalGames;
      if (!globalShare) return;
      var ratio = (count / n) / globalShare;
      if (ratio >= 2.0 && (!best || ratio > best.ratio)) {
        best = { champion: champ, count: count, teamShare: count / n,
                 globalShare: globalShare, ratio: ratio, n: n };
      }
    });
    return best;
  }

  /* --- Section 4: late-series risk -------------------------------------- */
  function lateRisk(p) {
    var late = p.lateSeries || null;
    var shift = p.fearlessShift || { seriesCount: 0, byGame: [] };
    var g3 = shift.byGame.find(function (r) { return r.gameNumber === 3; }) || null;
    var g5 = shift.byGame.find(function (r) { return r.gameNumber === 5; }) || null;

    // Concentrated role pools (same rule as scouting.js Rule 4).
    var shallowRoles = [];
    Object.keys(p.rolePools || {}).forEach(function (role) {
      var raw = p.rolePools[role];
      var champs = Object.keys(raw.champions).map(function (k) {
        return { champion: k, games: raw.champions[k].games, wins: raw.champions[k].wins };
      }).sort(function (a, b) { return b.games - a.games; });
      var total = champs.reduce(function (s, c) { return s + c.games; }, 0);
      if (total < RULES.shallowMinRoleGames || champs.length < 2) return;
      var share2 = (champs[0].games + champs[1].games) / total;
      if (share2 >= RULES.shallowTop2Share) {
        shallowRoles.push({
          role: role, total: total, top2Share: share2,
          champions: [champs[0].champion, champs[1].champion], n: total
        });
      }
    });

    // Thinnest roles by distinct champions played (pool depth evidence).
    var depth = Object.keys(p.rolePools || {}).map(function (role) {
      return { role: role, distinct: p.rolePools[role].distinct };
    }).sort(function (a, b) { return a.distinct - b.distinct; });

    return {
      longSeries: late ? late.longSeries : 0,
      avgTop5GoneByG4: late ? late.avgTop5GoneByG4 : 0,
      top5: late ? late.top5 : [],
      dryRoles: late ? (late.dryRoles || []) : [],
      seriesCount: shift.seriesCount || 0,
      g3RemovedAvg: g3 ? g3.removedAvg : null,
      g3PoolRemovedAvg: g3 ? g3.poolRemovedAvg : null,
      g5PoolRemovedAvg: g5 ? g5.poolRemovedAvg : null,
      shallowRoles: shallowRoles,
      thinnestRoles: depth.slice(0, 2)
    };
  }

  /* --- Section 5: the Game 1–5 plan --------------------------------------
   * Each step is assembled from the sections above; every point string
   * embeds the numbers it rests on. */
  function seriesPlan(data, p, n, targets, fp, risk, nameOf, teamName) {
    var shift = p.fearlessShift || { byGame: [] };
    var g1Row = shift.byGame.find(function (r) { return r.gameNumber === 1; });
    var g3Row = shift.byGame.find(function (r) { return r.gameNumber === 3; });
    var plan = [];

    // Game 1 — full pool: hit the #1 comfort pick, contest the opener.
    var g1 = [];
    if (targets.length) {
      g1.push("Open the ban phase on " + nameOf(targets[0].champion) + ": " +
        teamName + " won " + pct(targets[0].wrWith) + " in " + targets[0].pickedGames +
        " picks with it vs. " + pct(targets[0].wrWithout) + " without (" +
        pts(targets[0].diff) + ", n=" + targets[0].pickedGames + ").");
    }
    if (fp.priority) {
      g1.push("Deny the first-pick priority " + nameOf(fp.priority.champion) +
        " (first-picked " + fp.priority.count + "/" + n + " games, " +
        Math.round(fp.priority.ratio * 10) / 10 + "× the dataset rate) — " +
        "ban it or take it away.");
    } else if (fp.rows.length) {
      g1.push("Their most common opener is " + nameOf(fp.rows[0].champion) +
        " (" + fp.rows[0].count + "/" + n + " first picks) — have the " +
        "counter or the trade prepared.");
    }
    g1.push("Full 173-champion pool: this is the only game where their " +
      "whole comfort pool is available, so spend bans on evidence, not habits.");
    plan.push({ game: 1, title: "Game 1 — hit the comfort picks", points: g1 });

    // Game 2 — their Game-1 identity is fearless-banned.
    var g2 = [];
    if (g1Row && g1Row.topPicks) {
      var gone = sortedCounts(g1Row.topPicks, 3).map(function (r) {
        return nameOf(r.champion) + " ×" + r.count;
      }).join(", ");
      g2.push("10 champions are fearless-banned now. Their most-picked " +
        "Game-1 champions across " + (g1Row.seriesN || risk.seriesCount) +
        " series (" + gone + ") are exactly the ones that disappear first.");
    }
    if (targets.length > 1) {
      g2.push("Promote ban target #2, " + nameOf(targets[1].champion) +
        " (" + pts(targets[1].diff) + " differential, n=" + targets[1].pickedGames +
        "), if it survived Game 1 unpicked.");
    }
    g2.push("Expect their draft to slide one tier down the same roles — " +
      "keep the Game-1 ban plan, re-ranked, rather than reinventing it.");
    plan.push({ game: 2, title: "Game 2 — same plan, one tier down", points: g2 });

    // Game 3 — the measured Fearless shift.
    var g3 = [];
    if (g3Row) {
      g3.push("Measured shift: entering Game 3 they have already lost an " +
        "average of " + g3Row.removedAvg + " of their own earlier picks, " +
        "and the shared pool is down " + g3Row.poolRemovedAvg + " champions " +
        "(across " + (g3Row.seriesN || risk.seriesCount) + " series).");
      var g3Top = sortedCounts(g3Row.topPicks, 3).map(function (r) {
        return nameOf(r.champion) + " ×" + r.count;
      }).join(", ");
      if (g3Top) g3.push("Their Game-3 drafts migrate toward: " + g3Top +
        ". Pre-draft answers for those, not for their Game-1 selves.");
    }
    if (risk.shallowRoles.length) {
      var sh = risk.shallowRoles[0];
      g3.push("Start pinching the " + sh.role + " pool: " + nameOf(sh.champions[0]) +
        " + " + nameOf(sh.champions[1]) + " cover " + pct(sh.top2Share) +
        " of its " + sh.total + " games (n=" + sh.n + ") — phase-2 bans bite now.");
    }
    plan.push({ game: 3, title: "Game 3 — draft against the migrated pool", points: g3.length ? g3 : [
      "No Game-3 series sample for this team in the dataset — plan from " +
      "the ban targets and role depth above."] });

    // Game 4 — pool exhaustion is now the opponent's problem.
    var g4 = [];
    if (risk.longSeries > 0 && risk.avgTop5GoneByG4 > 0) {
      g4.push("In " + risk.longSeries + " series that reached Game 4+, an " +
        "average of " + risk.avgTop5GoneByG4 + " of their top-5 comfort " +
        "picks (" + risk.top5.map(nameOf).join(", ") + ") were already " +
        "fearless-banned by Game 4 (n=" + risk.longSeries + " series).");
    }
    if (risk.dryRoles.length) {
      g4.push("Roles that run dry first for them: " + risk.dryRoles.join(", ") +
        " — aim the second ban phase there and force off-comfort picks.");
    }
    if (risk.thinnestRoles.length) {
      g4.push("Thinnest pools by distinct champions played: " +
        risk.thinnestRoles.map(function (r) {
          return r.role + " (" + r.distinct + " distinct)";
        }).join(", ") + ".");
    }
    plan.push({ game: 4, title: "Game 4 — attack the dry roles", points: g4.length ? g4 : [
      "No Game-4+ series sample for this team in the dataset — keep " +
      "pressure on the shallowest role pools from section 4."] });

    // Game 5 — the decider is won in preparation.
    var g5 = [];
    g5.push("40 champions are fearless-banned before this draft starts" +
      (risk.g5PoolRemovedAvg != null
        ? " (their series history shows an average shared-pool loss of " +
          risk.g5PoolRemovedAvg + " champions by Game 5)"
        : "") + ".");
    if (risk.dryRoles.length) {
      g5.push("Have two pocket picks rehearsed in " + risk.dryRoles.join(" and ") +
        " — those roles decide Game 5 for both teams.");
    }
    if (targets.length > 2) {
      g5.push("If " + nameOf(targets[2].champion) + " is somehow still " +
        "available (" + pts(targets[2].diff) + ", n=" + targets[2].pickedGames +
        "), it is the highest-value remaining ban or takeaway.");
    }
    g5.push("Draft for comfort over meta: with the pool at ~77%, the team " +
      "that prepared deeper pools wins this game in the draft room.");
    plan.push({ game: 5, title: "Game 5 — depth wins the decider", points: g5 });

    return plan;
  }

  /*
   * generateBrief(data, teamId, nameOf?) -> brief object or null.
   * nameOf maps champion ids to display names (defaults to identity).
   */
  function generateBrief(data, teamId, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    var team = teamOf(data, teamId);
    var p = profileOf(data, teamId);
    if (!team || !p || !p.games) return null;
    var n = p.games;

    var fpRows = sortedCounts(p.firstPicks, 3).map(function (r) {
      return { champion: r.champion, count: r.count, share: r.count / n, n: n };
    });
    var baRows = sortedCounts(p.bannedAgainst, 3).map(function (r) {
      return { champion: r.champion, count: r.count, share: r.count / n, n: n };
    });
    var targets = banTargets(p, n);
    var fp = { rows: fpRows, priority: firstPickPriority(data, p, n) };
    var risk = lateRisk(p);
    var plan = seriesPlan(data, p, n, targets, fp, risk, nameOf, team.name);

    return {
      teamId: teamId,
      teamName: team.name,
      tag: team.tag,
      datasetKind: data.meta ? data.meta.kind : null,
      overview: {
        games: n, wins: p.wins, winRate: p.wins / n,
        topFirstPicks: fpRows, topBannedAgainst: baRows, n: n
      },
      banTargets: targets,
      firstPick: fp,
      lateRisk: risk,
      seriesPlan: plan
    };
  }

  /* Plain-text export of a brief (Copy brief / LLM fact sheet). */
  function briefToText(brief, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    if (!brief) return "";
    var o = brief.overview;
    var lines = [];
    lines.push("PRE-MATCH BRIEF — vs. " + brief.teamName + " (" + brief.tag + ")");
    lines.push("Dataset: " + o.games + " games, " + o.wins + " wins (" +
      pct(o.winRate) + "). Generated locally from aggregate data; every " +
      "number below carries its sample size.");
    lines.push("");
    lines.push("1) OVERALL TENDENCIES");
    lines.push("   Top first picks: " + o.topFirstPicks.map(function (r) {
      return nameOf(r.champion) + " ×" + r.count + " (" + pct(r.share) + " of " + r.n + ")";
    }).join(", "));
    lines.push("   Most banned against them: " + o.topBannedAgainst.map(function (r) {
      return nameOf(r.champion) + " ×" + r.count + " (" + pct(r.share) + " of games)";
    }).join(", "));
    lines.push("");
    lines.push("2) TOP 3 BAN TARGETS");
    brief.banTargets.forEach(function (t, i) {
      lines.push("   " + (i + 1) + ". " + nameOf(t.champion) + " — picked " +
        t.pickedGames + "×, won " + pct(t.wrWith) + " with it vs. " +
        pct(t.wrWithout) + " without (" + pts(t.diff) + ", n=" + t.n + ")");
    });
    lines.push("");
    lines.push("3) FIRST-PICK PRIORITY");
    if (brief.firstPick.priority) {
      var pr = brief.firstPick.priority;
      lines.push("   " + nameOf(pr.champion) + ": first-picked " + pr.count +
        "/" + pr.n + " games (" + pct(pr.teamShare) + ") — " +
        (Math.round(pr.ratio * 10) / 10) + "× the dataset-wide rate (" +
        pct(pr.globalShare) + "). Deny or pre-draft the counter.");
    } else {
      lines.push("   No champion clears the 2× dataset-rate priority bar; " +
        "their most common opener is " +
        (brief.firstPick.rows.length
          ? nameOf(brief.firstPick.rows[0].champion) + " (" +
            brief.firstPick.rows[0].count + "/" + brief.firstPick.rows[0].n + ")"
          : "—") + ".");
    }
    lines.push("");
    lines.push("4) FEARLESS LATE-SERIES RISK");
    var r = brief.lateRisk;
    if (r.longSeries > 0) {
      lines.push("   Pool exhaustion: by Game 4, an average of " +
        r.avgTop5GoneByG4 + " of their top-5 comfort picks (" +
        r.top5.map(nameOf).join(", ") + ") are fearless-banned (n=" +
        r.longSeries + " long series). Dry roles first: " +
        (r.dryRoles.join(", ") || "—") + ".");
    }
    if (r.g3RemovedAvg != null) {
      lines.push("   By Game 3 they have lost an average of " + r.g3RemovedAvg +
        " of their own picks; shared pool down " + r.g3PoolRemovedAvg +
        " (n=" + r.seriesCount + " series).");
    }
    r.shallowRoles.forEach(function (sh) {
      lines.push("   Concentrated " + sh.role + " pool: " +
        nameOf(sh.champions[0]) + " + " + nameOf(sh.champions[1]) + " = " +
        pct(sh.top2Share) + " of " + sh.total + " games (n=" + sh.n + ").");
    });
    lines.push("");
    lines.push("5) SERIES PLAN (G1–G5)");
    brief.seriesPlan.forEach(function (step) {
      lines.push("   " + step.title);
      step.points.forEach(function (pt) { lines.push("     - " + pt); });
    });
    return lines.join("\n");
  }

  var api = {
    RULES: RULES,
    generateBrief: generateBrief,
    briefToText: briefToText
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BriefGen = api;
})(typeof window !== "undefined" ? window : globalThis);
