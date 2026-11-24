#!/usr/bin/env node
/*
 * smoke_test.js — state-machine and data smoke tests (no browser needed).
 * Run: node tools/smoke_test.js    (exit code 0 = all passed)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const I18n = require("../js/i18n.js"); // first: logic modules resolve it lazily
const Draft = require("../js/draft.js");
const Comp = require("../js/comp.js");
const Scouting = require("../js/scouting.js");
const Brief = require("../js/brief.js");
const Copilot = require("../js/copilot.js");
const LLM = require("../js/llm.js");

const root = path.join(__dirname, "..");
const champs = JSON.parse(fs.readFileSync(path.join(root, "data/champions.json"), "utf8")).champions;
const ids = champs.map((c) => c.id);
let failures = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failures++;
}
function expectThrow(name, fn) {
  try { fn(); check(name + " (expected throw)", false); }
  catch (e) { check(name + " throws: " + e.message.slice(0, 60), true); }
}

/* 1 — the 20-action sequence matches the pro draft order */
const expected = ["B ban","R ban","B ban","R ban","B ban","R ban",
  "B pick","R pick","R pick","B pick","B pick","R pick",
  "R ban","B ban","R ban","B ban",
  "R pick","B pick","B pick","R pick"];
check("sequence is the standard 20-action order",
  Draft.SEQUENCE.map((s) => s.side + " " + s.type).join("|") === expected.join("|"));

/* 2 — play a full game; duplicates inside a game are rejected */
const stats = {};
ids.forEach((id, i) => { stats[id] = { games: 20, wins: 8 + (i % 7) }; });
const s = Draft.createSeries({ format: "BO5", blueName: "Blue", redName: "Red", championStats: stats });
let cursor = 0;
const nextChamp = () => ids[cursor++];
while (!Draft.isGameComplete(s)) Draft.applyAction(s, nextChamp());
check("game 1 completes after 20 actions", Draft.currentGame(s).actions.length === 20);
const g1 = Draft.gameBreakdown(Draft.currentGame(s));
check("game 1 has 5 picks + 5 bans per side",
  g1.blue.picks.length === 5 && g1.blue.bans.length === 5 &&
  g1.red.picks.length === 5 && g1.red.bans.length === 5);
expectThrow("re-picking a used champion", () => {
  const s2 = Draft.createSeries({ format: "BO1" });
  Draft.applyAction(s2, "Ahri"); Draft.applyAction(s2, "Ahri");
});

/* 3 — Fearless carry-over: G1 picks are banned in G2, G1 bans are not */
Draft.setWinner(s, "blue");
check("advance to game 2", Draft.advanceGame(s) === true);
const aG1Pick = g1.blue.picks[0];
const aG1Ban = g1.blue.bans[0];
check("G1 pick is fearless-banned in G2", Draft.unavailableReason(s, aG1Pick) === "fearless");
expectThrow("picking a fearless-banned champion", () => Draft.applyAction(s, aG1Pick));
check("G1 ban is available again in G2", Draft.unavailableReason(s, aG1Ban) === null);
const ps2 = Draft.poolStats(s, ids.length);
check("pool after G1: 10 fearless-banned", ps2.fearlessCount === 10 && ps2.availableAtStart === ids.length - 10);

/* 4 — win-rate heuristic is a probability and reacts to picks.
   Play game 2 up to and including the first pick (7 actions), using
   champions that are legal there (not fearless-banned, not yet used). */
while (Draft.currentGame(s).actions.length < 7) {
  const cand = ids.find((id) => !Draft.unavailableReason(s, id) &&
    !Draft.currentGame(s).actions.some((a) => a.championId === id));
  Draft.applyAction(s, cand);
}
const p = Draft.heuristicWinProbability(s);
check("heuristic probabilities sum to 1", Math.abs(p.blue + p.red - 1) < 1e-9);
check("heuristic is not stuck at 50/50 after a pick", p.blue !== 0.5);

/* 5 — undo + reset */
Draft.undo(s);
check("undo removes the last action", Draft.currentGame(s).actions.length === 6);
Draft.resetGame(s);
check("reset game clears actions", Draft.currentGame(s).actions.length === 0);

/* 6 — the built-in demo BO5 replays legally end-to-end */
const demo = JSON.parse(fs.readFileSync(path.join(root, "data/demo_series.json"), "utf8"));
const ds = Draft.createSeries({ format: demo.format, blueName: demo.meta.blueName, redName: demo.meta.redName, championStats: stats });
let demoOK = true;
try {
  demo.games.forEach((g, gi) => {
    g.actions.forEach((a) => {
      const step = Draft.nextAction(ds);
      if (!step || step.type !== a.type || step.side !== a.side) throw new Error("order mismatch G" + (gi + 1));
      Draft.applyAction(ds, a.champion);
    });
    Draft.setWinner(ds, g.winner);
    if (gi < demo.games.length - 1 && !Draft.advanceGame(ds)) throw new Error("could not advance after G" + (gi + 1));
  });
} catch (e) { demoOK = false; console.log("  demo error:", e.message); }
check("demo BO5 replays legally through the state machine", demoOK);
check("demo ends 3-2 (per-team wins, fixed side assignment)",
  ds.wins[0] === 3 && ds.wins[1] === 2 && ds.teams[0] === demo.meta.blueName);
const ps5 = Draft.poolStats(ds, ids.length);
check("by game 5 the demo has 40 fearless-banned champions", ps5.fearlessCount === 40);

/* 7 — scouting: both datasets load, insights carry sample sizes */
for (const file of ["data/scouting.json", "data/scouting.sample.json"]) {
  const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  let allHaveN = true, anyCards = false;
  for (const t of data.teams) {
    for (const card of Scouting.insights(data, t.id)) {
      anyCards = true;
      if (!(card.n > 0) || !card.title || !card.body) allHaveN = false;
    }
  }
  check(file + ": insights exist and every card carries n>0", anyCards && allHaveN);
  check(file + ": meta kind is declared", data.meta.kind === "grid" || data.meta.kind === "sample");
}

/* 8 — export text renders */
const text = Draft.exportText(ds, (id) => id);
check("export text includes all 5 games", (text.match(/^Game \d/gm) || []).length === 5);

/* 8b — Group A hardening: winner toggle/reset, decided series,
   applyAction validation, format fallback, I18n.esc */
{
  const nextLegal = (sr) => ids.find((x) => !Draft.unavailableReason(sr, x) &&
    !Draft.currentGame(sr).actions.some((a) => a.championId === x));
  const playGame = (sr) => { while (!Draft.isGameComplete(sr)) Draft.applyAction(sr, nextLegal(sr)); };

  const rs = Draft.createSeries({ format: "BO3", championStats: stats });
  playGame(rs);
  Draft.setWinner(rs, "blue");
  check("setWinner records the win (per-team wins[0])", rs.wins[0] === 1);
  Draft.setWinner(rs, "blue"); // same side again -> toggle off
  check("setWinner on the winning side toggles back to null",
    Draft.currentGame(rs).winner === null && rs.wins[0] === 0);
  Draft.setWinner(rs, "blue");
  Draft.resetGame(rs);
  check("resetGame clears actions AND zeroes the win",
    Draft.currentGame(rs).actions.length === 0 &&
    rs.wins[0] === 0 && rs.wins[1] === 0);

  const b1 = Draft.createSeries({ format: "BO1", championStats: stats });
  playGame(b1);
  Draft.setWinner(b1, "red");
  check("decided BO1: advanceGame() is false", Draft.advanceGame(b1) === false);
  expectThrow("applyAction after game completion", () => Draft.applyAction(b1, "Ahri"));

  const b3 = Draft.createSeries({ format: "BO3", championStats: stats });
  playGame(b3); Draft.setWinner(b3, "blue");
  check("BO3 at 1-0 advances", Draft.advanceGame(b3) === true);
  playGame(b3); Draft.setWinner(b3, "blue");
  check("decided BO3 (2-0): advanceGame() is false",
    Draft.seriesDecided(b3) && Draft.advanceGame(b3) === false);

  const es = Draft.createSeries({ format: "BO3" });
  check("undo on empty game returns null, no throw", Draft.undo(es) === null);
  expectThrow("applyAction with empty championId", () => Draft.applyAction(es, ""));
  expectThrow("applyAction with non-string championId", () => Draft.applyAction(es, 42));

  const fb = Draft.createSeries({ format: "BO7" });
  check("unknown format falls back to BO3", fb.format === "BO3" && fb.gamesToWin === 2);

  check("I18n.esc escapes all five chars (& < > \" ')",
    I18n.esc("&<>\"'") === "&amp;&lt;&gt;&quot;&#39;" &&
    I18n.esc("a & b <c>") === "a &amp; b &lt;c&gt;" && I18n.esc(null) === "");
}

/* 8c — Group E: per-game side selection (swap sides, per-team wins) */
{
  const nextLegal = (sr) => ids.find((x) => !Draft.unavailableReason(sr, x) &&
    !Draft.currentGame(sr).actions.some((a) => a.championId === x));
  const playGame = (sr) => { while (!Draft.isGameComplete(sr)) Draft.applyAction(sr, nextLegal(sr)); };

  const sw = Draft.createSeries({ format: "BO3", blueName: "Alpha", redName: "Beta", championStats: stats });
  check("swap: game 1 starts with teams[0] on blue",
    sw.teams[0] === "Alpha" && sw.teams[1] === "Beta" &&
    Draft.blueTeamName(sw) === "Alpha" && Draft.redTeamName(sw) === "Beta");
  playGame(sw);
  expectThrow("swapSides after the draft has started", () => Draft.swapSides(sw));
  Draft.setWinner(sw, "blue"); // Alpha wins G1 playing blue
  check("swap: G1 blue win credits teams[0]",
    sw.wins[0] === 1 && sw.wins[1] === 0);
  check("swap: advance to G2", Draft.advanceGame(sw) === true);
  check("swap: G2 carries the same side assignment by default",
    Draft.blueTeamName(sw) === "Alpha");
  Draft.swapSides(sw); // Beta takes blue for G2
  check("swap: after the swap, teams[1] is blue in G2",
    Draft.blueTeamName(sw) === "Beta" && Draft.redTeamName(sw) === "Alpha");
  playGame(sw);
  Draft.setWinner(sw, "blue"); // Beta wins G2 playing BLUE
  check("swap: wins are 1-1 BY TEAM across the swap",
    sw.wins[0] === 1 && sw.wins[1] === 1 && !Draft.seriesDecided(sw));

  // A BO3 decided 2-0 by team across a swap ends the series.
  const sw2 = Draft.createSeries({ format: "BO3", blueName: "Alpha", redName: "Beta", championStats: stats });
  playGame(sw2); Draft.setWinner(sw2, "blue"); // Alpha wins G1 (blue)
  Draft.advanceGame(sw2);
  Draft.swapSides(sw2);                        // Alpha plays RED in G2
  playGame(sw2); Draft.setWinner(sw2, "red");  // Alpha wins G2 from red
  check("swap: BO3 decided 2-0 by team across a swap ends the series",
    sw2.wins[0] === 2 && sw2.wins[1] === 0 && Draft.seriesDecided(sw2) &&
    Draft.advanceGame(sw2) === false);
  check("swap: export score line is per-team (Alpha 2 – 0 Beta)",
    Draft.exportText(sw2, (id) => id).includes("Alpha 2 – 0 Beta"));
}

/* 8d — Group F: serialize/restore round-trip */
{
  const nextLegal = (sr) => ids.find((x) => !Draft.unavailableReason(sr, x) &&
    !Draft.currentGame(sr).actions.some((a) => a.championId === x));
  const playGame = (sr) => { while (!Draft.isGameComplete(sr)) Draft.applyAction(sr, nextLegal(sr)); };

  const rt = Draft.createSeries({ format: "BO3", blueName: "Alpha", redName: "Beta", championStats: stats });
  playGame(rt); Draft.setWinner(rt, "blue"); Draft.advanceGame(rt);
  Draft.swapSides(rt); // Beta is blue in G2
  Draft.applyAction(rt, nextLegal(rt)); Draft.applyAction(rt, nextLegal(rt));
  const snap = JSON.parse(JSON.stringify(Draft.serializeSeries(rt)));
  check("serialize: snapshot is JSON-safe, carries no stats or functions",
    snap.games.length === 2 && snap.games[1].actions.length === 2 &&
    !("championStats" in snap) && snap.teams[0] === "Alpha");
  const restored = Draft.restoreSeries(snap, stats);
  check("restore: actions, winners and side assignments survive the round-trip",
    restored !== null && restored.teams[1] === "Beta" &&
    restored.wins[0] === 1 && restored.wins[1] === 0 &&
    restored.currentGame === 1 &&
    Draft.currentGame(restored).blueTeam === 1 &&
    Draft.blueTeamName(restored) === "Beta" &&
    Draft.currentGame(restored).actions.length === 2 &&
    Draft.fearlessPool(restored).size === 10 &&
    restored.championStats === stats);
  check("restore: garbage input returns null",
    Draft.restoreSeries(null) === null && Draft.restoreSeries({}) === null);
}

/* 9 — AI brief: all 5 sections for every team, evidence carries n>0 */
const champIds = ids;
const rolesOf = {};
champs.forEach((c) => { rolesOf[c.id] = c.roles; });
for (const file of ["data/scouting.json", "data/scouting.sample.json"]) {
  const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  let briefsOK = true, textOK = true;
  for (const t of data.teams) {
    const b = Brief.generateBrief(data, t.id);
    if (!b || !b.overview || !b.banTargets || !b.firstPick ||
        !b.lateRisk || !b.seriesPlan) { briefsOK = false; break; }
    if (!(b.overview.n > 0) || !b.overview.topFirstPicks.length ||
        !b.banTargets.length ||
        b.banTargets.some((x) => !(x.n > 0) || !(x.pickedGames > 0)) ||
        b.seriesPlan.length !== 5 ||
        b.seriesPlan.some((s) => !s.points.length)) briefsOK = false;
    const bt = Brief.briefToText(b);
    if (bt.length < 200 || !bt.includes(t.name) ||
        !bt.includes("SERIES PLAN")) textOK = false;
  }
  check(file + ": brief generates all 5 sections for every team, ban targets carry n>0", briefsOK);
  check(file + ": brief plain-text export renders with team name + plan", textOK);
}

/* 10 — copilot: exactly 3 legal recommendations at every demo state,
   and never an unavailable champion across the full BO5 replay */
const realData = JSON.parse(fs.readFileSync(path.join(root, "data/scouting.json"), "utf8"));
const realStats = Scouting.championStats(realData);
function freshDemoSeries() {
  return Draft.createSeries({ format: demo.format, blueName: demo.meta.blueName,
    redName: demo.meta.redName, championStats: realStats });
}
{
  const cs = freshDemoSeries();
  let statesChecked = 0, violations = 0, g5Warning = false;
  demo.games.forEach((g, gi) => {
    while (!Draft.isGameComplete(cs)) {
      const adv = Copilot.advise({ series: cs, scoutingData: realData,
        opponentId: "t1", ourSide: "B", championIds: champIds, rolesOf });
      statesChecked++;
      if (adv.recommendations.length !== 3) violations++;
      for (const r of adv.recommendations) {
        if (Draft.unavailableReason(cs, r.champion) !== null) violations++;
        if (!r.reason || !r.kind) violations++;
      }
      if (gi === 4 && adv.warnings.length) g5Warning = true;
      const a = g.actions[Draft.currentGame(cs).actions.length];
      Draft.applyAction(cs, a.champion);
    }
    Draft.setWinner(cs, g.winner);
    if (gi < demo.games.length - 1) Draft.advanceGame(cs);
  });
  check("copilot: exactly 3 recommendations at all " + statesChecked +
    " demo states, none unavailable", violations === 0 && statesChecked === 100);
  check("copilot: a pool-dry warning fires during Game 5 of the demo", g5Warning);
}
/* sampled states: early/mid/late in G1 and G4, other side, no opponent */
{
  const cs = freshDemoSeries();
  const sampleAt = { "1:0": true, "1:10": true, "1:19": true, "4:0": true, "4:13": true };
  let sampled = 0, okSample = true;
  demo.games.forEach((g, gi) => {
    while (!Draft.isGameComplete(cs)) {
      const key = (gi + 1) + ":" + Draft.currentGame(cs).actions.length;
      if (sampleAt[key]) {
        const adv = Copilot.advise({ series: cs, scoutingData: realData,
          opponentId: null, ourSide: "R", championIds: champIds, rolesOf });
        sampled++;
        if (adv.recommendations.length !== 3) okSample = false;
        for (const r of adv.recommendations) {
          if (Draft.unavailableReason(cs, r.champion) !== null) okSample = false;
        }
      }
      const a = g.actions[Draft.currentGame(cs).actions.length];
      Draft.applyAction(cs, a.champion);
    }
    Draft.setWinner(cs, g.winner);
    if (gi < demo.games.length - 1) Draft.advanceGame(cs);
  });
  check("copilot: sampled early/mid/late states (G1 + G4, red side, no opponent) give 3 legal recs",
    okSample && sampled === 5);
  const done = Copilot.advise({ series: cs, scoutingData: realData,
    opponentId: "t1", ourSide: "B", championIds: champIds, rolesOf });
  check("copilot: completed series yields mode=complete and no recs",
    done.complete === true && done.recommendations.length === 0);
  check("copilot: summarize() produces a fact sheet mentioning the headline",
    Copilot.summarize(cs, done).includes("DRAFT STATE"));
}

/* 11 — i18n: dictionary coverage. Every t('...') / T('...') literal in
   the JS modules and every data-i18n* attribute in index.html must exist
   in BOTH locales, and the two dictionaries must have identical keys. */
{
  const files = ["js/app.js", "js/brief.js", "js/comp.js", "js/copilot.js",
    "js/draft.js", "js/llm.js", "js/scouting.js", "index.html"];
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of src.matchAll(/\b[tT]\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-i18n(?:-html|-ph)?="([a-zA-Z0-9_.]+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !(k in I18n.DICT.en) || !(k in I18n.DICT.zh));
  check("i18n: all " + used.size + " keys used in code/HTML exist in BOTH locales",
    missing.length === 0);
  if (missing.length) console.log("  missing:", missing.join(", "));
  const enKeys = Object.keys(I18n.DICT.en).sort();
  const zhKeys = Object.keys(I18n.DICT.zh).sort();
  check("i18n: en and zh dictionaries have identical key sets (" + enKeys.length + " keys)",
    JSON.stringify(enKeys) === JSON.stringify(zhKeys));
  check("i18n: every dictionary value is a non-empty string in both locales",
    enKeys.every((k) => typeof I18n.DICT.en[k] === "string" && I18n.DICT.en[k].length > 0 &&
                        typeof I18n.DICT.zh[k] === "string" && I18n.DICT.zh[k].length > 0));
  check("i18n: role keys exist for All + the 5 roles in both locales",
    ["All", "Top", "Jungle", "Mid", "ADC", "Support"].every((r) =>
      ("role." + r) in I18n.DICT.en && ("role." + r) in I18n.DICT.zh));
  check("i18n: default locale is en; setLocale switches and persists the choice",
    I18n.getLocale() === "en" && I18n.setLocale("zh") === "zh" &&
    I18n.t("role.Top") === "上单" && I18n.setLocale("en") === "en" &&
    I18n.t("role.Top") === "Top");
}

/* 12 — champions.json: bilingual names from Data Dragon zh_CN */
{
  const zhOf = (id) => (champs.find((c) => c.id === id) || {}).nameZh;
  check("champions: all " + champs.length + " champions carry a nameZh",
    champs.length === 173 &&
    champs.every((c) => typeof c.nameZh === "string" && c.nameZh.length > 0));
  check("champions: nameZh spot checks — Ahri=阿狸, LeeSin=李青, Yasuo=亚索",
    zhOf("Ahri") === "阿狸" && zhOf("LeeSin") === "李青" && zhOf("Yasuo") === "亚索");
}

/* 13 — bilingual generation: brief + insights + copilot in zh and en,
   with no raw dictionary keys and no unresolved {placeholders} */
const nameOfZh = (id) => {
  const c = champs.find((x) => x.id === id);
  return c ? (c.nameZh || c.name) : id;
};
const RAW_KEY = /\b(brief|plan|reason|warn|insight|copilot|scout|sum|export|phase|role|kind|common)\.[a-z]/;
const PLACEHOLDER = /\{[a-zA-Z]+\}/;
const CJK = /[\u4e00-\u9fff]/;
{
  let okZh = true, okEn = true, zhDiffers = true;
  for (const file of ["data/scouting.json", "data/scouting.sample.json"]) {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    for (const tm of data.teams) {
      I18n.setLocale("en");
      const bEn = Brief.generateBrief(data, tm.id);
      const txtEn = Brief.briefToText(bEn);
      if (!bEn || txtEn.length < 200 || RAW_KEY.test(txtEn) || PLACEHOLDER.test(txtEn)) okEn = false;
      I18n.setLocale("zh");
      const bZh = Brief.generateBrief(data, tm.id, nameOfZh);
      const txtZh = Brief.briefToText(bZh, nameOfZh);
      if (!bZh || txtZh.length < 200 || !txtZh.includes(tm.name) ||
          RAW_KEY.test(txtZh) || PLACEHOLDER.test(txtZh) || !CJK.test(txtZh)) okZh = false;
      if (txtZh === txtEn) zhDiffers = false;
      for (const card of Scouting.insights(data, tm.id, nameOfZh)) {
        if (RAW_KEY.test(card.title + card.body) || PLACEHOLDER.test(card.title + card.body)) okZh = false;
      }
    }
  }
  I18n.setLocale("en");
  check("i18n: brief + insights generate cleanly in EN (no raw keys/placeholders)", okEn);
  check("i18n: brief + insights generate cleanly in ZH (Chinese output, no raw keys/placeholders)", okZh);
  check("i18n: ZH brief text actually differs from EN for the same team", zhDiffers);
}
/* copilot legality in ZH across the full demo replay (nameOf = nameZh) */
{
  I18n.setLocale("zh");
  const cs = freshDemoSeries();
  let statesChecked = 0, violations = 0, sawChinese = false;
  demo.games.forEach((g, gi) => {
    while (!Draft.isGameComplete(cs)) {
      const adv = Copilot.advise({ series: cs, scoutingData: realData,
        opponentId: "t1", ourSide: "B", championIds: champIds, rolesOf, nameOf: nameOfZh });
      statesChecked++;
      if (adv.recommendations.length !== 3) violations++;
      for (const r of adv.recommendations) {
        if (Draft.unavailableReason(cs, r.champion) !== null) violations++;
        if (RAW_KEY.test(r.reason) || PLACEHOLDER.test(r.reason)) violations++;
      }
      if (RAW_KEY.test(adv.headline) || PLACEHOLDER.test(adv.headline)) violations++;
      if (CJK.test(adv.headline)) sawChinese = true;
      const a = g.actions[Draft.currentGame(cs).actions.length];
      Draft.applyAction(cs, a.champion);
    }
    Draft.setWinner(cs, g.winner);
    if (gi < demo.games.length - 1) Draft.advanceGame(cs);
  });
  check("i18n: copilot in ZH — exactly 3 legal recs at all " + statesChecked +
    " demo states, clean Chinese headline", violations === 0 && statesChecked === 100 && sawChinese);
  I18n.setLocale("en");
}

/* 13b — Group C: shared shrunk WR' (m=16), primary-role filling,
   Ban-Phase-2 down-weighting, caller-wired champion total */
{
  check("draft: shrunkWinRate uses prior m=16 ((W+8)/(G+16))",
    Math.abs(Draft.shrunkWinRate({ games: 100, wins: 60 }) - 68 / 116) < 1e-12 &&
    Draft.shrunkWinRate({ games: 0, wins: 0 }) === 0.5 &&
    Draft.shrunkWinRate(null) === 0.5);

  // (a) A flex pick fills ONLY its primary role: Maokai's roles are
  // [Jungle, Support, Top] with Jungle primary — after we first-pick
  // him, Support must still count as open, so the best Support is
  // recommended WITH the fill-role reason (not merely as highest-rated).
  const flexStats = Object.assign({}, realStats, {
    Maokai: { games: 100, wins: 60 },
    Soraka: { games: 100, wins: 95 }
  });
  const fs2 = Draft.createSeries({ format: "BO1", blueName: "Blue", redName: "Red", championStats: flexStats });
  ["Teemo", "Warwick", "Skarner", "Ivern", "Quinn", "Zilean"]
    .forEach((id) => Draft.applyAction(fs2, id)); // ban phase 1
  Draft.applyAction(fs2, "Maokai");               // our first pick
  Draft.applyAction(fs2, "Ashe");                 // red picks
  Draft.applyAction(fs2, "Azir");
  const advFlex = Copilot.advise({ series: fs2, scoutingData: realData,
    opponentId: null, ourSide: "B", championIds: champIds, rolesOf });
  check("copilot: flex pick (Maokai) fills only its primary role — Support stays open",
    advFlex.recommendations.length === 3 &&
    advFlex.recommendations[0].champion === "Soraka" &&
    advFlex.recommendations[0].reason.indexOf("Fills our open Support slot") === 0);

  // (b) Ban Phase 2: the opponent (T1 profile, red side) has locked
  // Top (Rumble), Jungle (XinZhao) and Mid (Viktor). On our phase-2
  // ban, the top recommendation's primary role must be a still-open
  // role (ADC/Support), not one of the three locked roles.
  const bp = Draft.createSeries({ format: "BO1", blueName: "Blue", redName: "Red", championStats: realStats });
  ["Teemo", "Warwick", "Skarner", "Ivern", "Quinn", "Zilean", // ban phase 1
   "Jhin",                                                    // B pick
   "Rumble", "XinZhao",                                       // R picks: Top + Jungle
   "Ashe", "Azir",                                            // B picks
   "Viktor",                                                  // R pick: Mid
   "Sejuani"                                                  // R opens ban phase 2
  ].forEach((id) => Draft.applyAction(bp, id));
  const advBan = Copilot.advise({ series: bp, scoutingData: realData,
    opponentId: "t1", ourSide: "B", championIds: champIds, rolesOf });
  const topRole = (rolesOf[advBan.recommendations[0].champion] || [])[0];
  check("copilot: Ban Phase 2 top ban targets a still-open role (not Top/Jungle/Mid)",
    advBan.mode === "our-ban" && advBan.recommendations.length === 3 &&
    ["Top", "Jungle", "Mid"].indexOf(topRole) === -1);

  // brief: the champion-pool total is wired from the caller.
  const bWired = Brief.generateBrief(realData, "t1", undefined, 999);
  check("brief: series plan uses the caller-wired champion total (no hardcoded 173)",
    Brief.briefToText(bWired).includes("Full 999-champion pool"));
}

/* 13c — Group D: LLM endpoint policy (sync part) */
{
  check("llm: validateBaseUrl — https ok, localhost/127.0.0.1 http ok, other http rejected",
    LLM.validateBaseUrl("https://api.example.com/v1") === true &&
    LLM.validateBaseUrl("http://localhost:1234/v1") === true &&
    LLM.validateBaseUrl("http://127.0.0.1:8080") === true &&
    LLM.validateBaseUrl("http://evil.example") === false &&
    LLM.validateBaseUrl("http://localhost.evil.example") === false &&
    LLM.validateBaseUrl("not a url") === false);
  let urlThrew = false;
  try {
    LLM.setConfig({ preset: "custom", baseUrl: "http://evil.example",
      apiKey: "k", model: "m" });
  } catch (e) { urlThrew = /https/.test(e.message); }
  check("llm: setConfig rejects a non-https endpoint with a clear error", urlThrew);
  LLM.clearConfig();
}

/* 13d — comp.js: composition radar rubric + aggregation, pool depletion */
{
  const byId = {};
  champs.forEach((c) => { byId[c.id] = c; });

  check("champions: all 173 carry Data Dragon info {attack, defense, magic} in 0..10",
    champs.length === 173 && champs.every((c) => c.info &&
      ["attack", "defense", "magic"].every((k) =>
        Number.isInteger(c.info[k]) && c.info[k] >= 0 && c.info[k] <= 10)));

  check("comp: Frontline is info.defense verbatim for every champion",
    champs.every((c) => Comp.championScores(c).frontline === c.info.defense));

  check("comp: editorial overrides land — Malphite engage 10, Leona control 10, Ashe engage 7 (Marksman baseline is 2)",
    Comp.championScores(byId.Malphite).engage === 10 &&
    Comp.championScores(byId.Leona).control === 10 &&
    Comp.championScores(byId.Ashe).engage === 7);

  // Synthetic champions pin the rubric + aggregation arithmetic exactly.
  const mk = (id, tags, attack, defense, magic) =>
    ({ id: id, tags: tags, info: { attack: attack, defense: defense, magic: magic } });
  const syn = {
    TestTank: mk("TestTank", ["Tank"], 4, 9, 2),       // eng 7, ctl 7, front 9, scal 4
    TestMarks: mk("TestMarks", ["Marksman"], 9, 3, 1), // eng 2, ctl 3, front 3, scal 10 (9+1)
    TestMage: mk("TestMage", ["Mage"], 2, 4, 9)        // eng 3, ctl 6, front 4, scal 10 (9+1)
  };
  check("comp: tag baselines + scaling bonus (Marksman/Mage +1, capped at 10)",
    Comp.championScores(syn.TestTank).engage === 7 &&
    Comp.championScores(syn.TestTank).control === 7 &&
    Comp.championScores(syn.TestTank).scaling === 4 &&
    Comp.championScores(syn.TestMarks).scaling === 10 &&
    Comp.championScores(mk("TestCap", ["Mage"], 10, 5, 10)).scaling === 10);

  const emptyComp = Comp.teamComposition(syn, []);
  check("comp: no picks -> all-zero composition",
    emptyComp.picks === 0 && emptyComp.engage === 0 && emptyComp.frontline === 0 &&
    emptyComp.control === 0 && emptyComp.scaling === 0 && emptyComp.balance === 0);

  const comp3 = Comp.teamComposition(syn, ["TestTank", "TestMarks", "TestMage"]);
  check("comp: aggregation — engage/frontline are top-2 means, control/scaling full means",
    comp3.engage === 5 && comp3.frontline === 6.5 &&
    comp3.control === 5.3 && comp3.scaling === 8);
  const bal = {
    AD: mk("TestAD", ["Fighter"], 10, 5, 0),
    Even: mk("TestEven", ["Fighter"], 5, 5, 5)
  };
  check("comp: balance from summed attack vs magic (15 vs 12 -> 8.9; single-type -> 0; even split -> 10)",
    comp3.balance === 8.9 &&
    Comp.teamComposition(bal, ["AD"]).balance === 0 &&
    Comp.teamComposition(bal, ["Even"]).balance === 10);

  /* Pool depletion against a synthetic profile + a scripted series:
   * G1 first-picks Rumble (fearless in G2); G2 bans Gwen + Jax and
   * first-picks Jayce. Filler actions never touch profile champions. */
  const prof = { rolePools: {
    Top: { distinct: 5, champions: {
      Rumble: { games: 16, wins: 11 }, Gwen: { games: 15, wins: 11 },
      Ambessa: { games: 10, wins: 7 }, Jayce: { games: 9, wins: 6 },
      Jax: { games: 9, wins: 5 } } },
    Support: { distinct: 5, champions: {
      Renata: { games: 12, wins: 8 }, Rakan: { games: 11, wins: 7 },
      Leona: { games: 10, wins: 6 }, Nautilus: { games: 9, wins: 6 },
      Braum: { games: 8, wins: 5 } } }
  } };
  const avoid = new Set(["Rumble", "Gwen", "Ambessa", "Jayce", "Jax",
    "Renata", "Rakan", "Leona", "Nautilus", "Braum"]);
  const filler = (sr) => ids.find((x) => !avoid.has(x) &&
    !Draft.unavailableReason(sr, x) &&
    !Draft.currentGame(sr).actions.some((a) => a.championId === x));
  const depSeries = Draft.createSeries({ format: "BO3", championStats: stats });
  while (!Draft.isGameComplete(depSeries)) {
    const step = Draft.nextAction(depSeries);
    const n = Draft.currentGame(depSeries).actions.length;
    Draft.applyAction(depSeries,
      step.type === "pick" && n === 6 ? "Rumble" : filler(depSeries));
  }
  Draft.setWinner(depSeries, "blue");
  Draft.advanceGame(depSeries);
  Draft.applyAction(depSeries, "Gwen"); // G2 ban phase 1
  Draft.applyAction(depSeries, "Jax");
  while (Draft.currentGame(depSeries).actions.length < 6) {
    Draft.applyAction(depSeries, filler(depSeries));
  }
  Draft.applyAction(depSeries, "Jayce"); // G2 first pick
  const dep = Comp.poolDepletion(prof, depSeries);
  const top = dep.roles.Top;
  const byChamp = {};
  top.champions.forEach((c) => { byChamp[c.champion] = c; });
  check("comp: depletion top-5 ordered by games, wins break the 9-game tie (Jayce over Jax)",
    top.champions.map((c) => c.champion).join(",") === "Rumble,Gwen,Ambessa,Jayce,Jax");
  check("comp: depletion reasons — earlier-game pick is fearless, current-game ban/pick marked, survivor available",
    byChamp.Rumble.reason === "fearless" && byChamp.Gwen.reason === "banned" &&
    byChamp.Jax.reason === "banned" && byChamp.Jayce.reason === "picked" &&
    byChamp.Ambessa.available === true && byChamp.Ambessa.reason === null);
  check("comp: depletion remaining + <=1 alert (Top down to 1 -> alert; Support untouched; empty role inert)",
    top.remaining === 1 && top.alert === true &&
    dep.roles.Support.remaining === 5 && dep.roles.Support.alert === false &&
    dep.roles.Mid.total === 0 && dep.roles.Mid.alert === false);
  check("comp: poolDepletion is null without a profile or a series",
    Comp.poolDepletion(null, depSeries) === null &&
    Comp.poolDepletion(prof, null) === null);
}

/* 15 — round 4: dry-role summaries name only the 1–2 most critical
   roles, and copilot reasons are hygienic (no WR prime/apostrophe,
   sample size stated exactly once as (n=...)) */
{
  let dryOK = true;
  for (const file of ["data/scouting.json", "data/scouting.sample.json"]) {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    for (const tm of data.teams) {
      const b = Brief.generateBrief(data, tm.id);
      if (b && b.lateRisk.dryRoles.length > 2) dryOK = false;
    }
  }
  const t1Brief = Brief.generateBrief(realData, "t1");
  check("brief: dry-role summary capped at the 2 most critical (T1 data order: Jungle, Mid, Top, ADC)",
    dryOK && t1Brief.lateRisk.dryRoles.join(",") === "Jungle,Mid");

  const hygiene = (locale) => {
    I18n.setLocale(locale);
    const cs = freshDemoSeries();
    let bad = 0, seen = 0;
    const g = demo.games[0];
    while (!Draft.isGameComplete(cs)) {
      for (const opp of ["t1", null]) {
        const adv = Copilot.advise({ series: cs, scoutingData: realData,
          opponentId: opp, ourSide: "B", championIds: champIds, rolesOf });
        for (const r of adv.recommendations) {
          seen++;
          if (r.reason.includes("′") || /WR'/.test(r.reason)) bad++;
          if ((r.reason.match(/n=/g) || []).length > 1) bad++;
        }
      }
      const a = g.actions[Draft.currentGame(cs).actions.length];
      Draft.applyAction(cs, a.champion);
    }
    return { bad: bad, seen: seen };
  };
  const hyEn = hygiene("en");
  const hyZh = hygiene("zh");
  I18n.setLocale("en");
  check("copilot: EN reasons — no WR prime, sample size at most once (" + hyEn.seen + " reasons)",
    hyEn.bad === 0 && hyEn.seen > 100);
  check("copilot: ZH reasons — no WR prime, sample size at most once (" + hyZh.seen + " reasons)",
    hyZh.bad === 0 && hyZh.seen > 100);
}

/* 14 — LLM layer: presets, and ZERO network calls while unconfigured.
   Round 4 (judge pass): the preset order is OpenAI-first and OpenAI
   is the default for a fresh install; Bailian stays in the list with
   its endpoint + model untouched, and a SAVED Bailian config must
   still load over the new default (asserted below and exercised by
   the narrate() chain, which configures Bailian explicitly). */
check("llm: preset order is OpenAI, OpenRouter, Gemini, Bailian, Custom; default is OpenAI",
  LLM.DEFAULT_PRESET === "openai" &&
  JSON.stringify(LLM.PRESET_ORDER) ===
    JSON.stringify(["openai", "openrouter", "gemini", "bailian", "custom"]) &&
  LLM.PRESETS.openai.baseUrl === "https://api.openai.com/v1" &&
  LLM.PRESETS.openrouter.baseUrl === "https://openrouter.ai/api/v1" &&
  LLM.PRESETS.gemini.baseUrl === "https://generativelanguage.googleapis.com/v1beta/openai/");
check("llm: Bailian preset kept intact (endpoint + deepseek-v4.1-flash), Custom present",
  LLM.PRESETS.bailian.baseUrl === "https://dashscope.aliyuncs.com/compatible-mode/v1" &&
  LLM.PRESETS.bailian.model === "deepseek-v4.1-flash" &&
  !!LLM.PRESETS.custom);
LLM.clearConfig();
LLM.setConfig({ preset: "bailian", baseUrl: LLM.PRESETS.bailian.baseUrl,
  apiKey: "sk-test-not-a-real-key", model: LLM.PRESETS.bailian.model });
check("llm: a saved Bailian config still loads over the new OpenAI default",
  LLM.getConfig() !== null && LLM.getConfig().preset === "bailian" &&
  LLM.getConfig().baseUrl === "https://dashscope.aliyuncs.com/compatible-mode/v1" &&
  LLM.getConfig().model === "deepseek-v4.1-flash");
LLM.clearConfig();
let fetchCalls = 0, lastReq = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  fetchCalls++;
  lastReq = { url, opts };
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: "Narrative ok." } }] }),
    text: () => Promise.resolve("")
  });
};
LLM.clearConfig();
LLM.narrate("facts").then(
  () => check("llm: unconfigured narrate() rejects", false),
  () => check("llm: unconfigured narrate() rejects", true)
).then(() => {
  check("llm: unconfigured narrate() made ZERO network calls", fetchCalls === 0);
  LLM.setConfig({ preset: "bailian", baseUrl: LLM.PRESETS.bailian.baseUrl,
    apiKey: "sk-test-not-a-real-key", model: LLM.PRESETS.bailian.model });
  check("llm: isConfigured() after setConfig with all fields", LLM.isConfigured());
  return LLM.narrate("fact sheet");
}).then((narrative) => {
  check("llm: configured narrate() returns the model narrative", narrative === "Narrative ok.");
  check("llm: request went to the configured endpoint's /chat/completions",
    lastReq && lastReq.url === "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" &&
    JSON.parse(lastReq.opts.body).model === "deepseek-v4.1-flash" &&
    lastReq.opts.headers.Authorization === "Bearer sk-test-not-a-real-key");
  LLM.clearConfig();
  check("llm: clearConfig() returns to unconfigured", !LLM.isConfigured());
  // Narration language follows the UI locale.
  LLM.setConfig({ preset: "bailian", baseUrl: LLM.PRESETS.bailian.baseUrl,
    apiKey: "sk-test-not-a-real-key", model: LLM.PRESETS.bailian.model });
  I18n.setLocale("zh");
  return LLM.narrate("fact sheet").then(() => {
    const sys = JSON.parse(lastReq.opts.body).messages[0].content;
    check("llm: ZH locale -> narration instructed to answer in Simplified Chinese",
      sys.includes("Simplified Chinese"));
    I18n.setLocale("en");
    return LLM.narrate("fact sheet");
  }).then(() => {
    const sys = JSON.parse(lastReq.opts.body).messages[0].content;
    check("llm: EN locale -> narration instructed to answer in English",
      sys.includes("in English"));
    LLM.clearConfig();
  });
}).then(() => {
  // Group D: narrate() error branches reject cleanly.
  LLM.setConfig({ preset: "bailian", baseUrl: LLM.PRESETS.bailian.baseUrl,
    apiKey: "sk-test-not-a-real-key", model: LLM.PRESETS.bailian.model });
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 401,
    text: () => Promise.resolve("unauthorized"), json: () => Promise.resolve({}) });
  return LLM.narrate("facts").then(
    () => check("llm: HTTP 401 rejects cleanly", false),
    (e) => check("llm: HTTP 401 rejects cleanly", /401/.test(e.message)));
}).then(() => {
  globalThis.fetch = () => Promise.resolve({ ok: true,
    json: () => Promise.resolve({ choices: [] }), text: () => Promise.resolve("") });
  return LLM.narrate("facts").then(
    () => check("llm: empty choices rejects cleanly", false),
    () => check("llm: empty choices rejects cleanly", true));
}).then(() => {
  globalThis.fetch = () => Promise.reject(new Error("socket hangup"));
  return LLM.narrate("facts").then(
    () => check("llm: network failure rejects cleanly", false),
    (e) => check("llm: network failure rejects cleanly", e.message === "socket hangup"));
}).then(() => {
  LLM.clearConfig();
  globalThis.fetch = realFetch;
  console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL TESTS PASSED");
  process.exit(failures ? 1 : 0);
}).catch((e) => {
  globalThis.fetch = realFetch;
  check("llm: async test chain completed (" + e.message + ")", false);
  console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL TESTS PASSED");
  process.exit(1);
});
