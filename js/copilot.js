/*
 * copilot.js — AI Draft Copilot （实时副驾）: pure logic, no DOM.
 *
 * An agent loop a coach can audit, running entirely locally:
 *   PERCEIVE  — snapshot the draft state machine (game, phase, turn,
 *               picks/bans so far, the Fearless-unavailable set).
 *   REASON    — score every legal option against the evidence: the
 *               opponent's aggregate tendencies, champion win rates
 *               (the same shrunk WR' the win-rate bar uses), role
 *               needs, and role-pool depth.
 *   RECOMMEND — a one-line read of the position, exactly 3 ranked
 *               options with a one-line, number-carrying reason each,
 *               plus pool-exhaustion warnings. The coach decides.
 *
 * HARD RULE: recommendations are drawn ONLY from champions the state
 * machine currently allows (DraftCore.unavailableReason === null).
 * A picked, banned, or fearless-banned champion can never be
 * recommended — the smoke tests replay the full demo BO5 and assert
 * this at every single draft state.
 *
 * Inputs (single object):
 *   series       — a DraftCore series (js/draft.js)
 *   scoutingData — the aggregates object (data/scouting.json schema)
 *   opponentId   — team id of the opponent profile, or null
 *                  (null = dataset-wide reasoning, no tendency denial)
 *   ourSide      — "B" or "R": the side the coach is drafting for
 *   championIds  — every champion id (for availability scans)
 *   rolesOf      — { championId: [roles] } from data/champions.json
 *   nameOf       — id -> display name (defaults to identity)
 *
 * Environment-agnostic: module.exports under Node, window.Copilot in
 * browsers. DraftCore / Scouting are resolved lazily from the global
 * scope at call time, so load order only matters at runtime.
 */
(function (global) {
  "use strict";

  var META_MIN_GAMES = 30;     // "meta pool" = champions with >= 30 dataset games
  var META_DRY_AT = 12;        // meta champions left in a role -> dry warning
  var PINCH_LEFT_AT = 2;       // opponent top-5 comfort picks left -> pinch warning

  function Draft() { return global.DraftCore; }
  function Scout() { return global.Scouting; }

  function pct(x) { return Math.round(x * 100) + "%"; }

  /* Same shrinkage as draft.js: WR' = (W + 2) / (G + 4). */
  function wrPrime(stats, id) {
    var s = stats[id];
    if (!s || !s.games) return { wr: 0.5, games: 0 };
    return { wr: (s.wins + 2) / (s.games + 4), games: s.games };
  }

  function phaseName(actionsDone) {
    return actionsDone < 6 ? "Ban Phase 1" : actionsDone < 12 ? "Pick Phase 1"
      : actionsDone < 16 ? "Ban Phase 2" : "Pick Phase 2";
  }

  function advise(input) {
    var D = Draft(), S = Scout();
    var series = input.series;
    var data = input.scoutingData || {};
    var nameOf = input.nameOf || function (id) { return id; };
    var ourSide = input.ourSide === "R" ? "R" : "B";
    var game = D.currentGame(series);
    var step = D.nextAction(series);
    var stats = series.championStats || {};
    var breakdown = D.gameBreakdown(game);
    var ours = breakdown[ourSide === "B" ? "blue" : "red"];
    var theirs = breakdown[ourSide === "B" ? "red" : "blue"];
    var oppTeam = input.opponentId ? S.teamById(data, input.opponentId) : null;
    var opp = input.opponentId ? S.profile(data, input.opponentId) : null;
    var oppName = oppTeam ? oppTeam.name : "the opponent";
    var ps = D.poolStats(series, input.championIds.length);

    var headline = "Game " + game.number + " · " +
      (step ? phaseName(game.actions.length) : "Draft complete") +
      " · Pool at " + ps.percentAvailable + "% (" + ps.fearlessCount +
      " fearless-banned)";
    if (step) {
      var actor = step.side === ourSide ? "Your " +
        (step.side === "B" ? series.blueName : series.redName) :
        (step.side === "B" ? series.blueName : series.redName);
      headline += " · " + actor + " to " + step.type + ".";
    }
    var prob = D.heuristicWinProbability(series);
    headline += " Heuristic: " + series.blueName + " " +
      Math.round(prob.blue * 100) + "% – " + Math.round(prob.red * 100) +
      "% " + series.redName + " (estimate).";

    var warnings = computeWarnings(input, D, S, {
      game: game, opp: opp, oppName: oppName, ours: ours, theirs: theirs,
      stats: stats, ps: ps
    });

    if (!step) {
      return {
        complete: true, mode: "complete", game: game.number,
        headline: headline, recommendations: [], warnings: warnings
      };
    }

    var mode = step.side === ourSide
      ? (step.type === "pick" ? "our-pick" : "our-ban")
      : (step.type === "pick" ? "watch-pick" : "watch-ban");

    var available = input.championIds.filter(function (id) {
      return D.unavailableReason(series, id) === null;
    });

    var ctx = {
      D: D, S: S, series: series, data: data, nameOf: nameOf, stats: stats,
      opp: opp, oppName: oppName, ours: ours, theirs: theirs,
      rolesOf: input.rolesOf || {}
    };

    var scored;
    if (mode === "our-pick" || mode === "watch-ban") {
      scored = available.map(function (id) { return scorePick(ctx, id); });
    } else {
      scored = available.map(function (id) { return scoreThreat(ctx, id); });
    }
    scored.sort(function (a, b) {
      return (b.score - a.score) || (b.games - a.games) ||
             (a.champion < b.champion ? -1 : 1);
    });

    var recommendations = scored.slice(0, 3).map(function (s) {
      return {
        champion: s.champion,
        kind: mode === "our-pick" ? "pick" : mode === "our-ban" ? "ban" : "watch",
        reason: reasonFor(ctx, mode, s)
      };
    });

    return {
      complete: false, mode: mode, game: game.number,
      headline: headline, recommendations: recommendations, warnings: warnings
    };
  }

  /* --- scoring -----------------------------------------------------------
   * scorePick: value of taking a champion ourselves = its own shrunk
   * win rate + denial value vs. the opponent's tendencies + role need.
   * scoreThreat: value of a champion TO the opponent (ban targets on
   * our turn, watch-list on theirs) from their tendencies alone. */
  function tendency(ctx, id) {
    return ctx.opp && ctx.opp.tendencies ? ctx.opp.tendencies[id] : null;
  }

  function denialValue(ctx, id) {
    var t = tendency(ctx, id);
    if (!t || !t.pickedGames) return 0;
    var wrWith = t.pickedWins / t.pickedGames;
    var v = (wrWith - 0.5) * 30 * Math.min(1, t.pickedGames / 12);
    var fp = ctx.opp.firstPicks ? (ctx.opp.firstPicks[id] || 0) : 0;
    if (fp >= 5) v += 6;
    return v;
  }

  function openRoles(ctx) {
    var filled = {};
    ctx.ours.picks.forEach(function (id) {
      (ctx.rolesOf[id] || []).forEach(function (r) { filled[r] = true; });
    });
    return filled;
  }

  function scorePick(ctx, id) {
    var w = wrPrime(ctx.stats, id);
    var base = (w.wr - 0.5) * 100;
    var denial = denialValue(ctx, id);
    var filled = openRoles(ctx);
    var roles = ctx.rolesOf[id] || [];
    var roleNeed = 0;
    if (roles.length) roleNeed = roles.some(function (r) { return !filled[r]; }) ? 5 : -6;
    return {
      champion: id, score: base + denial + roleNeed, games: w.games,
      wr: w.wr, denial: denial, roleNeed: roleNeed,
      role: roles[0] || null, tendency: tendency(ctx, id)
    };
  }

  function scoreThreat(ctx, id) {
    var t = tendency(ctx, id);
    var w = wrPrime(ctx.stats, id);
    if (!t) {
      // No opponent profile (or no history on this champion): fall back
      // to raw dataset strength — still an evidence-based ordering.
      return { champion: id, score: (w.wr - 0.5) * 100, games: w.games,
               wr: w.wr, denial: 0, roleNeed: 0, role: (ctx.rolesOf[id] || [])[0] || null,
               tendency: null };
    }
    var wrWith = t.pickedGames ? t.pickedWins / t.pickedGames : 0;
    var fp = ctx.opp.firstPicks ? (ctx.opp.firstPicks[id] || 0) : 0;
    var score = (wrWith - 0.5) * Math.max(t.pickedGames, 0) + fp * 1.2 +
                (w.wr - 0.5) * 20;
    // Wasted-ban guard: if opponents keep banning this and the team
    // wins those games anyway, it is a poor ban — push it down.
    if (t.bannedAgainstGames >= 6 && ctx.opp.games) {
      var baseline = ctx.opp.wins / ctx.opp.games;
      var wrWhenBanned = t.bannedAgainstWins / t.bannedAgainstGames;
      if (wrWhenBanned >= baseline + 0.05) score -= 25;
    }
    return { champion: id, score: score, games: t.pickedGames, wr: wrWith,
             denial: 0, roleNeed: 0, role: (ctx.rolesOf[id] || [])[0] || null,
             tendency: t };
  }

  /* --- reasons: one line, numbers attached ------------------------------ */
  function reasonFor(ctx, mode, s) {
    var name = ctx.nameOf(s.champion);
    var t = s.tendency;
    if (mode === "our-pick") {
      if (t && s.denial >= 6) {
        return "Denies " + ctx.oppName + ": they won " +
          pct(t.pickedWins / t.pickedGames) + " on " + name + " across " +
          t.pickedGames + " picks (n=" + t.pickedGames + ")" +
          (s.roleNeed > 0 ? ", and it fills an open role for us." : ".");
      }
      if (s.roleNeed > 0 && s.role) {
        return "Fills our open " + s.role + " slot; dataset WR′ " + pct(s.wr) +
          " over " + s.games + " games (n=" + s.games + ").";
      }
      if (s.games > 0) {
        return "Highest-rated available" + (s.role ? " " + s.role : "") +
          ": WR′ " + pct(s.wr) + " over " + s.games + " games (n=" + s.games + ").";
      }
      return "No dataset sample on " + name + " yet — rated on role fit only.";
    }
    if (mode === "our-ban") {
      if (t && t.pickedGames) {
        var wrW = t.pickedWins / t.pickedGames;
        var wrWo = t.unpickedGames ? t.unpickedWins / t.unpickedGames : 0;
        return "Remove the comfort: " + ctx.oppName + " won " + pct(wrW) +
          " with " + name + " vs. " + pct(wrWo) + " without (n=" +
          t.pickedGames + " picks).";
      }
      if (ctx.opp && ctx.opp.firstPicks && ctx.opp.firstPicks[s.champion] >= 5) {
        return "Their first-pick priority: " + ctx.opp.firstPicks[s.champion] +
          " first picks in " + ctx.opp.games + " games (n=" + ctx.opp.games +
          ") — deny the opener.";
      }
      return "Strongest open champion in the dataset: WR′ " + pct(s.wr) +
        " over " + s.games + " games (n=" + s.games + ") — don't hand it over.";
    }
    if (mode === "watch-pick") {
      if (t && t.pickedGames) {
        return "Watch: " + ctx.oppName + " may take " + name + " — their " +
          "comfort at " + pct(t.pickedWins / t.pickedGames) + " WR in " +
          t.pickedGames + " picks (n=" + t.pickedGames +
          "). Have the counter or the trade ready.";
      }
      return "Watch: " + name + " is the strongest open champion by " +
        "dataset WR′ (" + pct(s.wr) + ", n=" + s.games +
        ") — expect it to be contested.";
    }
    // watch-ban: opponent is about to ban; these are OUR priorities to protect.
    return "Protect: " + name + " is our best remaining" +
      (s.role ? " " + s.role : "") + " option (WR′ " + pct(s.wr) + ", n=" +
      s.games + ") — expect " + ctx.oppName +
      " to consider banning it; keep a backup ready.";
  }

  /* --- warnings ------------------------------------------------------------
   * 1. Opponent pinch: a role where <= PINCH_LEFT_AT of the opponent's
   *    top-5 comfort picks are still available (from Game 2 on).
   * 2. Meta-pool dryness: a role whose available champions with >= 30
   *    dataset games drops to <= META_DRY_AT once the Fearless pool
   *    has shrunk hard (>= 30 gone or Game 4+). */
  function computeWarnings(input, D, S, c) {
    var warnings = [];
    var series = input.series;
    var avail = function (id) { return D.unavailableReason(series, id) === null; };

    if (c.opp && c.game.number >= 2) {
      var pools = S.rolePools(input.scoutingData, input.opponentId);
      Object.keys(pools).forEach(function (role) {
        var top = pools[role].champions; // top 5, games-sorted
        if (top.length < 4) return;
        var left = top.filter(function (ch) { return avail(ch.champion); });
        var totalGames = top.reduce(function (s, ch) { return s + ch.games; }, 0);
        if (left.length <= PINCH_LEFT_AT) {
          warnings.push("⚠ " + c.oppName + "'s " + role +
            " comfort pool is nearly dry: only " + left.length + " of their " +
            "top-5 " + role + " picks remain (" +
            (left.map(function (ch) { return (input.nameOf || function (x) { return x; })(ch.champion); }).join(", ") || "none") +
            ") — one more targeted ban closes the role (pool sample n=" +
            totalGames + " games).");
        }
      });
    }

    if (c.game.number >= 4 || c.ps.fearlessCount >= 30) {
      var rolesOf = input.rolesOf || {};
      var metaLeft = {};
      input.championIds.forEach(function (id) {
        var st = c.stats[id];
        if (!st || st.games < META_MIN_GAMES) return;
        if (!avail(id)) return;
        (rolesOf[id] || []).forEach(function (r) {
          metaLeft[r] = (metaLeft[r] || 0) + 1;
        });
      });
      Object.keys(metaLeft).forEach(function (role) {
        if (metaLeft[role] <= META_DRY_AT) {
          warnings.push("⚠ Meta " + role + " pool nearly dry: only " +
            metaLeft[role] + " champions with " + META_MIN_GAMES +
            "+ dataset games remain available in this role — draft depth " +
            "decides this game.");
        }
      });
    }
    return warnings;
  }

  /* Plain-text fact sheet of the current advice (for the BYOK LLM layer
   * and for copy/paste). Facts only — the model may narrate, never add. */
  function summarize(series, advice, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    if (!advice) return "";
    var lines = [];
    lines.push("DRAFT STATE — " + series.blueName + " vs. " + series.redName +
      " (" + series.format + "), series score " + series.wins.blue + "–" +
      series.wins.red + ".");
    lines.push(advice.headline);
    lines.push("Mode: " + advice.mode + ".");
    if (advice.recommendations.length) {
      lines.push("Copilot recommendations:");
      advice.recommendations.forEach(function (r, i) {
        lines.push("  " + (i + 1) + ". [" + r.kind + "] " + nameOf(r.champion) +
          " — " + r.reason);
      });
    }
    advice.warnings.forEach(function (w) { lines.push("Warning: " + w); });
    return lines.join("\n");
  }

  var api = {
    META_MIN_GAMES: META_MIN_GAMES,
    META_DRY_AT: META_DRY_AT,
    advise: advise,
    summarize: summarize
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Copilot = api;
})(typeof window !== "undefined" ? window : globalThis);
