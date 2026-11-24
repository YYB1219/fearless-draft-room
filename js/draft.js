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
 *   samples: winRate' = (wins + 4*0.5) / (games + 4)).
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

  function emptyGame(number) {
    return {
      number: number,
      actions: [],        // [{type, side, championId}] in order performed
      winner: null        // "blue" | "red" | null (set manually, optional)
    };
  }

  /*
   * createSeries({ format, blueName, redName, patch, championStats })
   * championStats: { [championId]: { games, wins } } used by the heuristic.
   */
  function createSeries(opts) {
    opts = opts || {};
    return {
      format: opts.format || "BO3",
      gamesToWin: Math.floor((FORMATS[opts.format || "BO3"] + 1) / 2),
      blueName: opts.blueName || "Blue",
      redName: opts.redName || "Red",
      patch: opts.patch || "",
      championStats: opts.championStats || {},
      games: [emptyGame(1)],
      currentGame: 0,     // index into games[]
      wins: { blue: 0, red: 0 }
    };
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

  /* Apply the next draft action with the given champion. Throws on misuse. */
  function applyAction(series, championId) {
    var step = nextAction(series);
    if (!step) throw new Error("Draft is already complete for this game.");
    var reason = unavailableReason(series, championId);
    if (reason === "fearless") {
      throw new Error(championId + " was picked earlier in this series (Fearless Draft).");
    }
    if (reason === "used") {
      throw new Error(championId + " is already picked or banned in this game.");
    }
    currentGame(series).actions.push({
      type: step.type, side: step.side, championId: championId
    });
    return step;
  }

  function undo(series) {
    return currentGame(series).actions.pop() || null;
  }

  function resetGame(series) {
    var n = currentGame(series).number;
    series.games[series.currentGame] = emptyGame(n);
  }

  function setWinner(series, side) {
    currentGame(series).winner = side;
    // Recompute series score from scratch so undoing a result stays sane.
    series.wins = { blue: 0, red: 0 };
    series.games.forEach(function (g) {
      if (g.winner === "blue") series.wins.blue++;
      if (g.winner === "red") series.wins.red++;
    });
  }

  function seriesDecided(series) {
    return series.wins.blue >= series.gamesToWin ||
           series.wins.red >= series.gamesToWin;
  }

  /* Advance to the next game. Returns false when the series is over/full. */
  function advanceGame(series) {
    if (!isGameComplete(series)) return false;
    if (seriesDecided(series)) return false;
    if (series.games.length >= FORMATS[series.format]) return false;
    series.games.push(emptyGame(series.games.length + 1));
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

  function shrunkWinRate(stats) {
    if (!stats || !stats.games) return 0.5;
    return (stats.wins + 4 * 0.5) / (stats.games + 4); // shrink small samples to 0.50
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
    lines.push("=== " + series.blueName + " vs " + series.redName +
               " — " + series.format +
               (series.patch ? " — Patch " + series.patch : "") + " ===");
    lines.push("Series score: " + series.blueName + " " + series.wins.blue +
               " – " + series.wins.red + " " + series.redName);
    series.games.forEach(function (game) {
      var b = gameBreakdown(game);
      var fmt = function (ids) { return ids.map(nameOf).join(", ") || "—"; };
      lines.push("");
      lines.push("Game " + game.number +
        (game.winner ? " — winner: " +
          (game.winner === "blue" ? series.blueName : series.redName) : ""));
      lines.push("  " + series.blueName + " bans:  " + fmt(b.blue.bans));
      lines.push("  " + series.redName + " bans:  " + fmt(b.red.bans));
      lines.push("  " + series.blueName + " picks: " + fmt(b.blue.picks));
      lines.push("  " + series.redName + " picks: " + fmt(b.red.picks));
      var fearlessNext = fearlessPool(series, game.number); // games are 1-based; index == number
      if (game.number < series.games.length || isGameComplete(series)) {
        lines.push("  Fearless-banned from Game " + game.number + ": " +
          fmt(Array.from(fearlessNext.keys())));
      }
    });
    return lines.join("\n");
  }

  var api = {
    SEQUENCE: SEQUENCE,
    FORMATS: FORMATS,
    createSeries: createSeries,
    currentGame: currentGame,
    fearlessPool: fearlessPool,
    usedInCurrentGame: usedInCurrentGame,
    unavailableReason: unavailableReason,
    nextAction: nextAction,
    isGameComplete: isGameComplete,
    applyAction: applyAction,
    undo: undo,
    resetGame: resetGame,
    setWinner: setWinner,
    seriesDecided: seriesDecided,
    advanceGame: advanceGame,
    poolStats: poolStats,
    heuristicWinProbability: heuristicWinProbability,
    gameBreakdown: gameBreakdown,
    exportText: exportText
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DraftCore = api;
})(typeof window !== "undefined" ? window : globalThis);
