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

  /* Localization hooks (js/i18n.js), resolved lazily at call time.
   * Every readout, reason and warning below is a dictionary template;
   * only the numbers and names interpolated into it change. */
  function T(key, params) {
    var I = global.I18n;
    return I && typeof I.t === "function" ? I.t(key, params) : key;
  }
  function roleName(r) {
    var I = global.I18n;
    return I && typeof I.role === "function" ? I.role(r) : r;
  }

  function pct(x) { return Math.round(x * 100) + "%"; }

  /* WR' is DraftCore.shrunkWinRate (prior m = 16) — the exact same
   * shrunk rate the win-rate bar uses. No local copy: two shrinkage
   * formulas in one app would silently disagree. */
  function wrPrime(stats, id) {
    var s = stats[id];
    if (!s || !s.games) return { wr: 0.5, games: 0 };
    return { wr: Draft().shrunkWinRate(s), games: s.games };
  }

  function phaseName(actionsDone) {
    return actionsDone < 6 ? T("phase.ban1") : actionsDone < 12 ? T("phase.pick1")
      : actionsDone < 16 ? T("phase.ban2") : T("phase.pick2");
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
    var oppName = oppTeam ? oppTeam.name : T("copilot.theOpponent");
    var ps = D.poolStats(series, input.championIds.length);

    var headline = T("copilot.gameLabel", { game: game.number }) + " · " +
      (step ? phaseName(game.actions.length) : T("phase.draftComplete")) +
      " · " + T("copilot.poolPart", {
        pct: ps.percentAvailable, count: ps.fearlessCount
      });
    if (step) {
      // Names follow the CURRENT game's side assignment.
      var actorName = step.side === "B" ? D.blueTeamName(series) : D.redTeamName(series);
      var action = step.type === "ban" ? T("common.banVerb") : T("common.pickVerb");
      headline += " · " + (step.side === ourSide
        ? T("copilot.turnOurs", { team: actorName, action: action })
        : T("copilot.turnTheirs", { team: actorName, action: action }));
    }
    var prob = D.heuristicWinProbability(series);
    headline += " " + T("copilot.heuristic", {
      blue: D.blueTeamName(series), bp: Math.round(prob.blue * 100),
      rp: Math.round(prob.red * 100), red: D.redTeamName(series)
    });

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
    // Ban Phase 2 = actions 13-16 (indices 12-15) of the sequence.
    ctx.banPhase2 = game.actions.length >= 12 && game.actions.length < 16;
    ctx.oppFilledRoles = opponentFilledRoles(ctx);

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

  /* Roles we have already filled. A role counts as filled ONLY by a
   * picked champion's PRIMARY role (roles[0]): a flex pick (e.g.
   * Maokai, Jungle/Support/Top) locks the lane it was drafted for,
   * not every lane it could theoretically play. */
  function openRoles(ctx) {
    var filled = {};
    ctx.ours.picks.forEach(function (id) {
      var roles = ctx.rolesOf[id] || [];
      if (roles.length) filled[roles[0]] = true;
    });
    return filled;
  }

  /* Primary roles the OPPONENT has already locked in with their picks. */
  function opponentFilledRoles(ctx) {
    var filled = {};
    ctx.theirs.picks.forEach(function (id) {
      var roles = ctx.rolesOf[id] || [];
      if (roles.length) filled[roles[0]] = true;
    });
    return filled;
  }

  /* Ban Phase 2 penalty: banning a champion whose primary role the
   * opponent has already filled is close to wasted — they cannot pick
   * a second champion for that lane. Strongly down-weight those so
   * phase-2 bans target the roles the opponent still has to fill. */
  var BAN_PHASE2_FILLED_ROLE_PENALTY = 40;
  function banPhase2Penalty(ctx, id) {
    if (!ctx.banPhase2) return 0;
    var primary = (ctx.rolesOf[id] || [])[0];
    return primary && ctx.oppFilledRoles[primary]
      ? BAN_PHASE2_FILLED_ROLE_PENALTY : 0;
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
      return { champion: id, score: (w.wr - 0.5) * 100 - banPhase2Penalty(ctx, id),
               games: w.games,
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
    score -= banPhase2Penalty(ctx, id);
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
        return T("reason.deny", {
          opp: ctx.oppName, wr: pct(t.pickedWins / t.pickedGames),
          champ: name, picks: t.pickedGames, n: t.pickedGames
        }) + (s.roleNeed > 0 ? T("reason.suffixRole") : T("common.period"));
      }
      if (s.roleNeed > 0 && s.role) {
        return T("reason.fillRole", {
          role: roleName(s.role), wr: pct(s.wr), games: s.games
        });
      }
      if (s.games > 0) {
        return s.role
          ? T("reason.highestRole", { role: roleName(s.role), wr: pct(s.wr), games: s.games })
          : T("reason.highest", { wr: pct(s.wr), games: s.games });
      }
      return T("reason.noSample", { champ: name });
    }
    if (mode === "our-ban") {
      if (t && t.pickedGames) {
        var wrW = t.pickedWins / t.pickedGames;
        var wrWo = t.unpickedGames ? t.unpickedWins / t.unpickedGames : 0;
        return T("reason.removeComfort", {
          opp: ctx.oppName, wrWith: pct(wrW), champ: name,
          wrWithout: pct(wrWo), n: t.pickedGames
        });
      }
      if (ctx.opp && ctx.opp.firstPicks && ctx.opp.firstPicks[s.champion] >= 5) {
        return T("reason.firstPickPriority", {
          count: ctx.opp.firstPicks[s.champion], games: ctx.opp.games
        });
      }
      return T("reason.strongestOpen", { wr: pct(s.wr), games: s.games });
    }
    if (mode === "watch-pick") {
      if (t && t.pickedGames) {
        return T("reason.watchComfort", {
          opp: ctx.oppName, champ: name,
          wr: pct(t.pickedWins / t.pickedGames), picks: t.pickedGames
        });
      }
      return T("reason.watchStrongest", {
        champ: name, wr: pct(s.wr), games: s.games
      });
    }
    // watch-ban: opponent is about to ban; these are OUR priorities to protect.
    return s.role
      ? T("reason.protectRole", {
          champ: name, role: roleName(s.role), wr: pct(s.wr),
          games: s.games, opp: ctx.oppName
        })
      : T("reason.protect", {
          champ: name, wr: pct(s.wr), games: s.games, opp: ctx.oppName
        });
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
          warnings.push(T("warn.pinch", {
            opp: c.oppName, role: roleName(role), left: left.length,
            names: left.map(function (ch) {
              return (input.nameOf || function (x) { return x; })(ch.champion);
            }).join(", ") || T("warn.none"),
            n: totalGames
          }));
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
          warnings.push(T("warn.metaDry", {
            role: roleName(role), left: metaLeft[role], min: META_MIN_GAMES
          }));
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
    lines.push(T("sum.title", {
      blue: series.teams[0], red: series.teams[1], format: series.format,
      bw: series.wins[0], rw: series.wins[1]
    }));
    lines.push(advice.headline);
    lines.push(T("sum.mode", { mode: advice.mode }));
    if (advice.recommendations.length) {
      lines.push(T("sum.recs"));
      advice.recommendations.forEach(function (r, i) {
        lines.push(T("sum.recLine", {
          rank: i + 1, kind: r.kind, champ: nameOf(r.champion), reason: r.reason
        }));
      });
    }
    advice.warnings.forEach(function (w) {
      lines.push(T("sum.warning", { text: w }));
    });
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
