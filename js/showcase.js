/*
 * showcase.js — the purely decorative visual layer of Fearless Draft
 * Room: a fixed canvas starfield behind the app, a CSS-3D hero ring of
 * the dataset's most-played champions, and pointer-tracked 3D tilt +
 * holographic shine on the champion grid tiles.
 *
 * Zero dependencies, zero network calls, zero game logic. The module
 * never mutates draft state: app.js calls Showcase.sync(state) at the
 * end of renderDraft and the ring merely REFLECTS that state (current-
 * game picks light up, fearless-banned champions dim with the same
 * F·G# badge the board itself uses). Every entry point is wrapped so a
 * failure here can never break the draft — the worst case is a static
 * page that looks like the previous version.
 *
 * Ring numbers come from the same GRID aggregates the rest of the app
 * ships (data/scouting.json -> championStats: games + wins per
 * champion). Nothing is invented: the ring shows the top champions by
 * games played, with their real win rates.
 *
 * Motion policy: the ring's rotation is a CSS animation, the starfield
 * pauses while the document is hidden, and prefers-reduced-motion
 * stills everything (the global CSS rule kills the animation; this
 * module additionally draws the starfield once, statically, and never
 * attaches tilt).
 */
(function (global) {
  "use strict";

  var reducedMotion = false;
  try {
    reducedMotion = !!(global.matchMedia &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) { /* treat as no preference */ }

  function esc(s) {
    if (global.I18n && global.I18n.esc) return global.I18n.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function tr(key, params) {
    return global.I18n ? global.I18n.t(key, params) : key;
  }
  /* Display name in the active locale — mirrors app.js champName(). */
  function champName(state, id) {
    var c = state.champById[id];
    if (!c) return id;
    return (global.I18n && global.I18n.getLocale() === "zh" && c.nameZh)
      ? c.nameZh : c.name;
  }

  /* ================= 1. arena starfield ================= */

  function initStars() {
    var canvas = document.getElementById("arena-stars");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var DPR = Math.min(global.devicePixelRatio || 1, 1.25);
    var W = 0, H = 0, stars = [], raf = null, last = 0;
    var TINTS = [
      "207,224,255", "207,224,255", "207,224,255", "207,224,255",
      "0,196,179", "232,179,60"
    ];

    function seed() {
      // ~1 star per 15k px², capped at 130 (budget: ≤140 particles).
      var n = Math.max(36, Math.min(130, Math.floor(W * H / 15000)));
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.4 + Math.random() * 1.1,
          a: 0.16 + Math.random() * 0.5,
          ph: Math.random() * Math.PI * 2,
          drift: 0.006 + Math.random() * 0.028,  // px per 60fps frame
          tw: 0.006 + Math.random() * 0.02,      // twinkle speed
          tint: TINTS[Math.floor(Math.random() * TINTS.length)]
        });
      }
    }
    function resize() {
      W = global.innerWidth || 0;
      H = global.innerHeight || 0;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed();
      if (reducedMotion) drawStatic();
    }
    function paint() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var alpha = s.a * (0.72 + 0.28 * Math.sin(s.ph));
        if (alpha <= 0.01) continue;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + s.tint + "," + alpha.toFixed(3) + ")";
        ctx.fill();
      }
    }
    function drawStatic() { paint(); }
    function frame(ts) {
      raf = global.requestAnimationFrame(frame);
      if (document.hidden) return;
      var dt = Math.min(50, last ? ts - last : 16.7);
      last = ts;
      var k = dt / 16.7;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.y -= s.drift * k;
        s.ph += s.tw * k;
        if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }
      }
      paint();
    }
    function start() {
      if (raf || reducedMotion) return;
      last = 0;
      raf = global.requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) { global.cancelAnimationFrame(raf); raf = null; }
    }
    var resizeTimer = null;
    global.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
    resize();
    start();
  }

  /* ================= 2. hero showcase ring ================= */

  var RING_COUNT = 12;
  var ringBuilt = false;
  var ringCards = {}; // championId -> { el, badge, name, stats }

  function topChampions(state) {
    var stats = (state.scouting && state.scouting.championStats) || {};
    return Object.keys(stats).map(function (id) {
      return { id: id, games: stats[id].games || 0, wins: stats[id].wins || 0 };
    }).sort(function (a, b) {
      return b.games - a.games || b.wins - a.wins ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }).slice(0, RING_COUNT);
  }

  function buildRing(state) {
    var rotor = document.getElementById("showcase-rotor");
    if (!rotor) return false;
    var tops = topChampions(state);
    if (!tops.length) return false;
    var step = 360 / tops.length;
    tops.forEach(function (c, i) {
      var champ = state.champById[c.id];
      if (!champ) return;
      var card = document.createElement("div");
      card.className = "showcase-card";
      card.style.transform =
        "rotateY(" + (i * step).toFixed(1) + "deg) translateZ(var(--ring-r))";
      card.innerHTML =
        '<span class="showcase-badge" hidden></span>' +
        '<img src="' + esc(champ.icon) + '" alt="" loading="lazy" ' +
          'data-icon-fallback="' + esc(champ.name.charAt(0)) + '">' +
        '<span class="showcase-name"></span>' +
        '<span class="showcase-stats"></span>';
      rotor.appendChild(card);
      ringCards[c.id] = {
        el: card,
        badge: card.querySelector(".showcase-badge"),
        name: card.querySelector(".showcase-name"),
        stats: card.querySelector(".showcase-stats")
      };
    });
    ringBuilt = Object.keys(ringCards).length > 0;
    return ringBuilt;
  }

  /* Called from app.js's renderDraft (single additive hook). Reflects
   * the draft state on the ring; also refreshes localized names and
   * stat lines so a language switch re-renders the cards in place. */
  function sync(state) {
    try {
      if (!state || !state.scouting || !state.champById) return;
      if (!ringBuilt && !buildRing(state)) return;
      var picked = {};
      var fearless = new Map();
      var s = state.series;
      if (s && global.DraftCore) {
        fearless = global.DraftCore.fearlessPool(s);
        var game = global.DraftCore.currentGame(s);
        if (game && game.actions) {
          game.actions.forEach(function (a) {
            if (a.type === "pick") picked[a.championId] = true;
          });
        }
      }
      var statsAll = state.scouting.championStats || {};
      Object.keys(ringCards).forEach(function (id) {
        var rec = ringCards[id];
        rec.name.textContent = champName(state, id);
        var st = statsAll[id] || { games: 0, wins: 0 };
        var wr = st.games ? Math.round((st.wins / st.games) * 100) : 0;
        rec.stats.textContent = tr("showcase.stats", { games: st.games, wr: wr });
        var isF = fearless.has(id);
        var isP = !isF && !!picked[id];
        rec.el.classList.toggle("is-fearless", isF);
        rec.el.classList.toggle("is-picked", isP);
        if (isF) {
          rec.badge.textContent = "F·G" + fearless.get(id);
          rec.badge.hidden = false;
        } else if (isP) {
          rec.badge.textContent = tr("showcase.picked");
          rec.badge.hidden = false;
        } else {
          rec.badge.hidden = true;
        }
      });
    } catch (e) { /* the visual layer must never break the draft */ }
  }

  /* Drag to spin: the rotor's slow rotation is a CSS animation; the
   * drag wrapper adds a user-controlled rotateY offset on top of it,
   * with a short inertia glide on release. */
  function initDrag() {
    var stage = document.getElementById("showcase-stage");
    var wrap = document.getElementById("showcase-drag");
    if (!stage || !wrap) return;
    var dragging = false, startX = 0, startOffset = 0;
    var lastX = 0, lastT = 0, vel = 0, offset = 0, inertiaRaf = null;
    function setOffset(v) {
      offset = v;
      wrap.style.transform = "rotateY(" + v.toFixed(2) + "deg)";
    }
    stage.addEventListener("pointerdown", function (e) {
      dragging = true;
      startX = lastX = e.clientX;
      startOffset = offset;
      vel = 0;
      lastT = performance.now();
      if (inertiaRaf) { cancelAnimationFrame(inertiaRaf); inertiaRaf = null; }
      if (stage.setPointerCapture) {
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });
    stage.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var now = performance.now();
      setOffset(startOffset + (e.clientX - startX) * 0.3);
      if (now > lastT) {
        vel = (e.clientX - lastX) / (now - lastT) * 16.7 * 0.3;
      }
      lastX = e.clientX;
      lastT = now;
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (reducedMotion || Math.abs(vel) < 0.05) return;
      var step = function () {
        vel *= 0.94;
        setOffset(offset + vel);
        if (Math.abs(vel) > 0.05) inertiaRaf = requestAnimationFrame(step);
        else inertiaRaf = null;
      };
      inertiaRaf = requestAnimationFrame(step);
    }
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
  }

  /* ================= 3. grid tile tilt + shine =================
   * Pointer-tracked perspective tilt (max ±8°) and a holographic
   * shine that follows the pointer, driven by CSS custom properties
   * so the effect is transform/opacity only. Fine pointers only; the
   * handlers never touch click behavior — a tilted tile still picks
   * and bans exactly as before. */
  function initTilt() {
    if (reducedMotion) return;
    var fine = false;
    try { fine = !!global.matchMedia("(pointer: fine)").matches; }
    catch (e) { /* no matchMedia -> no tilt */ }
    if (!fine) return;
    var grid = document.getElementById("champion-grid");
    if (!grid) return;
    var current = null;
    function reset(tile) {
      tile.style.setProperty("--rx", "0deg");
      tile.style.setProperty("--ry", "0deg");
      tile.style.setProperty("--shine", "0");
    }
    grid.addEventListener("pointermove", function (e) {
      var tile = e.target && e.target.closest
        ? e.target.closest(".tile") : null;
      if (!tile || tile.classList.contains("used") ||
          tile.classList.contains("fearless")) {
        if (current) { reset(current); current = null; }
        return;
      }
      if (current && current !== tile) reset(current);
      current = tile;
      var r = tile.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      tile.style.setProperty("--ry", ((px - 0.5) * 16).toFixed(2) + "deg");
      tile.style.setProperty("--rx", ((0.5 - py) * 16).toFixed(2) + "deg");
      tile.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      tile.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      tile.style.setProperty("--shine", "1");
    });
    grid.addEventListener("pointerleave", function () {
      if (current) { reset(current); current = null; }
    });
  }

  /* ================= wire-up ================= */

  global.Showcase = { sync: sync };
  try { initStars(); } catch (e) {}
  try { initDrag(); } catch (e) {}
  try { initTilt(); } catch (e) {}
})(window);
