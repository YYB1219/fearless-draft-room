/*
 * app.js — UI wiring for Fearless Draft Room.
 * All draft rules live in draft.js (DraftCore) and all analytics in
 * scouting.js (Scouting); this file only renders state and forwards clicks.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    champions: [],          // from data/champions.json
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
    lastAdvice: null        // last Copilot advice (draft view)
  };

  /* ---------------- data loading ---------------- */

  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
      return r.json();
    });
  }

  function init() {
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
      state.champions.forEach(function (c) {
        state.champById[c.id] = c;
        state.rolesOf[c.id] = c.roles;
      });
      state.scouting = results[1];
      state.demo = results[2];
      renderDataBadge();
      newSeries();
      buildScoutTeamOptions();
      buildCopilotOptions();
      initLLMSettings();
      renderScouting();
    }).catch(function (err) {
      $("data-badge").textContent = "Failed to load data: " + err.message +
        " — serve this folder over HTTP (see README).";
    });
  }

  function renderDataBadge() {
    var meta = state.scouting.meta || {};
    var badge = $("data-badge");
    if (meta.kind === "grid") {
      badge.textContent = "Match data: GRID (official hackathon dataset)";
      badge.classList.add("real");
      $("footer-data").textContent =
        "Scouting data derived from the official GRID starter dataset for the " +
        "Cloud9 × JetBrains Hackathon (aggregates only; raw GRID feeds are " +
        "license-restricted and are not redistributed with this project).";
    } else {
      badge.textContent = "Match data: SAMPLE — demonstration only";
      $("footer-data").textContent =
        "The bundled scouting dataset is a clearly-labeled SAMPLE generated " +
        "for demonstration (see tools/generate_sample_data.py). It is not " +
        "real match data. The app is built to load GRID-derived aggregates " +
        "in the same schema via tools/build_scouting_from_grid.py.";
    }
  }

  /* ---------------- draft room ---------------- */

  function championStats() {
    return state.scouting ? Scouting.championStats(state.scouting) : {};
  }

  function newSeries() {
    stopDemo();
    state.series = DraftCore.createSeries({
      format: $("setup-format").value,
      blueName: $("setup-blue").value.trim() || "Blue",
      redName: $("setup-red").value.trim() || "Red",
      patch: $("setup-patch").value.trim(),
      championStats: championStats()
    });
    renderDraft();
  }

  function champName(id) {
    return state.champById[id] ? state.champById[id].name : id;
  }

  function iconHTML(c, cls) {
    return '<img class="' + (cls || "") + '" src="' + c.icon + '" alt="' +
      c.name + '" loading="lazy" onerror="this.outerHTML=' +
      "'<div class=\\'icon-fallback\\'>' + '" + c.name.charAt(0) + "' + '</div>'\">";
  }

  function phaseText() {
    var s = state.series;
    var step = DraftCore.nextAction(s);
    var game = DraftCore.currentGame(s);
    if (!step) {
      return "Game " + game.number + " draft complete — mark the winner, then advance.";
    }
    var idx = game.actions.length;
    var phase = idx < 6 ? "Ban Phase 1" : idx < 12 ? "Pick Phase 1"
      : idx < 16 ? "Ban Phase 2" : "Pick Phase 2";
    var team = step.side === "B" ? s.blueName : s.redName;
    var kind = step.type === "ban"
      ? '<span class="phase-kind-ban">BAN</span>' : '<span class="phase-kind-pick">PICK</span>';
    return phase + " — " + team + " to " + step.type + " " + kind +
      ' <span style="color:var(--muted);font-size:12px">(' + (idx + 1) + "/20)</span>";
  }

  function renderDraft() {
    var s = state.series;
    if (!s) return;
    var game = DraftCore.currentGame(s);
    var b = DraftCore.gameBreakdown(game);

    $("name-blue").textContent = s.blueName;
    $("name-red").textContent = s.redName;
    $("series-score").textContent =
      s.blueName + "  " + s.wins.blue + " – " + s.wins.red + "  " + s.redName +
      "  ·  Game " + game.number + " of " + s.format;
    $("phase-label").innerHTML = phaseText();

    // Turn highlight
    var step = DraftCore.nextAction(s);
    $("panel-blue").classList.toggle("active-turn", !!step && step.side === "B");
    $("panel-red").classList.toggle("active-turn", !!step && step.side === "R");

    renderSlots("bans-blue", b.blue.bans, 5, true);
    renderSlots("picks-blue", b.blue.picks, 5, false);
    renderSlots("bans-red", b.red.bans, 5, true);
    renderSlots("picks-red", b.red.picks, 5, false);
    $("btn-win-blue").classList.toggle("won", game.winner === "blue");
    $("btn-win-red").classList.toggle("won", game.winner === "red");
    $("btn-win-blue").textContent = game.winner === "blue" ? "✓ Won this game" : "Mark game won";
    $("btn-win-red").textContent = game.winner === "red" ? "✓ Won this game" : "Mark game won";

    // Pool banner — the Fearless headline
    var ps = DraftCore.poolStats(s, state.champions.length);
    $("pool-banner").innerHTML =
      "<div>Game <b>" + game.number + "</b>: <b>" + ps.fearlessCount +
      "</b> champions fearless-banned from earlier games · pool at <b>" +
      ps.percentAvailable + "%</b> (" + ps.availableAtStart + "/" +
      ps.totalChampions + " available)</div>" +
      '<div class="pool-meter"><div class="track"><div class="fill" style="width:' +
      ps.percentAvailable + '%"></div></div></div>';

    // Win-rate bar
    var p = DraftCore.heuristicWinProbability(s);
    $("wr-blue").style.width = (p.blue * 100) + "%";
    $("wr-red").style.width = (p.red * 100) + "%";
    $("wr-text").textContent =
      s.blueName + " " + Math.round(p.blue * 100) + "% — " +
      Math.round(p.red * 100) + "% " + s.redName;

    // Game tabs
    $("game-tabs").innerHTML = s.games.map(function (g, i) {
      var cls = "game-tab" + (i === s.currentGame ? " current" : "") +
        (g.actions.length >= 20 ? " done" : "");
      return '<span class="' + cls + '">G' + g.number +
        (g.winner ? " ✓" : "") + "</span>";
    }).join("");

    $("btn-next-game").disabled = !DraftCore.isGameComplete(s);
    renderGrid();
    renderSummary();
    renderCopilot();
  }

  function renderSlots(elId, ids, total, isBan) {
    var html = "";
    for (var i = 0; i < total; i++) {
      if (i < ids.length) {
        var c = state.champById[ids[i]];
        html += '<div class="slot' + (isBan ? " ban-slot" : "") + '">' +
          (c ? iconHTML(c) : "") + "<span>" + champName(ids[i]) + "</span></div>";
      } else {
        html += '<div class="slot empty">' + (isBan ? "— ban —" : "— pick —") + "</div>";
      }
    }
    $(elId).innerHTML = html;
  }

  function renderGrid() {
    var s = state.series;
    var fearless = DraftCore.fearlessPool(s);
    var used = DraftCore.usedInCurrentGame(s);
    var pickedBy = {};
    DraftCore.currentGame(s).actions.forEach(function (a) {
      if (a.type === "pick") pickedBy[a.championId] = a.side === "B" ? "blue" : "red";
    });
    var q = state.search.toLowerCase();
    var html = "";
    state.champions.forEach(function (c) {
      if (state.roleFilter !== "All" && c.roles.indexOf(state.roleFilter) === -1) return;
      if (q && c.name.toLowerCase().indexOf(q) === -1) return;
      var cls = "tile";
      var badge = "";
      if (fearless.has(c.id)) {
        cls += " fearless";
        badge = '<span class="fearless-badge">F·G' + fearless.get(c.id) + "</span>";
      } else if (used.has(c.id)) {
        cls += " used";
        if (pickedBy[c.id]) {
          badge = '<span class="picked-badge ' + pickedBy[c.id] + '">' +
            (pickedBy[c.id] === "blue" ? "B" : "R") + "</span>";
        }
      }
      html += '<div class="' + cls + '" data-champ="' + c.id + '" title="' +
        c.name + " — " + c.roles.join("/") + '">' + iconHTML(c) + badge +
        '<span class="tname">' + c.name + "</span></div>";
    });
    $("champion-grid").innerHTML = html || '<p style="color:var(--muted)">No champions match.</p>';
  }

  function renderSummary() {
    var s = state.series;
    var nameOf = champName;
    $("series-summary").innerHTML = s.games.map(function (g) {
      var b = DraftCore.gameBreakdown(g);
      var fearlessAfter = DraftCore.fearlessPool(s, g.number);
      var fmt = function (ids) { return ids.map(nameOf).join(", ") || "—"; };
      return '<div class="game-summary"><h4>Game ' + g.number +
        (g.winner ? " — " + (g.winner === "blue" ? s.blueName : s.redName) + " won" : "") +
        "</h4>" +
        "<div><b style='color:var(--blue)'>" + s.blueName + "</b> picks: " + fmt(b.blue.picks) + "</div>" +
        "<div><b style='color:var(--red)'>" + s.redName + "</b> picks: " + fmt(b.red.picks) + "</div>" +
        "<div>Bans: " + fmt(b.blue.bans.concat(b.red.bans)) + "</div>" +
        (fearlessAfter.size
          ? '<div class="fearless-line">Fearless-banned after this game (' +
            fearlessAfter.size + "): " + fmt(Array.from(fearlessAfter.keys())) + "</div>"
          : "") +
        "</div>";
    }).join("");
    $("export-text").value = DraftCore.exportText(s, nameOf);
  }

  /* ---------------- demo mode ----------------
   * The demo is a fully scripted BO5 (data/demo_series.json). Loading it
   * queues every action; "Demo step" applies one action, "Auto-play"
   * applies one every 900ms. This is exactly the flow the demo video
   * script (docs/video-script.md) walks through. */
  function loadDemo() {
    if (!state.demo) { alert("Demo data failed to load."); return; }
    stopDemo();
    $("setup-format").value = state.demo.format;
    $("setup-blue").value = state.demo.meta.blueName;
    $("setup-red").value = state.demo.meta.redName;
    $("setup-patch").value = state.demo.patch || "";
    newSeries();
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
      alert("Demo stopped: " + e.message);
      return false;
    }
    renderDraft();
    return state.demoQueue.length > 0;
  }

  function stopDemo() {
    if (state.demoTimer) { clearInterval(state.demoTimer); state.demoTimer = null; }
    state.demoQueue = [];
    var a = $("btn-demo-auto"), st = $("btn-demo-step");
    if (a) { a.style.display = "none"; a.textContent = "▶ Auto-play demo"; }
    if (st) st.style.display = "none";
  }

  /* ---------------- scouting view ---------------- */

  function buildScoutTeamOptions() {
    $("scout-team").innerHTML = state.scouting.teams.map(function (t) {
      return '<option value="' + t.id + '">' + t.name + " (" + t.tag + ")</option>";
    }).join("");
  }

  function pct(x) { return Math.round(x * 100) + "%"; }

  function barRow(label, count, max, extra) {
    var w = max ? Math.round((count / max) * 100) : 0;
    return "<tr><td>" + label + "</td><td>" + count + (extra || "") +
      '</td><td class="bar-cell"><div class="mini-track"><div class="mini-fill" style="width:' +
      w + '%"></div></div></td></tr>';
  }

  function renderScouting() {
    var data = state.scouting;
    if (!data) return;
    var teamId = $("scout-team").value || data.teams[0].id;
    var team = Scouting.teamById(data, teamId);
    var prof = Scouting.profile(data, teamId) || { games: 0, wins: 0 };
    $("scout-meta").textContent = team.name + " — " + prof.games + " games in dataset · " +
      prof.wins + " wins (" + (prof.games ? pct(prof.wins / prof.games) : "—") + ") · " +
      (data.meta.label || "");

    // First picks
    var fp = Scouting.firstPickFrequency(data, teamId, 5);
    var fpMax = fp.rows.length ? fp.rows[0].count : 0;
    $("scout-firstpicks").innerHTML =
      '<table class="tend">' + fp.rows.map(function (r) {
        return barRow(champName(r.champion), r.count, fpMax,
          ' <span style="color:var(--muted)">(' + pct(r.count / fp.n) + " of " + fp.n + " games)</span>");
      }).join("") + "</table>";

    // Banned against
    var ba = Scouting.bannedAgainst(data, teamId, 8);
    var baMax = ba.rows.length ? ba.rows[0].count : 0;
    $("scout-banned").innerHTML =
      '<table class="tend">' + ba.rows.map(function (r) {
        return barRow(champName(r.champion), r.count, baMax,
          ' <span style="color:var(--muted)">(in ' + pct(r.count / ba.n) + " of games vs them)</span>");
      }).join("") + "</table>";

    // Role pools
    var pools = Scouting.rolePools(data, teamId);
    var roleOrder = ["Top", "Jungle", "Mid", "ADC", "Support"];
    $("scout-pools").innerHTML = roleOrder.map(function (role) {
      var pool = pools[role];
      if (!pool) return "";
      var rows = pool.champions.map(function (c) {
        return "<tr><td>" + champName(c.champion) + "</td><td>" + c.games +
          "</td><td>" + pct(c.winRate) + "</td></tr>";
      }).join("");
      return '<div class="pool-role"><h4>' + role +
        ' <span class="player">' + (pool.player || "") + " · " + pool.distinct +
        ' distinct</span></h4><table class="tend"><tr><th>Champion</th><th>Games</th><th>WR</th></tr>' +
        rows + "</table></div>";
    }).join("");

    // Fearless shift
    var shift = Scouting.fearlessShift(data, teamId);
    if (!shift.byGame.length) {
      $("scout-shift").innerHTML = '<p style="color:var(--muted)">No series of 3+ games for this team in the dataset.</p>';
    } else {
      $("scout-shift").innerHTML =
        '<table class="shift-table"><tr><th>Game</th><th>Their top picks in that game number</th>' +
        "<th>Their own picks already fearless-banned (avg)</th><th>Shared pool removed (avg)</th></tr>" +
        shift.byGame.map(function (row) {
          return "<tr><td><b>G" + row.gameNumber + "</b></td><td>" +
            row.topPicks.map(function (r) { return champName(r.champion) + " ×" + r.count; }).join(", ") +
            "</td><td>" + row.removedCount + "</td><td>" + row.poolRemoved +
            " champions</td></tr>";
        }).join("") + "</table>" +
        '<p style="color:var(--muted);font-size:12px">Based on ' + shift.seriesCount +
        " series that reached Game 3. By Game 5 the shared pool has lost up to 40 champions — " +
        "every pick from Games 1–4 is gone for both teams.</p>";
    }

    // Insights
    var cards = Scouting.insights(data, teamId);
    $("scout-insights").innerHTML = cards.length ? cards.map(function (c) {
      return '<div class="insight ' + c.type + '"><h4>' + c.title + "</h4><p>" +
        c.body + '</p><span class="n">sample: n=' + c.n + "</span></div>";
    }).join("") : '<p style="color:var(--muted)">No insight rules fired for this team at the current thresholds.</p>';

    renderBrief(teamId);
  }

  /* ---------------- AI brief ---------------- */

  function renderBrief(teamId) {
    var brief = BriefGen.generateBrief(state.scouting, teamId, champName);
    state.brief = brief;
    var panel = $("brief-panel");
    if (!brief) {
      panel.innerHTML = '<p style="color:var(--muted)">No profile available for this team.</p>';
      return;
    }
    var o = brief.overview;
    var rows = function (list) {
      return list.map(function (r) {
        return champName(r.champion) + " ×" + r.count + " (" + pct(r.share) + ")";
      }).join(", ");
    };
    var html = "";
    html += '<div class="brief-sec"><h4>1 · Overall tendencies</h4><p>' +
      brief.teamName + ": " + o.games + " games, " + o.wins + " wins (" +
      pct(o.winRate) + "). Top first picks: " + rows(o.topFirstPicks) +
      ". Most banned against them: " + rows(o.topBannedAgainst) + ".</p></div>";
    html += '<div class="brief-sec"><h4>2 · Top 3 ban targets</h4>' +
      brief.banTargets.map(function (t, i) {
        return "<p><b>" + (i + 1) + ". " + champName(t.champion) + "</b> — won " +
          pct(t.wrWith) + " in " + t.pickedGames + " picks vs. " + pct(t.wrWithout) +
          " without (" + (t.diff >= 0 ? "+" : "") + Math.round(t.diff * 100) +
          ' pts) <span class="n">n=' + t.n + "</span></p>";
      }).join("") + "</div>";
    var pr = brief.firstPick.priority;
    html += '<div class="brief-sec"><h4>3 · First-pick priority</h4><p>' +
      (pr
        ? "<b>" + champName(pr.champion) + "</b> — first-picked " + pr.count +
          "/" + pr.n + " games (" + pct(pr.teamShare) + "), " +
          (Math.round(pr.ratio * 10) / 10) + "× the dataset-wide rate. Deny it or pre-draft the counter."
        : "No champion clears the 2× dataset-rate bar; most common opener: " +
          (brief.firstPick.rows.length
            ? champName(brief.firstPick.rows[0].champion) + " (" +
              brief.firstPick.rows[0].count + "/" + brief.firstPick.rows[0].n + ")"
            : "—") + ".") +
      "</p></div>";
    var r = brief.lateRisk;
    html += '<div class="brief-sec"><h4>4 · Fearless late-series risk</h4>';
    if (r.longSeries > 0) {
      html += "<p>Pool exhaustion: by Game 4 an average of <b>" + r.avgTop5GoneByG4 +
        "</b> of their top-5 comfort picks (" + r.top5.map(champName).join(", ") +
        ') are already fearless-banned <span class="n">n=' + r.longSeries +
        " long series</span>. Dry roles first: " + (r.dryRoles.join(", ") || "—") + ".</p>";
    }
    if (r.g3RemovedAvg != null) {
      html += "<p>By Game 3 they have lost an average of " + r.g3RemovedAvg +
        " of their own picks; the shared pool is down " + r.g3PoolRemovedAvg +
        ' champions <span class="n">n=' + r.seriesCount + " series</span>.</p>";
    }
    r.shallowRoles.forEach(function (sh) {
      html += "<p>Concentrated " + sh.role + " pool: " + champName(sh.champions[0]) +
        " + " + champName(sh.champions[1]) + " cover " + pct(sh.top2Share) +
        ' of its games <span class="n">n=' + sh.n + "</span>.</p>";
    });
    html += "</div>";
    html += '<div class="brief-sec"><h4>5 · Series plan (G1–G5)</h4>' +
      brief.seriesPlan.map(function (step) {
        return '<div class="brief-step"><b>' + step.title + "</b><ul>" +
          step.points.map(function (pt) { return "<li>" + pt + "</li>"; }).join("") +
          "</ul></div>";
      }).join("") + "</div>";
    panel.innerHTML = html;
  }

  /* ---------------- AI draft copilot ---------------- */

  function buildCopilotOptions() {
    $("copilot-opp").innerHTML =
      '<option value="">None — dataset-wide</option>' +
      state.scouting.teams.map(function (t) {
        return '<option value="' + t.id + '">' + t.name + " (" + t.tag + ")</option>";
      }).join("");
  }

  function renderCopilot() {
    var s = state.series;
    if (!s || !state.scouting) return;
    var advice = Copilot.advise({
      series: s,
      scoutingData: state.scouting,
      opponentId: $("copilot-opp").value || null,
      ourSide: $("copilot-side").value,
      championIds: state.champions.map(function (c) { return c.id; }),
      rolesOf: state.rolesOf,
      nameOf: champName
    });
    state.lastAdvice = advice;
    $("copilot-headline").textContent = advice.headline;
    var kindLabel = { pick: "PICK", ban: "BAN", watch: "WATCH" };
    $("copilot-recs").innerHTML = advice.recommendations.length
      ? advice.recommendations.map(function (r, i) {
          var c = state.champById[r.champion];
          return '<div class="rec"><div class="rec-rank">' + (i + 1) + '</div>' +
            (c ? iconHTML(c) : "") +
            '<div class="rec-body"><div class="rec-top"><b>' + champName(r.champion) +
            '</b><span class="rec-kind ' + r.kind + '">' + kindLabel[r.kind] +
            "</span></div><p>" + r.reason + "</p></div></div>";
        }).join("")
      : '<p style="color:var(--muted)">Draft complete — no further recommendations.</p>';
    $("copilot-warnings").innerHTML = advice.warnings.map(function (w) {
      return '<div class="copilot-warning">' + w + "</div>";
    }).join("");
  }

  /* ---------------- BYOK LLM narration ---------------- */

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  function refreshLLMButtons() {
    var ok = LLM.isConfigured();
    document.querySelectorAll(".llm-btn").forEach(function (b) {
      b.disabled = !ok;
    });
    document.querySelectorAll(".llm-hint").forEach(function (h) {
      h.textContent = ok
        ? "Sends only the structured facts above to your configured model."
        : "Configure your own model in ⚙ AI settings (BYOK) to enable narration.";
    });
    var cfg = LLM.getConfig();
    $("llm-status").textContent = ok
      ? "Saved: " + LLM.PRESETS[cfg.preset].label + " · " + cfg.model + " · " + cfg.baseUrl
      : "Not configured — the brief and copilot still work fully, offline.";
  }

  function initLLMSettings() {
    var sel = $("llm-preset");
    sel.innerHTML = LLM.PRESET_ORDER.map(function (k) {
      return '<option value="' + k + '">' + LLM.PRESETS[k].label + "</option>";
    }).join("");
    var cfg = LLM.getConfig();
    if (cfg) {
      sel.value = cfg.preset;
      $("llm-baseurl").value = cfg.baseUrl;
      $("llm-model").value = cfg.model;
      $("llm-apikey").value = cfg.apiKey;
    } else {
      // Default preset: Aliyun Bailian (DeepSeek) — endpoint + model
      // prefilled, key left empty for the user to paste their own.
      sel.value = LLM.DEFAULT_PRESET;
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

  function narrateInto(outId, facts) {
    var out = $(outId);
    out.hidden = false;
    out.textContent = "Asking your model…";
    LLM.narrate(facts).then(function (text) {
      out.textContent = text;
    }).catch(function (err) {
      out.hidden = true;
      toast("AI narration failed: " + err.message);
    });
  }

  /* ---------------- events ---------------- */

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
      tab.classList.add("active");
      $("view-" + tab.dataset.view).classList.add("active");
    });
  });

  // Demo controls are injected next to the header demo button's flow:
  var controlsHost = document.querySelector(".draft-controls");
  var stepBtn = document.createElement("button");
  stepBtn.id = "btn-demo-step"; stepBtn.className = "btn"; stepBtn.textContent = "Demo step →";
  stepBtn.style.display = "none";
  var autoBtn = document.createElement("button");
  autoBtn.id = "btn-demo-auto"; autoBtn.className = "btn btn-accent"; autoBtn.textContent = "▶ Auto-play demo";
  autoBtn.style.display = "none";
  controlsHost.appendChild(stepBtn);
  controlsHost.appendChild(autoBtn);

  stepBtn.addEventListener("click", demoStep);
  autoBtn.addEventListener("click", function () {
    if (state.demoTimer) {
      clearInterval(state.demoTimer); state.demoTimer = null;
      autoBtn.textContent = "▶ Auto-play demo";
      return;
    }
    autoBtn.textContent = "⏸ Pause demo";
    state.demoTimer = setInterval(function () {
      if (!demoStep()) { clearInterval(state.demoTimer); state.demoTimer = null; autoBtn.textContent = "▶ Auto-play demo"; }
    }, 900);
  });

  $("btn-demo").addEventListener("click", loadDemo);
  $("btn-new-series").addEventListener("click", newSeries);
  $("btn-undo").addEventListener("click", function () { DraftCore.undo(state.series); renderDraft(); });
  $("btn-reset-game").addEventListener("click", function () { DraftCore.resetGame(state.series); renderDraft(); });
  $("btn-reset-series").addEventListener("click", newSeries);
  $("btn-next-game").addEventListener("click", function () {
    if (DraftCore.advanceGame(state.series)) renderDraft();
    else alert("Series is complete (or the format has no more games).");
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
      ch.classList.toggle("active", ch.dataset.role === state.roleFilter);
    });
    renderGrid();
  });
  $("champion-grid").addEventListener("click", function (e) {
    var tile = e.target.closest(".tile");
    if (!tile || tile.classList.contains("fearless") || tile.classList.contains("used")) return;
    try {
      DraftCore.applyAction(state.series, tile.dataset.champ);
      renderDraft();
    } catch (err) { alert(err.message); }
  });
  $("scout-team").addEventListener("change", renderScouting);

  // AI copilot controls
  $("copilot-opp").addEventListener("change", renderCopilot);
  $("copilot-side").addEventListener("change", renderCopilot);

  // AI brief actions
  $("btn-brief-copy").addEventListener("click", function () {
    if (!state.brief) return;
    var text = BriefGen.briefToText(state.brief, champName);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast("Brief copied."); });
    }
  });
  $("btn-brief-llm").addEventListener("click", function () {
    if (!state.brief) return;
    narrateInto("brief-llm-out", BriefGen.briefToText(state.brief, champName));
  });
  $("btn-copilot-llm").addEventListener("click", function () {
    if (!state.lastAdvice) return;
    narrateInto("copilot-llm-out",
      Copilot.summarize(state.series, state.lastAdvice, champName));
  });

  // BYOK settings panel
  $("btn-ai-settings").addEventListener("click", function () {
    $("ai-settings").hidden = !$("ai-settings").hidden;
  });
  $("btn-ai-settings-close").addEventListener("click", function () {
    $("ai-settings").hidden = true;
  });
  $("llm-preset").addEventListener("change", function (e) {
    applyPreset(e.target.value);
  });
  $("btn-llm-save").addEventListener("click", function () {
    LLM.setConfig({
      preset: $("llm-preset").value,
      baseUrl: $("llm-baseurl").value,
      apiKey: $("llm-apikey").value,
      model: $("llm-model").value
    });
    refreshLLMButtons();
    toast(LLM.isConfigured()
      ? "AI settings saved (this browser only)."
      : "Saved, but endpoint, model and key are all required to enable narration.");
  });
  $("btn-llm-clear").addEventListener("click", function () {
    LLM.clearConfig();
    $("llm-apikey").value = "";
    initLLMSettings();
    toast("AI settings cleared from this browser.");
  });

  init();
})();
