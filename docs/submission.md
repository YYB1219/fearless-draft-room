# Devpost Submission Copy — Fearless Draft Room

*Ready to paste. Category 2: League of Legends Macro Scouting & Draft Management System (Cloud9 × JetBrains, Sky's The Limit Hackathon 2026).*

---

## Project name

Fearless Draft Room

## Tagline

Fearless Draft turns the champion pool into a shrinking resource. This is the draft room that tracks it — and tells you how to win it.

## Description

Fearless Draft Room turns Fearless Draft chaos into a coach-ready command center.

Built for the Cloud9 × JetBrains "Sky's The Limit" Hackathon 2026, Category 2: League of Legends Macro Scouting & Draft Management System, Fearless Draft Room addresses a concrete problem: Fearless Draft makes normal draft tools and static spreadsheets fail. Once champions picked in earlier games are removed from both teams for the rest of a series, draft planning has to track series history, shrinking pools, and opponent tendencies at the same time.

We built a dependency-free static web app using plain HTML/CSS/JS with no build step. It combines a Fearless Draft organizer with a pro-match scouting/tendency analyzer. The organizer supports the full standard 20-action draft sequence per game and BO1/BO3/BO5 series. Its Fearless Draft engine makes champions PICKED in earlier games unavailable to both teams for the rest of the series; bans do not carry over. Every champion tile is badged with the game it was picked in, and a pool-shrink banner shows, for example, that by Game 5, 40 champions are fearless-banned and the pool is at 77%. Coaches get undo/reset, a series summary, copyable text export, and a live win-rate impact bar explicitly labeled as a heuristic estimate.

The scouting side uses real data: aggregates computed from the official GRID starter dataset covering LCK, LEC, LTA North/South, and LCS 2025–2026 — 466 series, 1,041 games, and 12 pro teams including Cloud9 Kia and T1. Views include most frequent first picks, most banned-against champions, per-role player champion pools with games and win rates, a Fearless Shift view, and rule-generated "How to Win" insight cards: ban suggestions with win-rate differentials, first-pick priorities vs. the dataset baseline, wasted-ban detection, concentrated role pools, and Game 4/5 pool-exhaustion warnings. Every insight card shows its sample size.

An AI layer runs on top of the same state and data, as an agent loop a coach can audit: perceive the draft state, reason over the evidence, recommend — the human decides. The AI Brief Generator turns the selected opponent's aggregates into a structured pre-match brief (tendencies, top-3 ban targets with win-rate differentials, first-pick priorities, late-series pool-exhaustion risks, and a Game 1–5 series plan that shifts as Fearless bans accumulate), exportable as plain text in one click. The AI Draft Copilot re-evaluates after every draft action: a one-line read of the position, exactly three recommendations for the current turn (picks, bans, or "watch" threats on the opponent's turn — each with a one-line, number-carrying reason), and warnings when a role pool is about to run dry. Recommendations are drawn only from champions the state machine currently allows, and the tests prove a banned or fearless-banned champion is never suggested across all 100 draft states of the demo BO5. Optionally, a BYOK narration layer can re-tell the brief or the copilot's state summary through the user's own OpenAI-compatible model — the key is stored only in the browser's localStorage and sent only to the endpoint the user configures; the settings ship with presets for OpenAI, OpenRouter, Google Gemini, and Aliyun Bailian (DeepSeek — the author's own provider; endpoint and model prefilled, key blank), plus a custom-endpoint option.

Two more instruments watch the series as it is played. A composition radar scores both teams' current-game picks on five dimensions — Engage, Frontline, Control, Scaling, Damage mix — from Data Dragon's own ratings under a documented rubric, labeled a heuristic estimate exactly like the win-rate bar. An opponent pool-depletion panel tracks the Copilot opponent's top-five comfort picks per role and strikes them through live as the series consumes them, flagging any role down to its last champion. And the Draft Room opens on a CSS-3D showcase ring of the dataset's most-played champions — every number on its cards drawn from the same GRID aggregates — which mirrors the live draft: picked champions light up, fearless bans dim.

The interface is a polished dark analytics dashboard and is fully bilingual (English / 中文）: a header toggle switches every label and every generated brief, recommendation, insight and export in place — champion names included （阿狸 / 李青 / 亚索 from Data Dragon zh_CN) — and the optional BYOK narration answers in whichever language the UI is in.

For coaches, Fearless Draft Room keeps series-aware draft logistics and evidence-backed scouting in one place, so pool exhaustion and opponent tendencies are visible before the next pick — not reconstructed from a spreadsheet between games.

## How we built it

A pure-JavaScript state machine (`js/draft.js`, no DOM) implements the 20-action draft and the Fearless carry-over rule, and is exercised directly by Node smoke tests (99 checks, including a full scripted BO5 replay, per-team brief completeness, copilot recommendation legality at every demo draft state, per-game side-swap accounting, a zero-network assertion for the unconfigured BYOK layer, and bilingual coverage + generation checks in both locales; a companion Python suite pins the aggregation semantics with 16 more checks). Analytics (`js/scouting.js`) are pure functions over aggregate team profiles; the AI brief generator (`js/brief.js`), the draft copilot (`js/copilot.js`), and the optional BYOK narration client (`js/llm.js`) are likewise pure/local modules over the same state and aggregates. The data pipeline is Python: it streams GRID's zstd-compressed series feeds, extracts ordered draft actions from `team-banned-character` / `team-picked-character` events, joins players from GRID's meta tables, validates every game, and aggregates — because GRID's license allows building with the data but forbids redistributing it, the repo ships aggregates only, exactly as the starter repo's README prescribes. Champion data is a Data Dragon 16.23.1 snapshot.

## Challenges

- GRID's starter repo is 1.4 GB of compressed event feeds with a strict no-redistribution license: the pipeline had to extract full draft order from raw event streams (draft events precede each game's start; three feeds contain two sessions) and reduce everything to publishable aggregates.
- Insight thresholds tuned for highlight reels produce noise on real data (1,000+ games): rules were recalibrated against real distributions — differentials and dataset-relative rates instead of raw shares — and capped so a coach sees targets, not a phone book.

## What we learned

Fearless Draft is not "draft, but longer" — it is a resource-management game across the whole series, and the data proves it: by Game 4, over half of a typical team's top-5 comfort pool is already gone. Tools that reset every game are answering the wrong question.

## Built with

HTML, CSS, JavaScript (no framework, no build step), Python 3 (data pipeline), Riot Data Dragon, GRID esports data (official hackathon starter dataset).

## Try it

Open the GitHub Pages deployment (or serve the repo root with any static server), press **Load demo series (BO5)**, and step through a complete Fearless series — then open the Scouting tab and pick T1 or Cloud9 Kia.

---

## Bonus prize — Best AI-Powered Workflow Story (case study draft)

> **⚠ CONDITIONAL — read before submitting.** This case study may only be submitted if JetBrains AI tooling (Junie and/or JetBrains Air, inside WebStorm) is *actually used* during the polish pass, as planned. If it was not used, do not submit this section. The bracketed items must be replaced with the real tasks performed.

### Draft text (edit with the real examples before use)

Building Fearless Draft Room was a data-engineering problem wearing a UI costume: 1.4 GB of compressed GRID event feeds had to become a draft state machine, an analytics layer, and a coach-readable interface. During the polish pass, [JetBrains Junie / Air — replace with what was actually used] was used inside WebStorm to [concrete task 1, e.g. "refactor the insight-rule module while keeping the Node smoke tests green"], [concrete task 2], and [concrete task 3]. The workflow that worked: keep the core logic in pure, testable modules; let the agent propose changes against the smoke-test suite as the contract; review every diff against the real GRID-derived aggregates before accepting. The measurable effect: [only state effects that actually happened, e.g. "the recalibration of insight thresholds across 12 team profiles was iterated in N passes with all 21 smoke tests passing"]. What AI did not do: the Fearless rules engine semantics, the GRID license analysis, and every number quoted in the scouting views were verified by hand against the source data.
