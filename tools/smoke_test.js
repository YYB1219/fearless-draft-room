#!/usr/bin/env node
/*
 * smoke_test.js — state-machine and data smoke tests (no browser needed).
 * Run: node tools/smoke_test.js    (exit code 0 = all passed)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const Draft = require("../js/draft.js");
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
check("demo ends 3-2", ds.wins.blue === 3 && ds.wins.red === 2);
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

/* 11 — LLM layer: presets, and ZERO network calls while unconfigured */
check("llm: default preset is Aliyun Bailian (DeepSeek) with its endpoint + model",
  LLM.DEFAULT_PRESET === "bailian" && LLM.PRESET_ORDER[0] === "bailian" &&
  LLM.PRESETS.bailian.baseUrl === "https://dashscope.aliyuncs.com/compatible-mode/v1" &&
  LLM.PRESETS.bailian.model === "deepseek-v4.1-flash" &&
  !!LLM.PRESETS.openai && !!LLM.PRESETS.custom);
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
  globalThis.fetch = realFetch;
  console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL TESTS PASSED");
  process.exit(failures ? 1 : 0);
}).catch((e) => {
  globalThis.fetch = realFetch;
  check("llm: async test chain completed (" + e.message + ")", false);
  console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL TESTS PASSED");
  process.exit(1);
});
