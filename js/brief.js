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

  /* Localization hooks (js/i18n.js), resolved lazily at call time.
   * All template sentences below are dictionary entries; the numbers
   * interpolated into them are the same aggregates in every locale. */
  function T(key, params) {
    var I = global.I18n;
    return I && typeof I.t === "function" ? I.t(key, params) : key;
  }
  function roleName(r) {
    var I = global.I18n;
    return I && typeof I.role === "function" ? I.role(r) : r;
  }

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
  function pts(x) { return T("common.pts", { v: (x >= 0 ? "+" : "") + Math.round(x * 100) }); }

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
  function seriesPlan(data, p, n, targets, fp, risk, nameOf, teamName, totalChampions) {
    var shift = p.fearlessShift || { byGame: [] };
    var g1Row = shift.byGame.find(function (r) { return r.gameNumber === 1; });
    var g3Row = shift.byGame.find(function (r) { return r.gameNumber === 3; });
    var plan = [];

    // Game 1 — full pool: hit the #1 comfort pick, contest the opener.
    var g1 = [];
    if (targets.length) {
      g1.push(T("plan.g1Ban", {
        champ: nameOf(targets[0].champion), team: teamName,
        wrWith: pct(targets[0].wrWith), picked: targets[0].pickedGames,
        wrWithout: pct(targets[0].wrWithout), diff: pts(targets[0].diff),
        n: targets[0].pickedGames
      }));
    }
    if (fp.priority) {
      g1.push(T("plan.g1Deny", {
        champ: nameOf(fp.priority.champion), count: fp.priority.count, n: n,
        ratio: Math.round(fp.priority.ratio * 10) / 10
      }));
    } else if (fp.rows.length) {
      g1.push(T("plan.g1Opener", {
        champ: nameOf(fp.rows[0].champion), count: fp.rows[0].count, n: n
      }));
    }
    // The pool size is wired in by the caller (the app passes the
    // champion roster length); never hardcoded here. Without a wired
    // count, the point falls back to the number-free wording.
    g1.push(totalChampions
      ? T("plan.g1Full", { total: totalChampions })
      : T("plan.g1FullBare"));
    plan.push({ game: 1, title: T("plan.g1Title"), points: g1 });

    // Game 2 — their Game-1 identity is fearless-banned.
    var g2 = [];
    if (g1Row && g1Row.topPicks) {
      var gone = sortedCounts(g1Row.topPicks, 3).map(function (r) {
        return nameOf(r.champion) + " ×" + r.count;
      }).join(", ");
      g2.push(T("plan.g2Gone", {
        series: g1Row.seriesN || risk.seriesCount, gone: gone
      }));
    }
    if (targets.length > 1) {
      g2.push(T("plan.g2Promote", {
        champ: nameOf(targets[1].champion), diff: pts(targets[1].diff),
        n: targets[1].pickedGames
      }));
    }
    g2.push(T("plan.g2Slide"));
    plan.push({ game: 2, title: T("plan.g2Title"), points: g2 });

    // Game 3 — the measured Fearless shift.
    var g3 = [];
    if (g3Row) {
      g3.push(T("plan.g3Shift", {
        removed: g3Row.removedAvg, pool: g3Row.poolRemovedAvg,
        series: g3Row.seriesN || risk.seriesCount
      }));
      var g3Top = sortedCounts(g3Row.topPicks, 3).map(function (r) {
        return nameOf(r.champion) + " ×" + r.count;
      }).join(", ");
      if (g3Top) g3.push(T("plan.g3Migrate", { list: g3Top }));
    }
    if (risk.shallowRoles.length) {
      var sh = risk.shallowRoles[0];
      g3.push(T("plan.g3Pinch", {
        role: roleName(sh.role), c1: nameOf(sh.champions[0]),
        c2: nameOf(sh.champions[1]), share: pct(sh.top2Share),
        total: sh.total, n: sh.n
      }));
    }
    plan.push({ game: 3, title: T("plan.g3Title"), points: g3.length ? g3 : [
      T("plan.g3None")] });

    // Game 4 — pool exhaustion is now the opponent's problem.
    var g4 = [];
    if (risk.longSeries > 0 && risk.avgTop5GoneByG4 > 0) {
      g4.push(T("plan.g4Exhaust", {
        series: risk.longSeries, avg: risk.avgTop5GoneByG4,
        top5: risk.top5.map(nameOf).join(", "), n: risk.longSeries
      }));
    }
    if (risk.dryRoles.length) {
      g4.push(T("plan.g4Dry", {
        roles: risk.dryRoles.map(roleName).join(", ")
      }));
    }
    if (risk.thinnestRoles.length) {
      g4.push(T("plan.g4Thin", {
        list: risk.thinnestRoles.map(function (r) {
          return T("plan.thinItem", { role: roleName(r.role), distinct: r.distinct });
        }).join(", ")
      }));
    }
    plan.push({ game: 4, title: T("plan.g4Title"), points: g4.length ? g4 : [
      T("plan.g4None")] });

    // Game 5 — the decider is won in preparation.
    var g5 = [];
    g5.push(T("plan.g5Gone", {
      extra: risk.g5PoolRemovedAvg != null
        ? T("plan.g5Extra", { pool: risk.g5PoolRemovedAvg })
        : ""
    }));
    if (risk.dryRoles.length) {
      g5.push(T("plan.g5Pocket", {
        roles: risk.dryRoles.map(roleName).join(T("common.andJoin"))
      }));
    }
    if (targets.length > 2) {
      g5.push(T("plan.g5Target", {
        champ: nameOf(targets[2].champion), diff: pts(targets[2].diff),
        n: targets[2].pickedGames
      }));
    }
    g5.push(T("plan.g5Comfort"));
    plan.push({ game: 5, title: T("plan.g5Title"), points: g5 });

    return plan;
  }

  /*
   * generateBrief(data, teamId, nameOf?, totalChampions?) -> brief or null.
   * nameOf maps champion ids to display names (defaults to identity).
   * totalChampions is the full champion-pool size, wired in by the
   * caller (or data.totalChampions); it is never hardcoded here.
   */
  function generateBrief(data, teamId, nameOf, totalChampions) {
    nameOf = nameOf || function (id) { return id; };
    var team = teamOf(data, teamId);
    var p = profileOf(data, teamId);
    if (!team || !p || !p.games) return null;
    var n = p.games;
    var total = (typeof totalChampions === "number" && totalChampions > 0)
      ? totalChampions
      : (typeof data.totalChampions === "number" && data.totalChampions > 0
          ? data.totalChampions : null);

    var fpRows = sortedCounts(p.firstPicks, 3).map(function (r) {
      return { champion: r.champion, count: r.count, share: r.count / n, n: n };
    });
    var baRows = sortedCounts(p.bannedAgainst, 3).map(function (r) {
      return { champion: r.champion, count: r.count, share: r.count / n, n: n };
    });
    var targets = banTargets(p, n);
    var fp = { rows: fpRows, priority: firstPickPriority(data, p, n) };
    var risk = lateRisk(p);
    var plan = seriesPlan(data, p, n, targets, fp, risk, nameOf, team.name, total);

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
    lines.push(T("brief.textTitle", { team: brief.teamName, tag: brief.tag }));
    lines.push(T("brief.textDataset", {
      games: o.games, wins: o.wins, wr: pct(o.winRate)
    }));
    lines.push("");
    lines.push(T("brief.textSec1"));
    lines.push(T("brief.textFpLine", {
      list: o.topFirstPicks.map(function (r) {
        return T("brief.fpItem", {
          champ: nameOf(r.champion), count: r.count, share: pct(r.share), n: r.n
        });
      }).join(", ")
    }));
    lines.push(T("brief.textBaLine", {
      list: o.topBannedAgainst.map(function (r) {
        return T("brief.baItem", {
          champ: nameOf(r.champion), count: r.count, share: pct(r.share)
        });
      }).join(", ")
    }));
    lines.push("");
    lines.push(T("brief.textSec2"));
    brief.banTargets.forEach(function (t, i) {
      lines.push(T("brief.textBanLine", {
        rank: i + 1, champ: nameOf(t.champion), picked: t.pickedGames,
        wrWith: pct(t.wrWith), wrWithout: pct(t.wrWithout),
        diff: pts(t.diff), n: t.n
      }));
    });
    lines.push("");
    lines.push(T("brief.textSec3"));
    if (brief.firstPick.priority) {
      var pr = brief.firstPick.priority;
      lines.push(T("brief.textPriority", {
        champ: nameOf(pr.champion), count: pr.count, n: pr.n,
        share: pct(pr.teamShare), ratio: Math.round(pr.ratio * 10) / 10,
        global: pct(pr.globalShare)
      }));
    } else {
      lines.push(T("brief.textNoPriority", {
        opener: brief.firstPick.rows.length
          ? T("brief.sec3Opener", {
              champ: nameOf(brief.firstPick.rows[0].champion),
              count: brief.firstPick.rows[0].count,
              n: brief.firstPick.rows[0].n
            })
          : "—"
      }));
    }
    lines.push("");
    lines.push(T("brief.textSec4"));
    var r = brief.lateRisk;
    if (r.longSeries > 0) {
      lines.push(T("brief.textExhaustion", {
        avg: r.avgTop5GoneByG4, top5: r.top5.map(nameOf).join(", "),
        n: r.longSeries,
        roles: r.dryRoles.length ? r.dryRoles.map(roleName).join(", ") : "—"
      }));
    }
    if (r.g3RemovedAvg != null) {
      lines.push(T("brief.textG3", {
        removed: r.g3RemovedAvg, pool: r.g3PoolRemovedAvg, n: r.seriesCount
      }));
    }
    r.shallowRoles.forEach(function (sh) {
      lines.push(T("brief.textConcentrated", {
        role: roleName(sh.role), c1: nameOf(sh.champions[0]),
        c2: nameOf(sh.champions[1]), share: pct(sh.top2Share),
        total: sh.total, n: sh.n
      }));
    });
    lines.push("");
    lines.push(T("brief.textSec5"));
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
