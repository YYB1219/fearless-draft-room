# Fearless Draft Room

**A Fearless-Draft-native draft organizer + pro scouting system for League of Legends coaching staffs.**

Built for the **Cloud9 × JetBrains "Sky's The Limit" Hackathon 2026 — Category 2: Macro Scouting & Draft Management System.**

Normal draft tools assume every game starts from the full 173-champion pool. Fearless Draft breaks that assumption: every champion *picked* in an earlier game is banned for both teams for the rest of the series. By Game 5 of a BO5, **40 champions are gone** and coaches are drafting from 77% of the pool — while also tracking who is on comfort, whose pool is about to run dry, and what the opponent will do next. Fearless Draft Room is built around exactly that problem: the draft board, the series state, and the scouting evidence live in one place.

---

## What it does (mapped to Category 2)

**1. Draft Organizer — run a live Fearless series without a spreadsheet**
- Full standard 20-action draft per game (Ban 3+3 → Pick 1-2-2-1 → Ban 2+2 → Pick 1-2-1), BO1/BO3/BO5 series, team names and patch label.
- **Fearless engine (the core):** champions picked in any earlier game become unavailable to *both* teams for the rest of the series; bans do not carry over. Illegal selections are rejected by the state machine, not just greyed out.
- Every champion tile is badged with the game it was picked in (`F·G1`, `F·G2`, …), and a **pool-shrink banner** always shows the series state: *"Game 5: 40 champions fearless-banned · pool at 77%"*.
- Undo, reset game/series, per-game winner marking, series summary, and a copyable plain-text export of the full draft history for post-series review.
- A live **win-rate impact bar** (transparent heuristic — formula and limits below) that updates after every pick.
- **One-click demo series:** a fully scripted, Fearless-legal BO5 is built in — press *Load demo series*, then step through it or auto-play it.

**2. Scouting & Tendencies — answer the two questions coaches actually ask**
- Pick an opponent (12 pro teams profiled from real match data) and get:
  - **Most frequent first selections** and **most banned-against champions**, with counts and shares.
  - **Champion pools by role** — top 5 per player/role with games played and win rate.
  - **Fearless Shift view** — how their picks change by game number, how many of their own picks are already gone, and how far the shared pool has shrunk.
  - **"How to Win" insight cards**, rule-generated from the data (never hand-written), each showing its sample size:
    - *Ban suggestions* — comfort picks with the win-rate **differential** (with vs. without the champion).
    - *First-pick priority* — champions they first-pick at ≥2× the dataset-wide rate.
    - *Wasted-ban detection* — champions opponents keep banning even though the team wins those games *above* its baseline.
    - *Concentrated role pools* — roles where two champions cover ≥70% of games: a phase-2 ban target.
    - *Pool-exhaustion warnings (Game 4/5)* — how much of their top-5 comfort pool is already fearless-banned when a series goes long, and which roles run dry first.

**3. AI layer — an agent loop the coach can audit (all local, all evidence-carrying)**
- **AI Brief Generator （赛前简报）** — one click turns the selected opponent's aggregates into a structured pre-match brief: overall tendencies, the top 3 ban targets (each with games, win rate with vs. without the champion, the differential, and n), first-pick priorities, Fearless late-series risks, and a **Game 1–5 series plan** that re-derives itself from how Fearless bans accumulate (their Game-1 identity disappears, their pool migrates, their dry roles get attacked in Games 4–5). Rendered in the Scouting view with a plain-text **Copy brief** export.
- **AI Draft Copilot （实时副驾）** — a live side panel in the Draft Room that runs a perceive → reason → recommend loop after *every* draft action: it snapshots the state machine (game, phase, turn, the Fearless-unavailable set), scores every *legal* option against the opponent's tendencies, champion WR′, role needs, and pool depth, then shows a one-line read of the position, exactly **3 recommendations** (picks on our turn, bans on our ban turn, "watch" threats on the opponent's turn — each with a one-line, number-carrying reason), and **pool-dry warnings** when a role's comfort or meta pool is about to run out. A picked, banned, or fearless-banned champion can *never* be recommended — the candidate pool is the state machine's legal set, and the smoke tests assert this at all 100 states of the demo BO5. **The human coach always makes the call**; the copilot only computes.
- **Optional BYOK narration** — the brief and copilot are complete without any network. If the user wants prose, a settings panel (⚙ AI settings) lets them plug in *their own* OpenAI-compatible endpoint and key: the app then sends **only the already-generated structured facts** (the brief text / the copilot state summary) to that model and displays the narrative, under a system prompt that forbids inventing numbers. **Privacy model:** no key is bundled with the app; the configuration is stored only in the browser's `localStorage`; the key travels only to the endpoint the user configured. The default provider preset is **Aliyun Bailian (DashScope)** — the author's own provider — with its endpoint (`https://dashscope.aliyuncs.com/compatible-mode/v1`) and the `deepseek-v4.1-flash` model prefilled and the key field left blank; judges and visitors can equally pick the OpenAI preset or any custom OpenAI-compatible endpoint. With nothing configured, the narration buttons are disabled and the code path makes zero network calls (asserted in the tests).

## Why this matters to a coaching staff (impact)

Between games of a Fearless series, a coach has minutes to: reconstruct which 10–40 champions are now illegal, check them against both teams' tendencies, and re-plan two ban phases — usually across a spreadsheet, a stats site, and memory. Every manual step is a chance to draft an already-banned champion or waste a ban. Fearless Draft Room removes the bookkeeping entirely (the state machine *cannot* offer an illegal champion), keeps the pool-shrink number on screen at all times, and puts the opponent's tendencies — with sample sizes, so a coach can judge how much to trust them — one click away instead of a research session away. The same screen then exports the whole series as text for the post-match review.

## How to run

No build step, no dependencies.

```bash
# from the repo root — any static server works:
python3 -m http.server 8000
# then open http://localhost:8000
```

Or publish the repo on **GitHub Pages** (root folder) — it is a plain static site. Champion icons load from Riot's Data Dragon CDN; if an icon fails, the tile falls back to the champion's initial. Everything else (including all match-data aggregates) is bundled, so the app itself works offline.

**Tests:** `node tools/smoke_test.js` — 37 checks covering the draft sequence, Fearless carry-over, the demo BO5 replay, insight sample sizes, brief completeness for every team, copilot legality (exactly 3 recommendations, never an unavailable champion, across all 100 demo draft states), and the BYOK layer (correct Bailian preset; zero network calls while unconfigured).

## Data provenance

**Champions** — Riot **Data Dragon** 16.23.1 (`data/champions.json`: id, name, tags, approximated pro roles from a curated position map; regenerate with `tools/build_champions.py`). Roles are approximations used for filtering and pool views.

**Match data — REAL, from GRID.** The official starter repository
([cloud9esports/stl-hackathon-2026-grid-starter](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter))
contains the full GRID event feeds for 745 LoL series (LCK, LEC, LTA North/South, LCS — 2025 and 2026 seasons), including `team-banned-character` / `team-picked-character` draft events. `tools/build_scouting_from_grid.py` streams those feeds for 12 selected pro teams (Cloud9 Kia, T1, Gen.G, Hanwha Life, KT, Dplus KIA, G2, Fnatic, Karmine Corp, Movistar KOI, GIANTX, Team Liquid), joins player names from `meta/rosters.csv`, and validates every game (exactly 10 picks + 10 bans, GRID's `session_valid` flag): **466 series, 1,041 games** survived validation.

**License handling — read this before reusing the data.** GRID's data license allows building with the data during the hackathon but **forbids redistribution**; the starter README draws the line explicitly: raw feeds and per-game extracts must not be committed, while *"code, charts, screenshots and aggregate results are fine to commit."* This project therefore ships **aggregates only**: `data/scouting.json` contains per-team tendency tables and counts (the same aggregates the charts show), never per-game records. To reproduce: clone the starter repo *next to* this project (never inside it — see `.gitignore`), then run `STL_DATA_DIR=/path/to/starter python3 tools/build_scouting_from_grid.py` (requires `pip install zstandard`). Aggregates were computed with `tools/aggregate.py`.

**Sample fallback.** If `data/scouting.json` is absent, the app loads `data/scouting.sample.json` — a clearly-labeled **sample** dataset (fictional teams, seeded simulation via `tools/generate_sample_data.py`, same schema). The UI badge and footer always state which dataset is loaded. Sample data is never presented as real.

## Methodology — the two judge questions

**Q1: What are the opponent's recurring pick/ban tendencies?**
From 1,041 real games we aggregate, per team: first-selection frequencies; bans received; per-role champion pools (games + win rate per champion); and per-champion contingency tables (games/wins with the champion, without it, and when it was banned against them). Insight cards are generated by explicit rules over these tables (thresholds are constants in `js/scouting.js`), and every card prints its n. Examples the rules find in the real data: Karmine Corp won 100% of 8 Kalista games vs. 62% without her (+38 pts → *Ban Kalista*); opponents banned Pantheon against T1 in 16 games and T1 won 81% of them, above their 64% baseline (→ *Don't waste a ban*).

**Q2: How does the draft shift in Fearless Games 3/4/5?**
Within every series that reached Game 3+, we track by game number: what the team actually picked, how many of *their own* earlier picks were already fearless-banned (10 per game, cumulative), and the total shared-pool shrinkage (20 per game across both teams). The Fearless Shift view shows the migration (e.g., a team's Game-1 comfort picks disappear and Game-4/5 picks scatter into pocket picks), and the pool-exhaustion rule quantifies it: across T1's 5 series that reached Game 4+, an average of **3.5 of their top-5 comfort picks were already gone by Game 4**, with Top and Mid running dry first. No non-Fearless tool surfaces this, because in a normal draft the pool resets every game.

**Win-rate heuristic — formula and limitations.**
For each champion, the dataset gives games G and wins W. We shrink small samples toward 50%: `WR' = (W + 2) / (G + 4)`. A side's draft score is `Σ (WR' − 0.50)` over its five picks; Blue's estimated win probability is the logistic `1 / (1 + e^(−6·(scoreBlue − scoreRed)))`, updated live as picks land. **Limitations, stated plainly:** it uses champion-level (not player- or matchup-level) win rates pooled across patches and opponents; it ignores team strength, side win-rate, draft order, and synergies/counters; bans are ignored. It is a conversation starter for the draft room, labeled "heuristic estimate" everywhere it appears — not a prediction model.

## Tooling

The app itself is deliberately dependency-free: hand-written HTML/CSS/JS (`js/draft.js` is a pure, DOM-free state machine — the same file the Node smoke tests exercise; `js/scouting.js` is pure analytics over the aggregate profiles; `js/app.js` is rendering only). Data tooling is Python 3 stdlib plus `zstandard` for reading GRID feeds.

> **[TO FINALIZE — JetBrains tooling paragraph.]** This paragraph will be completed truthfully at polish time: the project will be opened in **WebStorm** (JetBrains All Products trial obtained via this hackathon's registration) and **Junie / JetBrains Air** will be used during the polish pass; the final text will describe only the JetBrains tools actually used and what they were used for. If the bonus "Best AI-Powered Workflow" entry is submitted, its case study (`docs/submission.md`) is valid only under the same condition.

## Project structure

```
index.html            App shell (Draft Room + Scouting views)
css/style.css         Dark esports theme
js/draft.js           Fearless draft state machine (pure logic, tested)
js/scouting.js        Tendency analytics + insight rules (pure logic)
js/brief.js           AI Brief Generator — structured pre-match briefs (pure logic)
js/copilot.js         AI Draft Copilot — perceive → reason → recommend (pure logic)
js/llm.js             Optional BYOK narration layer (user's own endpoint + key)
js/app.js             Rendering / event wiring
data/champions.json   Data Dragon 16.23.1 snapshot (173 champions)
data/scouting.json    REAL GRID-derived aggregates (12 teams, 1,041 games)
data/scouting.sample.json  Labeled SAMPLE fallback (fictional, seeded)
data/demo_series.json Scripted Fearless-legal BO5 for one-click demos
tools/build_champions.py        Regenerate champions.json from Data Dragon
tools/build_scouting_from_grid.py  GRID feeds -> aggregates (needs starter repo)
tools/generate_sample_data.py   Seeded sample-data generator
tools/aggregate.py              Shared aggregation used by both builders
tools/smoke_test.js             State-machine + data smoke tests
docs/submission.md              Devpost submission copy
docs/video-script.md            ≤3-minute demo video script
```

## License

Project code and documentation: MIT (see `LICENSE`, © YYB1219). Champion data © Riot Games via Data Dragon; GRID-derived aggregates are computed from the GRID starter dataset under its hackathon license terms described above.
