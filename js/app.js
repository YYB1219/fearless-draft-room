/*
 * app.js — UI wiring for Fearless Draft Room.
 * All draft rules live in draft.js (DraftCore) and all analytics in
 * scouting.js (Scouting); this file only renders state and forwards clicks.
 *
 * All UI text goes through js/i18n.js: static chrome via data-i18n /
 * data-i18n-html / data-i18n-ph attributes in index.html (applied by
 * applyStaticI18n), generated text via t() at render time. Switching
 * language re-renders everything in place — no page reload. Champion
 * display names follow the locale (nameZh in 中文 mode); search matches
 * both the English and Chinese names.
 */
(function () {
  "use strict";

  var domCache = {};
  var $ = function (id) {
    var el = domCache[id];
    if (!el) {
      el = document.getElementById(id);
      if (el) domCache[id] = el;
    }
    return el;
  };
  var t = function (key, params) { return window.I18n.t(key, params); };
  var roleName = function (r) { return window.I18n.role(r); };
  /* Every user- or data-derived string spliced into innerHTML goes
   * through esc() — team names are typed into inputs, and champion /
   * player / team names come from data files. Dictionary templates and
   * the structural HTML built here stay raw by design. */
  var esc = function (s) { return window.I18n.esc(s); };

  /* Icon fallback without inline handlers: when a champion icon fails
   * to load, swap the <img> for an initial-letter div. Capture phase,
   * because resource error events do not bubble. */
  document.addEventListener("error", function (e) {
    var el = e.target;
    if (!el || el.tagName !== "IMG" || !el.hasAttribute("data-icon-fallback")) return;
    var div = document.createElement("div");
    div.className = "icon-fallback";
    div.textContent = el.getAttribute("data-icon-fallback");
    el.replaceWith(div);
  }, true);

  var state = {
    champions: [],          // from data/champions.json
    championIds: [],        // cached id array for Copilot.advise
    champById: {},
    rolesOf: {},            // championId -> [roles]
    scouting: null,         // from data/scouting.json
    demo: null,             // from data/demo_series.json
    series: null,           // DraftCore series
    roleFilter: "All",
    search: "",
    demoQueue: [],          // scripted steps when a demo is loaded
    demoTimer: null,
    brief: null,            // last generated BriefGen brief (scouting view)
    lastAdvice: null,       // last Copilot advice (draft view)
    preloadedDemo: false,   // true when this load preloaded the demo BO5
    noticeDismissed: false, // demo preload notice dismissed this session
    animSig: null,          // {game, count} at the previous renderDraft —
                            // a count increase of exactly 1 marks the
                            // newest action for the pop/flash animation
    flashChamp: null,       // champion id whose grid tile flashes this render
    flashCls: "",           // team-colored flash classes for that tile
    phaseKey: null          // "game:phaseIndex" at the previous render
  };

  /* ---------------- data loading ---------------- */

  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
      return r.json();
    });
  }

  function init() {
    applyStaticI18n();
    Promise.all([
      loadJSON("data/champions.json"),
      // Real GRID-derived aggregates ship as scouting.json; the labeled
      // sample dataset is the fallback if that file is absent.
      loadJSON("data/scouting.json").catch(function () {
        return loadJSON("data/scouting.sample.json");
      }),
      loadJSON("data/demo_series.json").catch(function () { return null; })
    ]).then(function (results) {
      state.champions = results[0].champions;
      state.championIds = state.champions.map(function (c) {
        c._search = (c.name + "\n" + (c.nameZh || "") + "\n" + c.id).toLowerCase();
        state.champById[c.id] = c;
        state.rolesOf[c.id] = c.roles;
        return c.id;
      });
      state.scouting = results[1];
      state.demo = results[2];
      renderDataBadge();
      buildGrid(); // tiles are built once; later renders update in place
      buildTeamSelects();
      buildScoutTeamOptions();
      buildCopilotOptions();
      syncCopilotOpponentToRed(); // copilot + depletion follow the Red pick
      if (!restoreSavedSeries()) {
        // First visit (no saved series): land inside the demo BO5 at
        // Game 3 so the Fearless state is visible at a glance; fall
        // back to a fresh series if the demo data is unavailable.
        if (!preloadDemo()) newSeries();
      }
      initLLMSettings();
      renderScouting();
    }).catch(function (err) {
      $("data-badge").textContent = t("app.loadError", { msg: err.message });
    });
  }

  function renderDataBadge() {
    var meta = state.scouting.meta || {};
    var badge = $("data-badge");
    if (meta.kind === "grid") {
      badge.textContent = t("badge.grid");
      badge.classList.add("real");
      $("footer-data").textContent = t("footer.gridData");
    } else {
      badge.textContent = t("badge.sample");
      $("footer-data").textContent = t("footer.sampleData");
    }
  }

  /* ---------------- language switching ---------------- */

  function applyStaticI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      el.placeholder = t(el.getAttribute("data-i18n-ph"));
    });
    document.title = t("app.title");
    document.documentElement.lang =
      window.I18n.getLocale() === "zh" ? "zh-CN" : "en";
    $("wr-wrap").title = t("wr.title");
    $("grid-search").setAttribute("aria-label", t("grid.searchPh"));
    document.querySelectorAll("[data-lang-opt]").forEach(function (el) {
      el.classList.toggle("active",
        el.getAttribute("data-lang-opt") === window.I18n.getLocale());
    });
  }

  function setLanguage(loc) {
    window.I18n.setLocale(loc);
    applyStaticI18n();
    buildPresetOptions();
    refreshLLMButtons();
    // Demo buttons are JS-created; refresh their labels without
    // disturbing a demo in progress (pause label included).
    stepBtn.textContent = t("demo.step");
    autoBtn.textContent = state.demoTimer ? t("demo.pause") : t("demo.autoplay");
    if (state.series) renderDraft();
    if (state.scouting) {
      renderDataBadge(); // badge + footer provenance follow the language
      // The copilot opponent select's placeholder option is localized;
      // rebuild the options but keep the current selection.
      var opp = $("copilot-opp").value;
      buildCopilotOptions();
      $("copilot-opp").value = opp;
      renderScouting();
    }
  }

  /* ---------------- draft room ---------------- */

  function championStats() {
    return state.scouting ? Scouting.championStats(state.scouting) : {};
  }

  /* ---------------- team selection (setup selects) ----------------
   * The Blue/Red setup fields are <select>s over the dataset's team
   * list (data/scouting.json): option values are team ids, while the
   * series itself stores NAMES (DraftCore is name-based). A name with
   * no dataset entry (the demo's fictional "Sentinels Five") rides a
   * synthetic "name:<name>" option so it can still be selected and
   * displayed faithfully. */
  function teamOptionsHTML() {
    return state.scouting.teams.map(function (tm) {
      return '<option value="' + esc(tm.id) + '">' +
        esc(tm.name + " (" + tm.tag + ")") + "</option>";
    }).join("");
  }

  function buildTeamSelects() {
    var html = teamOptionsHTML();
    $("setup-blue").innerHTML = html;
    $("setup-red").innerHTML = html;
    // Defaults: T1 on blue, Gen.G on red (fallbacks: first two teams).
    $("setup-blue").value = findTeamId(["t1"], "T1", "T1", 0);
    $("setup-red").value = findTeamId(["geng"], "GEN", "Gen.G", 1);
  }

  function findTeamId(ids, tag, namePrefix, fallbackIdx) {
    var teams = state.scouting.teams;
    for (var i = 0; i < ids.length; i++) {
      var byId = teams.find(function (tm) { return tm.id === ids[i]; });
      if (byId) return byId.id;
    }
    var byTag = teams.find(function (tm) { return tm.tag === tag; });
    if (byTag) return byTag.id;
    var byName = teams.find(function (tm) {
      return tm.name.indexOf(namePrefix) === 0;
    });
    if (byName) return byName.id;
    return teams[Math.min(fallbackIdx, teams.length - 1)].id;
  }

  /* Select value -> team name for DraftCore (dataset id lookup, or
   * the synthetic "name:" passthrough for non-dataset names). */
  function teamNameFor(value) {
    if (!value) return "";
    if (value.indexOf("name:") === 0) return value.slice(5);
    var tm = Scouting.teamById(state.scouting, value);
    return tm ? tm.name : value;
  }

  /* Team name -> select value; creates the synthetic option (in both
   * selects, so either side can hold it) when the name is not a
   * dataset team. */
  function teamValueForName(name) {
    var tm = state.scouting.teams.find(function (x) { return x.name === name; });
    if (tm) return tm.id;
    var value = "name:" + name;
    ["setup-blue", "setup-red"].forEach(function (id) {
      var sel = $(id);
      var exists = Array.prototype.some.call(sel.options, function (o) {
        return o.value === value;
      });
      if (!exists) {
        var opt = document.createElement("option");
        opt.value = value;
        opt.textContent = name;
        sel.appendChild(opt);
      }
    });
    return value;
  }

  function setTeamSelects(blueValue, redValue) {
    if (blueValue) $("setup-blue").value = blueValue;
    if (redValue) $("setup-red").value = redValue;
  }

  /* Copilot linkage: the copilot opponent (and with it the depletion
   * panel) follows the RED team chosen at the top. A manual copilot
   * change afterwards stands until the Red select changes again. A
   * synthetic non-dataset red team has no profile to link to, so the
   * copilot selection is left as it is in that case. */
  function syncCopilotOpponentToRed() {
    var red = $("setup-red").value;
    if (!red || red.indexOf("name:") === 0) return;
    if (!Scouting.teamById(state.scouting, red)) return;
    var opp = $("copilot-opp");
    if (opp && opp.value !== red) {
      opp.value = red;
      clearNarrate("copilot-llm-out");
    }
  }

  function newSeries() {
    stopDemo();
    hideDemoNotice(); // an explicit fresh start retires the preload note
    clearSavedSeries(); // an explicit new series replaces the saved one
    state.series = DraftCore.createSeries({
      format: $("setup-format").value,
      blueName: teamNameFor($("setup-blue").value) || "Blue",
      redName: teamNameFor($("setup-red").value) || "Red",
      patch: $("setup-patch").value.trim(),
      championStats: championStats()
    });
    renderDraft();
  }

  /* ---------------- series persistence (sessionStorage) ----------------
   * The in-progress series is saved on every render and restored on
   * load, so an accidental refresh mid-draft loses nothing. Storage is
   * best-effort: any failure (private mode, quota) is ignored. */
  var SERIES_KEY = "fdr.series.v1";
  function saveSeries() {
    try {
      if (state.series) {
        // The snapshot travels with the setup selects' team ids, so a
        // restore re-selects exactly the same matchup.
        sessionStorage.setItem(SERIES_KEY, JSON.stringify({
          series: DraftCore.serializeSeries(state.series),
          blueSel: $("setup-blue").value,
          redSel: $("setup-red").value
        }));
      }
    } catch (e) { /* persistence is best-effort */ }
  }
  function clearSavedSeries() {
    try { sessionStorage.removeItem(SERIES_KEY); } catch (e) {}
  }
  function restoreSavedSeries() {
    try {
      var raw = sessionStorage.getItem(SERIES_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      // Current saves wrap the snapshot with the selects' team ids;
      // older saves stored the bare snapshot — accept both.
      var snap = parsed && parsed.series ? parsed.series : parsed;
      var s = DraftCore.restoreSeries(snap, championStats());
      if (!s) return false;
      state.series = s;
      // Reflect the restored series in the setup inputs.
      $("setup-format").value = s.format;
      if (parsed && parsed.blueSel && parsed.redSel) {
        teamValueForName(s.teams[0]); // ensure synthetic options exist
        teamValueForName(s.teams[1]);
        setTeamSelects(parsed.blueSel, parsed.redSel);
      } else {
        setTeamSelects(teamValueForName(s.teams[0]),
          teamValueForName(s.teams[1]));
      }
      $("setup-patch").value = s.patch || "";
      syncCopilotOpponentToRed(); // copilot follows the restored Red team
      renderDraft();
      return true;
    } catch (e) { return false; }
  }

  /* Display name in the active locale (nameZh when in 中文 mode). */
  function champName(id) {
    var c = state.champById[id];
    if (!c) return id;
    return window.I18n.getLocale() === "zh" && c.nameZh ? c.nameZh : c.name;
  }

  function iconHTML(c, cls) {
    var display = champName(c.id);
    return '<img class="' + (cls || "") + '" src="' + esc(c.icon) + '" alt="' +
      esc(display) + '" loading="lazy" decoding="async" data-icon-fallback="' +
      esc(display.charAt(0)) + '">';
  }

  function phaseText(step, blueName, redName) {
    var s = state.series;
    var game = DraftCore.currentGame(s);
    if (!step) {
      return t("phase.complete", { game: game.number });
    }
    var idx = game.actions.length;
    var phase = idx < 6 ? t("phase.ban1") : idx < 12 ? t("phase.pick1")
      : idx < 16 ? t("phase.ban2") : t("phase.pick2");
    var team = esc(step.side === "B" ? blueName : redName);
    var verb = step.type === "ban" ? t("common.banVerb") : t("common.pickVerb");
    var kind = step.type === "ban"
      ? '<span class="phase-kind-ban">' + t("kind.ban") + "</span>"
      : '<span class="phase-kind-pick">' + t("kind.pick") + "</span>";
    return t("phase.turn", { phase: phase, team: team, verb: verb, kind: kind }) +
      ' <span style="color:var(--muted);font-size:12px">(' + (idx + 1) + "/20)</span>";
  }

  function renderDraft() {
    var s = state.series;
    if (!s) return;
    var game = DraftCore.currentGame(s);
    var b = DraftCore.gameBreakdown(game);
    var step = DraftCore.nextAction(s);
    var blueName = DraftCore.blueTeamName(s);
    var redName = DraftCore.redTeamName(s);

    /* Pick/ban animation bookkeeping: when the action count grew by
     * exactly one since the previous render, the newest action's slot
     * pops and its grid tile flashes (CSS keyframes, transient classes,
     * no timers; the global reduced-motion rule stills them). Any
     * other transition (undo, reset, restore, language switch) just
     * re-baselines the signature without animating. */
    var lastAction = game.actions[game.actions.length - 1] || null;
    var animateLast = !!(lastAction && state.animSig &&
      state.animSig.game === game.number &&
      game.actions.length === state.animSig.count + 1);
    state.animSig = { game: game.number, count: game.actions.length };
    var popKey = animateLast
      ? (lastAction.side === "B" ? "blue" : "red") + "-" + lastAction.type
      : null;
    state.flashChamp = animateLast ? lastAction.championId : null;
    state.flashCls = animateLast
      ? (lastAction.type === "ban" ? " flash flash-ban"
        : " flash flash-" + (lastAction.side === "B" ? "blue" : "red"))
      : "";

    // Panels show the CURRENT game's side assignment (teams may swap
    // sides between games); the series score is per TEAM.
    $("name-blue").textContent = blueName;
    $("name-red").textContent = redName;
    $("series-score").textContent = t("draft.scoreLine", {
      blue: s.teams[0], bw: s.wins[0], rw: s.wins[1], red: s.teams[1],
      game: game.number, format: s.format
    });
    var phaseEl = $("phase-label");
    phaseEl.innerHTML = phaseText(step, blueName, redName);

    // The phase banner pulses once when the draft moves into a new
    // phase (or a new game). Re-adding the class after a reflow
    // restarts the keyframe; no timers involved.
    var stepIdx = game.actions.length;
    var phaseIdx = !step ? 4
      : stepIdx < 6 ? 0 : stepIdx < 12 ? 1 : stepIdx < 16 ? 2 : 3;
    var phaseKey = game.number + ":" + phaseIdx;
    phaseEl.classList.remove("pulse");
    if (state.phaseKey && state.phaseKey !== phaseKey) {
      void phaseEl.offsetWidth;
      phaseEl.classList.add("pulse");
    }
    state.phaseKey = phaseKey;

    // Turn highlight
    $("panel-blue").classList.toggle("active-turn", !!step && step.side === "B");
    $("panel-red").classList.toggle("active-turn", !!step && step.side === "R");

    renderSlots("bans-blue", b.blue.bans, 5, true, popKey === "blue-ban" ? "ban" : null);
    renderSlots("picks-blue", b.blue.picks, 5, false, popKey === "blue-pick" ? "pick-blue" : null);
    renderSlots("bans-red", b.red.bans, 5, true, popKey === "red-ban" ? "ban" : null);
    renderSlots("picks-red", b.red.picks, 5, false, popKey === "red-pick" ? "pick-red" : null);
    $("btn-win-blue").classList.toggle("won", game.winner === "blue");
    $("btn-win-red").classList.toggle("won", game.winner === "red");
    $("btn-win-blue").textContent =
      game.winner === "blue" ? t("draft.wonDone") : t("draft.wonBtn");
    $("btn-win-red").textContent =
      game.winner === "red" ? t("draft.wonDone") : t("draft.wonBtn");

    // Pool banner — the Fearless headline
    var ps = DraftCore.poolStats(s, state.champions.length);
    $("pool-banner").innerHTML =
      "<div>" + t("pool.banner", {
        game: game.number, count: ps.fearlessCount,
        pct: ps.percentAvailable, avail: ps.availableAtStart,
        total: ps.totalChampions
      }) + "</div>" +
      '<div class="pool-meter"><div class="track"><div class="fill" style="width:' +
      ps.percentAvailable + '%"></div></div></div>';

    // Win-rate bar
    var p = DraftCore.heuristicWinProbability(s);
    $("wr-blue").style.width = (p.blue * 100) + "%";
    $("wr-red").style.width = (p.red * 100) + "%";
    $("wr-text").textContent =
      blueName + " " + Math.round(p.blue * 100) + "% — " +
      Math.round(p.red * 100) + "% " + redName;

    // Game tabs
    $("game-tabs").innerHTML = s.games.map(function (g, i) {
      var cls = "game-tab" + (i === s.currentGame ? " current" : "") +
        (g.actions.length >= 20 ? " done" : "");
      return '<span class="' + cls + '">G' + g.number +
        (g.winner ? " ✓" : "") + "</span>";
    }).join("");

    $("btn-next-game").disabled = !DraftCore.isGameComplete(s) ||
      DraftCore.seriesDecided(s) ||
      s.games.length >= DraftCore.FORMATS[s.format];
    // Side swap is only legal before the current game's first action.
    $("btn-swap-sides").disabled = game.actions.length > 0;
    renderGrid();
    state.flashChamp = null; // the tile flash belongs to this render only
    state.flashCls = "";
    renderSummary();
    renderComp();
    renderDepletion();
    renderCopilot();
    saveSeries(); // persist the in-progress series on every render
    if (window.Showcase) window.Showcase.sync(state);
  }

  /* anim: when the final filled slot is the action that just landed it
   * gets the one-shot v2 animation (see renderDraft) — "ban" adds the
   * slash-sweep slot, "pick-blue"/"pick-red" the slam-in slot with its
   * expanding team-color ring element. */
  function renderSlots(elId, ids, total, isBan, anim) {
    var html = "";
    for (var i = 0; i < total; i++) {
      if (i < ids.length) {
        var c = state.champById[ids[i]];
        var cls = "", fx = "";
        if (anim && i === ids.length - 1) {
          if (anim === "ban") {
            cls = " anim-ban";
            fx = '<span class="slot-slash" aria-hidden="true"></span>';
          } else {
            cls = " anim-pick anim-" + (anim === "pick-blue" ? "blue" : "red");
            fx = '<span class="slot-ring" aria-hidden="true"></span>';
          }
        }
        html += '<div class="slot' + (isBan ? " ban-slot" : "") + cls + '">' +
          (c ? iconHTML(c) : "") + "<span>" + esc(champName(ids[i])) + "</span>" + fx + "</div>";
      } else {
        html += '<div class="slot empty">' +
          (isBan ? t("slot.banEmpty") : t("slot.pickEmpty")) + "</div>";
      }
    }
    $(elId).innerHTML = html;
  }

  /* Champion grid: the tiles are built ONCE as real <button>s, cached
   * by champion id along with their inner badge/name spans and last
   * rendered values. Filtering and state updates diff in place — no
   * querySelector calls or redundant DOM writes on unchanged tiles. */
  var tileCache = {};
  var gridBuilt = false;
  function buildGrid() {
    var grid = $("champion-grid");
    grid.innerHTML = "";
    tileCache = {};
    var frag = document.createDocumentFragment();
    state.champions.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.dataset.champ = c.id;
      b.innerHTML = iconHTML(c) +
        '<span class="badge-slot"></span>' +
        '<span class="tname"></span>';
      frag.appendChild(b);
      tileCache[c.id] = {
        el: b,
        badge: b.querySelector(".badge-slot"),
        name: b.querySelector(".tname"),
        lastHidden: false,
        lastDisabled: false,
        lastCls: "tile",
        lastBadge: "",
        lastTitle: "",
        lastName: ""
      };
    });
    grid.appendChild(frag);
    gridBuilt = true;
    updateGridTiles();
  }

  function updateGridTiles() {
    if (!gridBuilt) return;
    var s = state.series;
    var fearless = s ? DraftCore.fearlessPool(s) : new Map();
    var used = s ? DraftCore.usedInCurrentGame(s) : new Set();
    var pickedBy = {}, bannedThisGame = {};
    if (s) {
      DraftCore.currentGame(s).actions.forEach(function (a) {
        if (a.type === "pick") pickedBy[a.championId] = a.side === "B" ? "blue" : "red";
        if (a.type === "ban") bannedThisGame[a.championId] = true;
      });
    }
    var q = state.search.toLowerCase();
    var banLabel = t("kind.ban");
    var anyVisible = false;
    state.champions.forEach(function (c) {
      var rec = tileCache[c.id];
      if (!rec) return;
      var el = rec.el;
      var visible = true;
      if (state.roleFilter !== "All" && c.roles.indexOf(state.roleFilter) === -1) visible = false;
      if (q && c._search.indexOf(q) === -1) visible = false;
      var hidden = !visible;
      if (rec.lastHidden !== hidden) {
        el.hidden = hidden;
        rec.lastHidden = hidden;
      }
      if (visible) anyVisible = true;
      var cls = "tile";
      var badge = "";
      var unavailable = false;
      if (fearless.has(c.id)) {
        cls += " fearless";
        unavailable = true;
        badge = '<span class="fearless-badge">F·G' + fearless.get(c.id) + "</span>";
      } else if (used.has(c.id)) {
        unavailable = true;
        if (pickedBy[c.id]) {
          cls += " used picked";
          badge = '<span class="picked-badge ' + pickedBy[c.id] + '">' +
            (pickedBy[c.id] === "blue" ? "B" : "R") + "</span>";
        } else if (bannedThisGame[c.id]) {
          cls += " used banned";
          badge = '<span class="banned-badge">' + banLabel + "</span>";
        } else {
          cls += " used";
        }
      }
      if (state.flashChamp === c.id) cls += state.flashCls;
      if (rec.lastCls !== cls) {
        el.className = cls;
        rec.lastCls = cls;
      }
      if (rec.lastDisabled !== unavailable) {
        el.disabled = unavailable;
        rec.lastDisabled = unavailable;
      }
      var display = champName(c.id);
      var title = display + " — " + c.roles.map(roleName).join("/");
      if (rec.lastTitle !== title) {
        el.title = title;
        rec.lastTitle = title;
      }
      if (rec.lastBadge !== badge) {
        rec.badge.innerHTML = badge;
        rec.lastBadge = badge;
      }
      if (rec.lastName !== display) {
        rec.name.textContent = display;
        rec.lastName = display;
      }
    });
    $("grid-empty").hidden = anyVisible;
  }

  function renderGrid() { updateGridTiles(); }

  function renderSummary() {
    var s = state.series;
    var nameOf = champName;
    $("series-summary").innerHTML = s.games.map(function (g) {
      var b = DraftCore.gameBreakdown(g);
      var fearlessAfter = DraftCore.fearlessPool(s, g.number);
      var fmt = function (ids) {
        return ids.map(function (id) { return esc(nameOf(id)); }).join(", ") || "—";
      };
      // Names follow THIS game's side assignment, not game 1's.
      var gBlue = DraftCore.gameBlueName(s, g);
      var gRed = DraftCore.gameRedName(s, g);
      return '<div class="game-summary"><h4>' +
        t("summary.game", { game: g.number }) +
        (g.winner ? t("summary.wonSuffix", {
          team: esc(g.winner === "blue" ? gBlue : gRed)
        }) : "") +
        "</h4>" +
        "<div><b style='color:var(--blue)'>" + esc(gBlue) + "</b> " +
        t("summary.picksLabel") + ": " + fmt(b.blue.picks) + "</div>" +
        "<div><b style='color:var(--red)'>" + esc(gRed) + "</b> " +
        t("summary.picksLabel") + ": " + fmt(b.red.picks) + "</div>" +
        "<div>" + t("summary.bansLine", {
          list: fmt(b.blue.bans.concat(b.red.bans))
        }) + "</div>" +
        (fearlessAfter.size
          ? '<div class="fearless-line">' + t("summary.fearlessAfter", {
              count: fearlessAfter.size,
              list: fmt(Array.from(fearlessAfter.keys()))
            }) + "</div>"
          : "") +
        "</div>";
    }).join("");
    $("export-text").value = DraftCore.exportText(s, nameOf);
  }

  /* ---------------- composition radar + pool depletion ----------------
   * Both panels are pure renderings of js/comp.js over the current
   * series state; they refresh inside renderDraft (and the depletion
   * panel also when the copilot opponent changes). The containers
   * carry .fade-update, so each refresh fades in softly. */

  var RADAR_DIMS = [
    { key: "engage", label: "comp.dim.engage" },
    { key: "frontline", label: "comp.dim.frontline" },
    { key: "control", label: "comp.dim.control" },
    { key: "scaling", label: "comp.dim.scaling" },
    { key: "balance", label: "comp.dim.balance" }
  ];

  function radarSVG(blueComp, redComp) {
    // The viewBox is wider than the plot (cx=142 in a 284-wide box):
    // the near-horizontal axis labels ("Damage mix", "Frontline")
    // extend ~60 units from their anchor and were clipped at the
    // viewBox edges in a 220-wide box. The extra horizontal padding
    // plus the inward nudge below keep every label fully visible.
    var cx = 142, cy = 98, R = 62;
    function pt(i, frac) {
      var ang = (-90 + i * 72) * Math.PI / 180;
      return (cx + R * frac * Math.cos(ang)).toFixed(1) + "," +
        (cy + R * frac * Math.sin(ang)).toFixed(1);
    }
    function poly(comp) {
      if (!comp.picks) return "";
      return RADAR_DIMS.map(function (d, i) {
        return pt(i, comp[d.key] / 10);
      }).join(" ");
    }
    var html = '<svg class="radar" viewBox="0 0 284 196" role="img">';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      html += '<polygon class="radar-grid" points="' +
        RADAR_DIMS.map(function (d, i) { return pt(i, f); }).join(" ") + '"/>';
    });
    RADAR_DIMS.forEach(function (d, i) {
      var axis = pt(i, 1).split(",");
      html += '<line class="radar-axis" x1="' + cx + '" y1="' + cy +
        '" x2="' + axis[0] + '" y2="' + axis[1] + '"/>';
      var lp = pt(i, 1.24).split(",");
      var lx = parseFloat(lp[0]), ly = parseFloat(lp[1]);
      var anchor = lx > cx + 8 ? "start" : lx < cx - 8 ? "end" : "middle";
      // Near-horizontal labels grow outward from the anchor; pull
      // them 4 units toward the center so long words stay in frame.
      if (Math.abs(lx - cx) > 60) lx += lx < cx ? 4 : -4;
      html += '<text class="radar-label" x="' + lx.toFixed(1) + '" y="' +
        (ly + 3.5).toFixed(1) + '" text-anchor="' + anchor + '">' +
        esc(t(d.label)) + "</text>";
    });
    if (redComp.picks) {
      html += '<polygon class="radar-poly red" points="' + poly(redComp) + '"/>';
    }
    if (blueComp.picks) {
      html += '<polygon class="radar-poly blue" points="' + poly(blueComp) + '"/>';
    }
    return html + "</svg>";
  }

  function renderComp() {
    var s = state.series;
    if (!s) return;
    var b = DraftCore.gameBreakdown(DraftCore.currentGame(s));
    var blue = Comp.teamComposition(state.champById, b.blue.picks);
    var red = Comp.teamComposition(state.champById, b.red.picks);
    var body = $("comp-body");
    if (!blue.picks && !red.picks) {
      body.innerHTML = '<p class="comp-empty">' + t("comp.empty") + "</p>";
      return;
    }
    body.innerHTML =
      '<div class="radar-wrap">' + radarSVG(blue, red) + "</div>" +
      '<div class="radar-legend">' +
      '<span><span class="dot blue"></span>' + esc(DraftCore.blueTeamName(s)) + "</span>" +
      '<span><span class="dot red"></span>' + esc(DraftCore.redTeamName(s)) + "</span>" +
      "</div>" +
      '<p class="comp-note">' + t("comp.note") + "</p>";
  }

  function renderDepletion() {
    var body = $("depl-body");
    if (!body || !state.series || !state.scouting) return;
    var oppId = $("copilot-opp").value || null;
    var prof = oppId ? Scouting.profile(state.scouting, oppId) : null;
    var dep = prof ? Comp.poolDepletion(prof, state.series) : null;
    if (!dep) {
      body.innerHTML = '<p class="depl-hint">' + t("depl.noOpponent") + "</p>";
      return;
    }
    var team = Scouting.teamById(state.scouting, oppId);
    body.innerHTML = Comp.ROLES.map(function (role) {
      var r = dep.roles[role];
      if (!r || !r.total) return "";
      var player = team && team.players ? team.players[role] : null;
      var chips = r.champions.map(function (c) {
        var ch = state.champById[c.champion];
        return '<span class="depl-chip' + (c.available ? "" : " gone") + '">' +
          (ch ? iconHTML(ch) : "") + esc(champName(c.champion)) + "</span>";
      }).join("");
      return '<div class="depl-row' + (r.alert ? " alert" : "") + '">' +
        '<div class="depl-head"><b>' + roleName(role) + "</b>" +
        (player ? ' <span class="player">' + esc(player) + "</span>" : "") +
        '<span class="depl-count">' +
        t("depl.left", { left: r.remaining, total: r.total }) + "</span>" +
        (r.alert ? '<span class="depl-dry">' + t("depl.dry") + "</span>" : "") +
        '</div><div class="depl-chips">' + chips + "</div></div>";
    }).join("");
  }

  /* ---------------- demo mode ----------------
   * The demo is a fully scripted BO5 (data/demo_series.json). Loading it
   * queues every action; "Demo step" applies one action, "Auto-play"
   * applies one every 900ms. This is exactly the flow the demo video
   * script (docs/video-script.md) walks through. */
  /* Point the setup controls at the demo's matchup (format, teams,
   * patch). The demo's blue team is a dataset team; its red team is
   * fictional and rides a synthetic select option. */
  function setDemoMatchup() {
    $("setup-format").value = state.demo.format;
    setTeamSelects(teamValueForName(state.demo.meta.blueName),
      teamValueForName(state.demo.meta.redName));
    $("setup-patch").value = state.demo.patch || "";
  }

  function hideDemoNotice() {
    var n = $("demo-notice");
    if (n) n.hidden = true;
  }

  /* First-load preload: a first-time visitor should see the product,
   * not an empty board. With no saved series, the demo BO5 is
   * preloaded INSIDE Game 3 — Games 1–2 complete (20 champions
   * fearless-banned, series score 1–1) and Game 3 played through the
   * end of Pick Phase 1 (12 actions: 6 bans + 6 picks, three picks
   * per side), so both composition-radar polygons are formed and the
   * depletion panel shows real consumption against the fearless pool.
   * The state is then saved like any other series, so a refresh
   * restores it instead of preloading again. */
  var PRELOAD_G3_ACTIONS = 12; // 6 bans + Pick Phase 1 (3 picks a side)
  function preloadDemo() {
    if (!state.demo) return false;
    try {
      setDemoMatchup();
      newSeries();
      var s = state.series;
      for (var gi = 0; gi < 2; gi++) {
        state.demo.games[gi].actions.forEach(function (a) {
          DraftCore.applyAction(s, a.champion);
        });
        DraftCore.setWinner(s, state.demo.games[gi].winner);
        if (!DraftCore.advanceGame(s)) return false;
      }
      state.demo.games[2].actions.slice(0, PRELOAD_G3_ACTIONS)
        .forEach(function (a) { DraftCore.applyAction(s, a.champion); });
    } catch (e) {
      return false; // script mismatch -> caller starts a fresh series
    }
    state.preloadedDemo = true;
    renderDraft();
    if (!state.noticeDismissed) $("demo-notice").hidden = false;
    return true;
  }

  function loadDemo() {
    if (!state.demo) { toast(t("demo.noData")); return; }
    stopDemo();
    setDemoMatchup();
    newSeries();
    syncCopilotOpponentToRed();
    state.demoQueue = [];
    state.demo.games.forEach(function (g, gi) {
      g.actions.forEach(function (a) {
        state.demoQueue.push({ kind: "action", champion: a.champion, expect: a });
      });
      state.demoQueue.push({ kind: "winner", side: g.winner });
      if (gi < state.demo.games.length - 1) state.demoQueue.push({ kind: "advance" });
    });
    $("btn-demo-step").style.display = "";
    $("btn-demo-auto").style.display = "";
    renderDraft();
  }

  function demoStep() {
    var step = state.demoQueue.shift();
    if (!step) { stopDemo(); return false; }
    var s = state.series;
    try {
      if (step.kind === "action") DraftCore.applyAction(s, step.champion);
      else if (step.kind === "winner") DraftCore.setWinner(s, step.side);
      else if (step.kind === "advance") DraftCore.advanceGame(s);
    } catch (e) {
      stopDemo();
      toast(t("demo.stopped", { msg: e.message }));
      return false;
    }
    renderDraft();
    return state.demoQueue.length > 0;
  }

  function stopDemo() {
    if (state.demoTimer) { clearInterval(state.demoTimer); state.demoTimer = null; }
    state.demoQueue = [];
    var a = $("btn-demo-auto"), st = $("btn-demo-step");
    if (a) { a.style.display = "none"; a.textContent = t("demo.autoplay"); }
    if (st) st.style.display = "none";
  }

  /* ---------------- scouting view ---------------- */

  function buildScoutTeamOptions() {
    $("scout-team").innerHTML = teamOptionsHTML();
  }

  function pct(x) { return Math.round(x * 100) + "%"; }

  function barRow(label, count, max, extra) {
    var w = max ? Math.round((count / max) * 100) : 0;
    return "<tr><td>" + esc(label) + "</td><td>" + count + (extra || "") +
      '</td><td class="bar-cell"><div class="mini-track"><div class="mini-fill" style="width:' +
      w + '%"></div></div></td></tr>';
  }

  function renderScouting() {
    var data = state.scouting;
    if (!data) return;
    var teamId = $("scout-team").value || data.teams[0].id;
    var team = Scouting.teamById(data, teamId);
    var prof = Scouting.profile(data, teamId) || { games: 0, wins: 0 };
    $("scout-meta").textContent = t("scout.meta", {
      team: team.name, games: prof.games, wins: prof.wins,
      pct: prof.games ? pct(prof.wins / prof.games) : "—",
      label: data.meta.label || ""
    });

    // First picks
    var fp = Scouting.firstPickFrequency(data, teamId, 5);
    var fpMax = fp.rows.length ? fp.rows[0].count : 0;
    $("scout-firstpicks").innerHTML =
      '<table class="tend">' + fp.rows.map(function (r) {
        return barRow(champName(r.champion), r.count, fpMax,
          ' <span style="color:var(--muted)">' +
          t("scout.fpExtra", { share: pct(r.count / fp.n), n: fp.n }) + "</span>");
      }).join("") + "</table>";

    // Banned against
    var ba = Scouting.bannedAgainst(data, teamId, 8);
    var baMax = ba.rows.length ? ba.rows[0].count : 0;
    $("scout-banned").innerHTML =
      '<table class="tend">' + ba.rows.map(function (r) {
        return barRow(champName(r.champion), r.count, baMax,
          ' <span style="color:var(--muted)">' +
          t("scout.baExtra", { share: pct(r.count / ba.n) }) + "</span>");
      }).join("") + "</table>";

    // Role pools
    var pools = Scouting.rolePools(data, teamId);
    var roleOrder = ["Top", "Jungle", "Mid", "ADC", "Support"];
    $("scout-pools").innerHTML = roleOrder.map(function (role) {
      var pool = pools[role];
      if (!pool) return "";
      var rows = pool.champions.map(function (c) {
        return "<tr><td>" + esc(champName(c.champion)) + "</td><td>" + c.games +
          "</td><td>" + pct(c.winRate) + "</td></tr>";
      }).join("");
      return '<div class="pool-role"><h4>' + roleName(role) +
        ' <span class="player">' + esc(pool.player || "") + " · " +
        t("scout.distinct", { count: pool.distinct }) +
        '</span></h4><table class="tend"><tr><th>' + t("scout.colChampion") +
        "</th><th>" + t("scout.colGames") + "</th><th>" + t("scout.colWR") +
        "</th></tr>" + rows + "</table></div>";
    }).join("");

    // Fearless shift
    var shift = Scouting.fearlessShift(data, teamId);
    if (!shift.byGame.length) {
      $("scout-shift").innerHTML =
        '<p style="color:var(--muted)">' + t("scout.noShift") + "</p>";
    } else {
      $("scout-shift").innerHTML =
        '<table class="shift-table"><tr><th>' + t("scout.shiftColGame") +
        "</th><th>" + t("scout.shiftColTop") + "</th><th>" +
        t("scout.shiftColOwn") + "</th><th>" + t("scout.shiftColShared") +
        "</th></tr>" +
        shift.byGame.map(function (row) {
          return "<tr><td><b>G" + row.gameNumber + "</b></td><td>" +
            row.topPicks.map(function (r) {
              return esc(champName(r.champion)) + " ×" + r.count;
            }).join(", ") +
            "</td><td>" + row.removedCount + "</td><td>" +
            t("scout.shiftUnit", { count: row.poolRemoved }) +
            "</td></tr>";
        }).join("") + "</table>" +
        '<p style="color:var(--muted);font-size:12px">' +
        t("scout.shiftNote", { n: shift.seriesCount }) + "</p>";
    }

    // Side splits (blue vs red): record + top-5 tables per side
    var splits = Scouting.sideSplits(data, teamId);
    if (!splits) {
      $("scout-sides").innerHTML =
        '<p style="color:var(--muted)">' + t("scout.noSides") + "</p>";
    } else {
      var sideCol = function (labelKey, s) {
        var fpMax = s.firstPicks.length ? s.firstPicks[0].count : 0;
        var baMax = s.bannedAgainst.length ? s.bannedAgainst[0].count : 0;
        return '<div class="side-col"><h4>' + t(labelKey) + "</h4>" +
          '<p class="side-record">' +
          t("scout.sideRecord", {
            games: s.games, wins: s.wins,
            wr: s.games ? pct(s.winRate) : "—"
          }) + "</p>" +
          "<h5>" + t("scout.sideFirstPicks") + '</h5><table class="tend">' +
          s.firstPicks.map(function (r) {
            return barRow(champName(r.champion), r.count, fpMax);
          }).join("") + "</table>" +
          "<h5>" + t("scout.sideBannedAgainst") + '</h5><table class="tend">' +
          s.bannedAgainst.map(function (r) {
            return barRow(champName(r.champion), r.count, baMax);
          }).join("") + "</table></div>";
      };
      $("scout-sides").innerHTML = '<div class="side-cols">' +
        sideCol("scout.blueSide", splits.blue) +
        sideCol("scout.redSide", splits.red) + "</div>";
    }

    // Insights (champion names localized via champName)
    var cards = Scouting.insights(data, teamId, champName);
    $("scout-insights").innerHTML = cards.length ? cards.map(function (c) {
      return '<div class="insight ' + c.type + '"><h4>' + esc(c.title) + "</h4><p>" +
        esc(c.body) + '</p><span class="n">' +
        t("scout.sampleN", { n: c.n }) + "</span></div>";
    }).join("") : '<p style="color:var(--muted)">' + t("scout.noInsights") + "</p>";

    renderBrief(teamId);
  }

  /* ---------------- AI brief ---------------- */

  function renderBrief(teamId) {
    var brief = BriefGen.generateBrief(state.scouting, teamId, champName,
      state.champions.length);
    state.brief = brief;
    var panel = $("brief-panel");
    if (!brief) {
      panel.innerHTML =
        '<p style="color:var(--muted)">' + t("brief.noProfile") + "</p>";
      return;
    }
    var o = brief.overview;
    var rows = function (list) {
      return list.map(function (r) {
        return t("brief.listItem", {
          champ: champName(r.champion), count: r.count, share: pct(r.share)
        });
      }).join(", ");
    };
    var pts = function (x) {
      return t("common.pts", { v: (x >= 0 ? "+" : "") + Math.round(x * 100) });
    };
    var html = "";
    html += '<div class="brief-sec"><h4>' + t("brief.sec1") + "</h4><p>" +
      esc(t("brief.sec1Body", {
        team: brief.teamName, games: o.games, wins: o.wins,
        wr: pct(o.winRate), fp: rows(o.topFirstPicks),
        ba: rows(o.topBannedAgainst)
      })) + "</p>";
    if (brief.sideSplit) {
      var sb = brief.sideSplit;
      var sideText = sb.wrMaterial
        ? t("brief.sideWrLine", {
            wrB: pct(sb.blue.winRate), gamesB: sb.blue.games,
            wrR: pct(sb.red.winRate), gamesR: sb.red.games,
            gap: Math.round(sb.gap * 100)
          })
        : t("brief.sideFpLine", {
            champB: champName(sb.blueTopFp.champion),
            countB: sb.blueTopFp.count, gamesB: sb.blue.games,
            champR: champName(sb.redTopFp.champion),
            countR: sb.redTopFp.count, gamesR: sb.red.games
          });
      if (sb.wrMaterial && sb.fpMaterial) {
        sideText += t("brief.sideFpClause", {
          champB: champName(sb.blueTopFp.champion),
          champR: champName(sb.redTopFp.champion)
        });
      }
      html += "<p>" + esc(sideText) + ' <span class="n">n=' + sb.n +
        "</span></p>";
    }
    html += "</div>";
    html += '<div class="brief-sec"><h4>' + t("brief.sec2") + "</h4>" +
      brief.banTargets.map(function (tg, i) {
        return "<p><b>" + (i + 1) + ". " +
          esc(t("brief.banTargetLine", {
            champ: champName(tg.champion), wrWith: pct(tg.wrWith),
            picked: tg.pickedGames, wrWithout: pct(tg.wrWithout),
            diff: pts(tg.diff)
          })) + '</b> <span class="n">n=' + tg.n + "</span></p>";
      }).join("") + "</div>";
    var pr = brief.firstPick.priority;
    html += '<div class="brief-sec"><h4>' + t("brief.sec3") + "</h4><p>" +
      (pr
        ? "<b>" + esc(t("brief.sec3Priority", {
            champ: champName(pr.champion), count: pr.count, n: pr.n,
            share: pct(pr.teamShare),
            ratio: Math.round(pr.ratio * 10) / 10
          })) + "</b>"
        : esc(t("brief.sec3None", {
            opener: brief.firstPick.rows.length
              ? t("brief.sec3Opener", {
                  champ: champName(brief.firstPick.rows[0].champion),
                  count: brief.firstPick.rows[0].count,
                  n: brief.firstPick.rows[0].n
                })
              : "—"
          }))) +
      "</p></div>";
    var r = brief.lateRisk;
    html += '<div class="brief-sec"><h4>' + t("brief.sec4") + "</h4>";
    if (r.longSeries > 0) {
      html += "<p>" + esc(t("brief.exhaustion", {
          avg: r.avgTop5GoneByG4, top5: r.top5.map(champName).join(", ")
        })) + ' <span class="n">' +
        t("brief.longSeriesN", { n: r.longSeries }) + "</span>" +
        t("common.period") + " " +
        esc(t("brief.dryRoles", {
          roles: r.dryRoles.map(roleName).join(", ") || "—"
        })) + "</p>";
    }
    if (r.g3RemovedAvg != null) {
      html += "<p>" + esc(t("brief.g3Line", {
          removed: r.g3RemovedAvg, pool: r.g3PoolRemovedAvg
        })) + ' <span class="n">' +
        t("brief.seriesN", { n: r.seriesCount }) + "</span>" +
        t("common.period") + "</p>";
    }
    r.shallowRoles.forEach(function (sh) {
      html += "<p>" + esc(t("brief.concentrated", {
          role: roleName(sh.role), c1: champName(sh.champions[0]),
          c2: champName(sh.champions[1]), share: pct(sh.top2Share)
        })) + ' <span class="n">n=' + sh.n + "</span>" +
        t("common.period") + "</p>";
    });
    html += "</div>";
    html += '<div class="brief-sec brief-sec-wide"><h4>' + t("brief.sec5") + "</h4>" +
      brief.seriesPlan.map(function (step) {
        return '<div class="brief-step"><b>' + esc(step.title) + "</b><ul>" +
          step.points.map(function (pt) { return "<li>" + esc(pt) + "</li>"; }).join("") +
          "</ul></div>";
      }).join("") + "</div>";
    panel.innerHTML = html;
  }

  /* ---------------- AI draft copilot ---------------- */

  function buildCopilotOptions() {
    $("copilot-opp").innerHTML =
      '<option value="">' + t("copilot.noneOpp") + "</option>" +
      teamOptionsHTML();
  }

  function renderCopilot() {
    var s = state.series;
    if (!s || !state.scouting) return;
    var advice = Copilot.advise({
      series: s,
      scoutingData: state.scouting,
      opponentId: $("copilot-opp").value || null,
      ourSide: $("copilot-side").value,
      championIds: state.championIds,
      rolesOf: state.rolesOf,
      nameOf: champName
    });
    state.lastAdvice = advice;
    $("copilot-headline").textContent = advice.headline;
    var kindLabel = {
      pick: t("kind.pick"), ban: t("kind.ban"), watch: t("kind.watch")
    };
    $("copilot-recs").innerHTML = advice.recommendations.length
      ? advice.recommendations.map(function (r, i) {
          var c = state.champById[r.champion];
          return '<div class="rec ' + r.kind + '"><div class="rec-rank">' + (i + 1) + '</div>' +
            (c ? iconHTML(c) : "") +
            '<div class="rec-body"><div class="rec-top"><b>' + esc(champName(r.champion)) +
            '</b><span class="rec-kind ' + r.kind + '">' + kindLabel[r.kind] +
            "</span></div><p>" + esc(r.reason) + "</p></div></div>";
        }).join("")
      : '<p style="color:var(--muted)">' + t("copilot.complete") + "</p>";
    $("copilot-warnings").innerHTML = advice.warnings.map(function (w) {
      return '<div class="copilot-warning">' + esc(w) + "</div>";
    }).join("");
  }

  /* ---------------- BYOK LLM narration ---------------- */

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4200);
  }

  function presetLabel(key) {
    var labels = {
      bailian: t("llm.preset.bailian"),
      openai: t("llm.preset.openai"),
      openrouter: t("llm.preset.openrouter"),
      gemini: t("llm.preset.gemini"),
      custom: t("llm.preset.custom")
    };
    return labels[key] || key;
  }

  function refreshLLMButtons() {
    var ok = LLM.isConfigured();
    document.querySelectorAll(".llm-btn").forEach(function (b) {
      b.disabled = !ok;
    });
    document.querySelectorAll(".llm-hint").forEach(function (h) {
      h.textContent = ok ? t("llm.hintOn") : t("llm.hintOff");
    });
    var cfg = LLM.getConfig();
    $("llm-status").textContent = ok
      ? t("llm.statusSaved", {
          preset: presetLabel(cfg.preset), model: cfg.model, url: cfg.baseUrl
        })
      : t("llm.statusNone");
  }

  function buildPresetOptions() {
    var sel = $("llm-preset");
    var current = sel.value;
    sel.innerHTML = LLM.PRESET_ORDER.map(function (k) {
      return '<option value="' + k + '">' + presetLabel(k) + "</option>";
    }).join("");
    if (current && LLM.PRESETS[current]) sel.value = current;
  }

  function initLLMSettings() {
    buildPresetOptions();
    var cfg = LLM.getConfig();
    if (cfg) {
      $("llm-preset").value = cfg.preset;
      $("llm-baseurl").value = cfg.baseUrl;
      $("llm-model").value = cfg.model;
      $("llm-apikey").value = cfg.apiKey;
    } else {
      // No saved config: the default preset (OpenAI) — endpoint +
      // starter model prefilled, key left empty for the user to
      // paste their own. A saved config (above) always wins.
      $("llm-preset").value = LLM.DEFAULT_PRESET;
      applyPreset(LLM.DEFAULT_PRESET);
    }
    refreshLLMButtons();
  }

  function applyPreset(key) {
    var p = LLM.PRESETS[key];
    if (!p || key === "custom") return; // custom: leave the fields as typed
    $("llm-baseurl").value = p.baseUrl;
    $("llm-model").value = p.model;
  }

  /* Per-panel request ids: if the user re-asks (or switches opponent)
   * while a request is in flight, the stale response is discarded
   * instead of overwriting the newer panel state. */
  var narrateSeq = {};
  /* Model narration comes back as markdown-flavoured plain text.
   * Render **bold** as real emphasis; everything else stays literal
   * (escape first, so model output can never inject markup). */
  function renderNarration(out, text) {
    out.innerHTML = esc(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  function narrateInto(outId, btnId, facts) {
    var out = $(outId);
    var btn = $(btnId);
    var my = (narrateSeq[outId] = (narrateSeq[outId] || 0) + 1);
    out.hidden = false;
    out.textContent = t("llm.asking");
    btn.disabled = true;
    LLM.narrate(facts).then(function (text) {
      if (my !== narrateSeq[outId]) return; // stale: a newer request owns it
      renderNarration(out, text);
    }).catch(function (err) {
      if (my !== narrateSeq[outId]) return;
      out.hidden = true;
      toast(t("llm.failed", { msg: err.message }));
    }).then(function () {
      if (my === narrateSeq[outId]) btn.disabled = false;
    });
  }

  /* Hide + clear a narration panel and invalidate its in-flight
   * request (used when the selected opponent changes). */
  function clearNarrate(outId) {
    narrateSeq[outId] = (narrateSeq[outId] || 0) + 1;
    var out = $(outId);
    out.textContent = "";
    out.hidden = true;
  }

  /* Draft errors carry {code, championId}: render the localized
   * message with the champion's display name in the CURRENT language
   * (never the raw English message baked in by draft.js). */
  function draftErrorText(err) {
    var keys = { fearless: "err.fearless", used: "err.used", invalid: "err.invalid" };
    if (err && err.code && keys[err.code] && err.championId) {
      return t(keys[err.code], { champ: champName(err.championId) });
    }
    return err && err.message ? err.message : String(err);
  }

  /* ---------------- events ---------------- */

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (tb) {
        tb.classList.remove("active");
        tb.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      $("view-" + tab.dataset.view).classList.add("active");
    });
  });

  $("btn-lang").addEventListener("click", function () {
    setLanguage(window.I18n.getLocale() === "zh" ? "en" : "zh");
  });

  // Demo controls are injected next to the header demo button's flow:
  var controlsHost = document.querySelector(".draft-controls");
  var stepBtn = document.createElement("button");
  stepBtn.type = "button";
  stepBtn.id = "btn-demo-step"; stepBtn.className = "btn"; stepBtn.textContent = t("demo.step");
  stepBtn.style.display = "none";
  var autoBtn = document.createElement("button");
  autoBtn.type = "button";
  autoBtn.id = "btn-demo-auto"; autoBtn.className = "btn btn-accent"; autoBtn.textContent = t("demo.autoplay");
  autoBtn.style.display = "none";
  controlsHost.appendChild(stepBtn);
  controlsHost.appendChild(autoBtn);

  stepBtn.addEventListener("click", demoStep);
  autoBtn.addEventListener("click", function () {
    if (state.demoTimer) {
      clearInterval(state.demoTimer); state.demoTimer = null;
      autoBtn.textContent = t("demo.autoplay");
      return;
    }
    autoBtn.textContent = t("demo.pause");
    state.demoTimer = setInterval(function () {
      if (!demoStep()) { clearInterval(state.demoTimer); state.demoTimer = null; autoBtn.textContent = t("demo.autoplay"); }
    }, 900);
  });

  $("btn-demo").addEventListener("click", loadDemo);
  $("btn-new-series").addEventListener("click", newSeries);
  $("btn-undo").addEventListener("click", function () { stopDemo(); DraftCore.undo(state.series); renderDraft(); });
  $("btn-swap-sides").addEventListener("click", function () {
    stopDemo();
    try {
      DraftCore.swapSides(state.series);
      renderDraft();
    } catch (err) { toast(draftErrorText(err)); }
  });
  $("btn-reset-game").addEventListener("click", function () { stopDemo(); DraftCore.resetGame(state.series); renderDraft(); });
  $("btn-reset-series").addEventListener("click", newSeries);
  $("btn-next-game").addEventListener("click", function () {
    if (DraftCore.advanceGame(state.series)) renderDraft();
    else toast(t("alert.seriesComplete"));
  });
  $("btn-win-blue").addEventListener("click", function () { DraftCore.setWinner(state.series, "blue"); renderDraft(); });
  $("btn-win-red").addEventListener("click", function () { DraftCore.setWinner(state.series, "red"); renderDraft(); });
  $("btn-copy-export").addEventListener("click", function () {
    $("export-text").select();
    if (navigator.clipboard) navigator.clipboard.writeText($("export-text").value);
    else document.execCommand("copy");
  });
  $("grid-search").addEventListener("input", function (e) { state.search = e.target.value; renderGrid(); });
  $("role-filters").addEventListener("click", function (e) {
    if (!e.target.dataset.role) return;
    state.roleFilter = e.target.dataset.role;
    document.querySelectorAll("#role-filters .chip").forEach(function (ch) {
      var on = ch.dataset.role === state.roleFilter;
      ch.classList.toggle("active", on);
      ch.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderGrid();
  });
  $("champion-grid").addEventListener("click", function (e) {
    var tile = e.target.closest(".tile");
    if (!tile || tile.classList.contains("fearless") || tile.classList.contains("used")) return;
    stopDemo(); // a manual pick takes the series out of the demo script
    try {
      DraftCore.applyAction(state.series, tile.dataset.champ);
      renderDraft();
    } catch (err) { toast(draftErrorText(err)); }
  });
  $("scout-team").addEventListener("change", function () {
    clearNarrate("brief-llm-out"); // the old opponent's narration is stale
    renderScouting();
  });

  // Team selects: changing the Red team immediately re-points the
  // copilot opponent (and the depletion panel) at that team; the
  // matchup itself applies when the next series is created. A manual
  // copilot-opponent change stands until Red changes again.
  $("setup-red").addEventListener("change", function () {
    syncCopilotOpponentToRed();
    renderCopilot();
    renderDepletion();
  });
  $("btn-demo-notice-dismiss").addEventListener("click", function () {
    state.noticeDismissed = true;
    hideDemoNotice();
  });

  // AI copilot controls
  $("copilot-opp").addEventListener("change", function () {
    clearNarrate("copilot-llm-out");
    renderCopilot();
    renderDepletion(); // the depletion panel follows the same selection
  });
  $("copilot-side").addEventListener("change", renderCopilot);

  // AI brief actions
  $("btn-brief-copy").addEventListener("click", function () {
    if (!state.brief) return;
    var text = BriefGen.briefToText(state.brief, champName);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast(t("toast.briefCopied")); });
    }
  });
  $("btn-brief-llm").addEventListener("click", function () {
    if (!state.brief) return;
    narrateInto("brief-llm-out", "btn-brief-llm",
      BriefGen.briefToText(state.brief, champName));
  });
  $("btn-copilot-llm").addEventListener("click", function () {
    if (!state.lastAdvice) return;
    narrateInto("copilot-llm-out", "btn-copilot-llm",
      Copilot.summarize(state.series, state.lastAdvice, champName));
  });

  // BYOK settings panel
  function setSettingsOpen(open) {
    $("ai-settings").hidden = !open;
    $("btn-ai-settings").setAttribute("aria-expanded", open ? "true" : "false");
  }
  $("btn-ai-settings").addEventListener("click", function () {
    setSettingsOpen($("ai-settings").hidden);
  });
  $("btn-ai-settings-close").addEventListener("click", function () {
    setSettingsOpen(false);
    $("btn-ai-settings").focus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("ai-settings").hidden) {
      setSettingsOpen(false);
      $("btn-ai-settings").focus();
    }
  });
  $("llm-preset").addEventListener("change", function (e) {
    applyPreset(e.target.value);
  });
  $("btn-llm-save").addEventListener("click", function () {
    try {
      LLM.setConfig({
        preset: $("llm-preset").value,
        baseUrl: $("llm-baseurl").value,
        apiKey: $("llm-apikey").value,
        model: $("llm-model").value
      });
    } catch (err) {
      toast(err.message); // e.g. the https:// endpoint policy
      return;
    }
    refreshLLMButtons();
    toast(LLM.isConfigured()
      ? t("toast.settingsSaved")
      : t("toast.settingsIncomplete"));
  });
  $("btn-llm-clear").addEventListener("click", function () {
    LLM.clearConfig();
    $("llm-apikey").value = "";
    initLLMSettings();
    toast(t("toast.settingsCleared"));
  });

  init();
})();
