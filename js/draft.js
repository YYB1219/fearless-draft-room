/*
 * draft.js — Fearless Draft Room core state machine (pure logic, no DOM).
 *
 * Implements the standard professional LoL draft (20 actions per game):
 *
 *   Ban Phase 1 : B R B R B R            (3 bans each, Blue starts)
 *   Pick Phase 1: B R R B B R            (Blue 1, Red 2, Blue 2, Red 1)
 *   Ban Phase 2 : R B R B                (2 bans each, Red starts)
 *   Pick Phase 2: R B B R                (Red 1, Blue 2, Red 1)
 *
 * FEARLESS DRAFT RULE (the heart of this app):
 *   A champion PICKED in any earlier game of the same series is banned for
 *   BOTH teams for the remainder of the series. Bans do NOT carry over —
 *   only picks do. `fearlessPool()` returns that carry-over set together
 *   with the game number in which each champion was picked, so the UI can
 *   badge every grid tile with e.g. "F·G1".
 *
 * WIN-RATE HEURISTIC (transparent, deliberately simple):
 *   Each champion carries stats derived from the bundled scouting dataset:
 *   { games, wins } -> winRate = wins / games (shrunk toward 0.50 for small
 *   samples with prior m = 16: winRate' = (wins + 8) / (games + 16)).
 *   A team's draft score is the sum over its picks of (winRate' - 0.50).
 *   Blue win probability = logistic(scoreBlue - scoreRed) with slope 6,
 *   i.e. p = 1 / (1 + e^(-6 * diff)). Unfilled pick slots contribute 0.
 *   This is an ESTIMATE for draft-room discussion, not a prediction model.
 *
 * The module is environment-agnostic: it exports via module.exports under
 * Node (for the smoke tests in tools/) and as window.DraftCore in browsers.
 */
(function (global) {
  "use strict";

  /* Localization hook (js/i18n.js): resolved lazily so this module keeps
   * working standalone; without I18n loaded, t() returns the key itself
   * and the export falls back to its structural skeleton. The app and
   * the smoke tests always load i18n.js first. */
  function T(key, params) {
    var I = global.I18n;
    return I && typeof I.t === "function" ? I.t(key, params) : key;
  }

  // The 20-action draft sequence. side: "B" = blue team, "R" = red team.
  var SEQUENCE = [
    { type: "ban", side: "B" }, { type: "ban", side: "R" },
    { type: "ban", side: "B" }, { type: "ban", side: "R" },
    { type: "ban", side: "B" }, { type: "ban", side: "R" },
    { type: "pick", side: "B" },
    { type: "pick", side: "R" }, { type: "pick", side: "R" },
    { type: "pick", side: "B" }, { type: "pick", side: "B" },
    { type: "pick", side: "R" },
    { type: "ban", side: "R" }, { type: "ban", side: "B" },
    { type: "ban", side: "R" }, { type: "ban", side: "B" },
    { type: "pick", side: "R" },
    { type: "pick", side: "B" }, { type: "pick", side: "B" },
    { type: "pick", side: "R" }
  ];

  var FORMATS = { BO1: 1, BO3: 3, BO5: 5 };

  /*
   * SIDE SELECTION (per game): team identity is separate from sides.
   * series.teams = [teamA, teamB] are the two TEAMS; each game records
   * which team index plays blue (game.blueTeam) and red (game.redTeam).
   * Game 1 starts with teamA on blue; advanceGame() carries the same
   * assignment into the next game by default, and swapSides() flips
   * the CURRENT game before its first action (the standard "loser
   * picks side" flow is: advance, then swap if the loser wants it).
   * series.wins is per TEAM: wins[0] belongs to teams[0], wins[1] to
   * teams[1] — never to a side. A game's winner is still recorded by
   * SIDE ("blue"/"red") and credited through that game's assignment.
   */
  function emptyGame(number, blueTeam) {
    var bt = blueTeam === 1 ? 1 : 0;
    return {
      number: number,
      actions: [],        // [{type, side, championId}] in order performed
      winner: null,       // "blue" | "red" | null (set manually, optional)
      blueTeam: bt,       // index into series.teams playing blue
      redTeam: 1 - bt     // index into series.teams playing red
    };
  }

  /*
   * createSeries({ format, blueName, redName, patch, championStats })
   * blueName/redName are the GAME 1 side assignment: blueName's team
   * becomes teams[0] (blue in game 1), redName's teams[1].
   * championStats: { [championId]: { games, wins } } used by the heuristic.
   */
  function createSeries(opts) {
    opts = opts || {};
    var format = FORMATS[opts.format] ? opts.format : "BO3"; // unknown -> BO3
    var teams = [opts.blueName || "Blue", opts.redName || "Red"];
    return {
      format: format,
      gamesToWin: Math.floor((FORMATS[format] + 1) / 2),
      teams: teams,
      blueName: teams[0], // game-1 names, kept for convenience
      redName: teams[1],
      patch: opts.patch || "",
      championStats: opts.championStats || {},
      games: [emptyGame(1, 0)],
      currentGame: 0,     // index into games[]
      wins: [0, 0]        // per TEAM index (see SIDE SELECTION above)
    };
  }

  /* Team names for the CURRENT game's sides. */
  function blueTeamName(series) {
    return series.teams[currentGame(series).blueTeam];
  }
  function redTeamName(series) {
    return series.teams[currentGame(series).redTeam];
  }
  /* Team names for any game's sides (history lists, exports). */
  function gameBlueName(series, game) { return series.teams[game.blueTeam]; }
  function gameRedName(series, game) { return series.teams[game.redTeam]; }

  /*
   * Swap the current game's side assignment. Only allowed before the
   * game's first action — once the draft has started, the sides are
   * locked (throw otherwise).
   */
  function swapSides(series) {
    var game = currentGame(series);
    if (game.actions.length) {
      throw draftError("err.swapLocked", "swapLocked", null);
    }
    var t = game.blueTeam;
    game.blueTeam = game.redTeam;
    game.redTeam = t;
    return game;
  }

  function currentGame(series) {
    return series.games[series.currentGame];
  }

  /*
   * fearlessPool(series, beforeGameIndex)
   * -> Map championId -> game number (1-based) in which it was picked,
   *    considering only games BEFORE beforeGameIndex (default: current game).
   * Only picks carry over; bans are ignored here by design.
   */
  function fearlessPool(series, beforeGameIndex) {
    var upto = (beforeGameIndex == null) ? series.currentGame : beforeGameIndex;
    var pool = new Map();
    for (var g = 0; g < upto; g++) {
      series.games[g].actions.forEach(function (a) {
        if (a.type === "pick" && !pool.has(a.championId)) {
          pool.set(a.championId, series.games[g].number);
        }
      });
    }
    return pool;
  }

  /* Champions already used (picked or banned) inside the current game. */
  function usedInCurrentGame(series) {
    var used = new Set();
    currentGame(series).actions.forEach(function (a) { used.add(a.championId); });
    return used;
  }

  /* Why a champion cannot be selected right now, or null if it can. */
  function unavailableReason(series, championId) {
    if (fearlessPool(series).has(championId)) return "fearless";
    if (usedInCurrentGame(series).has(championId)) return "used";
    return null;
  }

  function nextAction(series) {
    var game = currentGame(series);
    if (game.actions.length >= SEQUENCE.length) return null;
    return SEQUENCE[game.actions.length];
  }

  function isGameComplete(series) {
    return currentGame(series).actions.length >= SEQUENCE.length;
  }

  /* Errors carry a machine-readable {code, championId} alongside the
   * localized message, so the UI can re-render them (e.g. with the
   * localized champion name) without parsing message text. */
  function draftError(key, code, championId) {
    var e = new Error(T(key, { champ: championId }));
    e.code = code;
    e.championId = championId;
    return e;
  }

  /* Apply the next draft action with the given champion. Throws on misuse. */
  function applyAction(series, championId) {
    if (typeof championId !== "string" || !championId) {
      throw draftError("err.invalid", "invalid", championId);
    }
    var step = nextAction(series);
    if (!step) throw draftError("err.complete", "complete", championId);
    var reason = unavailableReason(series, championId);
    if (reason === "fearless") {
      throw draftError("err.fearless", "fearless", championId);
    }
    if (reason === "used") {
      throw draftError("err.used", "used", championId);
    }
    currentGame(series).actions.push({
      type: step.type, side: step.side, championId: championId
    });
    return step;
  }

  function undo(series) {
    return currentGame(series).actions.pop() || null;
  }

  /* Recompute the series score from the per-game winners, from scratch,
   * so changing or clearing a result can never leave stale wins behind.
   * Wins are credited per TEAM through each game's side assignment. */
  function recomputeWins(series) {
    series.wins = [0, 0];
    series.games.forEach(function (g) {
      if (g.winner === "blue") series.wins[g.blueTeam]++;
      if (g.winner === "red") series.wins[g.redTeam]++;
    });
    return series.wins;
  }

  function resetGame(series) {
    var g = currentGame(series);
    // The side assignment survives a reset; only actions/winner clear.
    series.games[series.currentGame] = emptyGame(g.number, g.blueTeam);
    recomputeWins(series); // the fresh game has no winner — drop its win
  }

  function setWinner(series, side) {
    var game = currentGame(series);
    // Clicking the already-winning side again un-marks the game.
    game.winner = game.winner === side ? null : side;
    recomputeWins(series);
  }

  function seriesDecided(series) {
    return series.wins[0] >= series.gamesToWin ||
           series.wins[1] >= series.gamesToWin;
  }

  /* Advance to the next game. Returns false when the series is over/full.
   * The next game carries the SAME side assignment by default; call
   * swapSides() on it (before its first action) to flip sides. */
  function advanceGame(series) {
    if (!isGameComplete(series)) return false;
    if (seriesDecided(series)) return false;
    if (series.games.length >= FORMATS[series.format]) return false;
    series.games.push(emptyGame(series.games.length + 1,
      currentGame(series).blueTeam));
    series.currentGame = series.games.length - 1;
    return true;
  }

  /* Pool-shrink stats for the current game, shown in the UI header. */
  function poolStats(series, totalChampions) {
    var fearless = fearlessPool(series);
    var availableAtStart = totalChampions - fearless.size;
    return {
      fearlessCount: fearless.size,
      totalChampions: totalChampions,
      availableAtStart: availableAtStart,
      percentAvailable: totalChampions
        ? Math.round((availableAtStart / totalChampions) * 1000) / 10
        : 100
    };
  }

  /* Shrunk win rate with prior m = 16: WR' = (W + 8) / (G + 16).
   * The prior pulls small samples toward 0.50; 16 games of prior is
   * strong enough that a 5-game hot streak no longer outranks a
   * proven 100-game champion. Exported so copilot.js uses the exact
   * same WR' instead of keeping its own copy. */
  function shrunkWinRate(stats) {
    if (!stats || !stats.games) return 0.5;
    return (stats.wins + 8) / (stats.games + 16);
  }

  /*
   * heuristicWinProbability(series) -> { blue: 0..1, red: 0..1 }
   * See the header comment for the exact formula. Picks only; bans ignored.
   */
  function heuristicWinProbability(series) {
    var score = { B: 0, R: 0 };
    currentGame(series).actions.forEach(function (a) {
      if (a.type !== "pick") return;
      var wr = shrunkWinRate(series.championStats[a.championId]);
      score[a.side] += (wr - 0.5);
    });
    var diff = score.B - score.R;
    var pBlue = 1 / (1 + Math.exp(-6 * diff));
    return { blue: pBlue, red: 1 - pBlue };
  }

  /* Picks/bans of one game grouped by side, in draft order. */
  function gameBreakdown(game) {
    var out = {
      blue: { picks: [], bans: [] }, red: { picks: [], bans: [] }
    };
    game.actions.forEach(function (a) {
      var side = a.side === "B" ? "blue" : "red";
      out[side][a.type === "pick" ? "picks" : "bans"].push(a.championId);
    });
    return out;
  }

  /* Plain-text export of the whole series draft history (copy/paste ready). */
  function exportText(series, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    var lines = [];
    lines.push(T("export.header", {
      blue: series.teams[0], red: series.teams[1], format: series.format,
      patchPart: series.patch ? T("export.patchPart", { patch: series.patch }) : ""
    }));
    lines.push(T("export.score", {
      blue: series.teams[0], bw: series.wins[0],
      rw: series.wins[1], red: series.teams[1]
    }));
    series.games.forEach(function (game) {
      var b = gameBreakdown(game);
      var fmt = function (ids) { return ids.map(nameOf).join(", ") || "—"; };
      // Each game is reported under the team names of ITS side
      // assignment (teams may have swapped sides between games).
      var gBlue = gameBlueName(series, game);
      var gRed = gameRedName(series, game);
      lines.push("");
      lines.push(T("export.game", { game: game.number }) +
        (game.winner ? T("export.winnerSuffix", {
          team: game.winner === "blue" ? gBlue : gRed
        }) : ""));
      lines.push(T("export.bans", { team: gBlue, list: fmt(b.blue.bans) }));
      lines.push(T("export.bans", { team: gRed, list: fmt(b.red.bans) }));
      lines.push(T("export.picks", { team: gBlue, list: fmt(b.blue.picks) }));
      lines.push(T("export.picks", { team: gRed, list: fmt(b.red.picks) }));
      // Cumulative Fearless pool after this game: every pick from
      // games 1..N (fearlessPool's index argument is 1-based here, so
      // game.number covers exactly those games, this one included).
      var fearlessAfter = fearlessPool(series, game.number);
      if (fearlessAfter.size) {
        lines.push(T("export.fearless", {
          game: game.number, list: fmt(Array.from(fearlessAfter.keys()))
        }));
      }
    });
    return lines.join("\n");
  }

  /*
   * serializeSeries(series) -> JSON-safe snapshot of the series state
   * (plain data only). championStats are deliberately NOT serialized:
   * they are dataset-derived and re-supplied on restore.
   */
  function serializeSeries(series) {
    return {
      format: series.format,
      teams: series.teams.slice(),
      patch: series.patch,
      currentGame: series.currentGame,
      games: series.games.map(function (g) {
        return {
          number: g.number,
          winner: g.winner,
          blueTeam: g.blueTeam,
          redTeam: g.redTeam,
          actions: g.actions.map(function (a) {
            return { type: a.type, side: a.side, championId: a.championId };
          })
        };
      })
    };
  }

  /*
   * restoreSeries(json, championStats) -> series | null.
   * Rebuilds a full series from a serializeSeries() snapshot; wins are
   * recomputed from the per-game winners and side assignments.
   */
  function restoreSeries(json, championStats) {
    if (!json || !Array.isArray(json.games) || !json.games.length) return null;
    var teams = Array.isArray(json.teams) ? json.teams : [];
    var series = createSeries({
      format: json.format,
      blueName: teams[0],
      redName: teams[1],
      patch: json.patch || "",
      championStats: championStats || {}
    });
    series.games = json.games.map(function (g) {
      var game = emptyGame(g.number, g.blueTeam);
      game.winner = g.winner || null;
      game.actions = (g.actions || []).map(function (a) {
        return { type: a.type, side: a.side, championId: a.championId };
      });
      return game;
    });
    series.currentGame = Math.min(
      Math.max(json.currentGame || 0, 0), series.games.length - 1);
    recomputeWins(series);
    return series;
  }

  var api = {
    SEQUENCE: SEQUENCE,
    FORMATS: FORMATS,
    createSeries: createSeries,
    serializeSeries: serializeSeries,
    restoreSeries: restoreSeries,
    currentGame: currentGame,
    blueTeamName: blueTeamName,
    redTeamName: redTeamName,
    gameBlueName: gameBlueName,
    gameRedName: gameRedName,
    swapSides: swapSides,
    fearlessPool: fearlessPool,
    usedInCurrentGame: usedInCurrentGame,
    unavailableReason: unavailableReason,
    nextAction: nextAction,
    isGameComplete: isGameComplete,
    applyAction: applyAction,
    undo: undo,
    resetGame: resetGame,
    recomputeWins: recomputeWins,
    setWinner: setWinner,
    seriesDecided: seriesDecided,
    advanceGame: advanceGame,
    poolStats: poolStats,
    shrunkWinRate: shrunkWinRate,
    heuristicWinProbability: heuristicWinProbability,
    gameBreakdown: gameBreakdown,
    exportText: exportText
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DraftCore = api;
})(typeof window !== "undefined" ? window : globalThis);
