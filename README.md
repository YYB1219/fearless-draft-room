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
- A **composition radar** — five dimensions (Engage / Frontline / Control / Scaling / Damage mix) overlaying both teams' current-game picks, scored from Data Dragon `info` ratings under a documented rubric (below) and labeled a heuristic estimate, exactly like the win-rate bar.
- An **opponent pool-depletion panel** — for the opponent selected in the Copilot, their top-5 comfort picks per role, struck through live as the series consumes them (fearless-locked, picked, or banned), with a remaining count per role and a red ⚠ highlight when a role is down to its last champion.
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
- **Optional BYOK narration** — the brief and copilot are complete without any network. If the user wants prose, a settings panel (⚙ AI settings) lets them plug in *their own* OpenAI-compatible endpoint and key: the app then sends **only the already-generated structured facts** (the brief text / the copilot state summary) to that model and displays the narrative, under a system prompt that forbids inventing numbers. **Privacy model:** no key is bundled with the app; the configuration is stored only in the browser's `localStorage`; the key travels only to the endpoint the user configured. The settings ship with presets for **OpenAI** (the default), OpenRouter, Google Gemini, and **Aliyun Bailian (DashScope)** — the author's own provider, its endpoint (`https://dashscope.aliyuncs.com/compatible-mode/v1`) and the `deepseek-v4.1-flash` model prefilled with the key field left blank — plus a custom-endpoint option. With nothing configured, the narration buttons are disabled and the code path makes zero network calls (asserted in the tests).

**4. Professional bilingual UI (EN / 中文） — a dashboard finish, in two languages**
- **Polish:** a pro analytics-dashboard finish on the dark esports theme — a strict spacing/type scale, layered surfaces with hairline dividers, tabular numbers everywhere a coach compares figures, team-color accents (blue/red) used consistently, gold reserved for the pool-shrink headline and warnings, distinct picked / banned / fearless tile states, keyboard-visible focus, subtle 150–250 ms transitions with `prefers-reduced-motion` respected — plus one-shot motion feedback as the draft moves: the slot a pick or ban lands in pops with a glow ring, its grid tile flashes, and the phase banner pulses when the draft enters a new phase (all CSS keyframes on transient classes, all stilled under `prefers-reduced-motion`). No external fonts or libraries — system font stack only, still fully offline-capable.
- **Bilingual:** a header toggle (**EN / 中文**) switches the *entire* UI in place, no reload — every label, button, toast and settings string, and every generated sentence: brief sections and series plan, copilot readouts / recommendation reasons / warnings, "How to Win" cards, phase names, and the text export. The choice persists in `localStorage` (`fdr.lang`); English is the default.
- **Bilingual champion names:** `data/champions.json` carries `nameZh` for all 173 champions (from Data Dragon zh_CN — see provenance), so tiles, slots, pools, briefs and recommendations show 阿狸 / 李青 / 亚索 in 中文 mode, and champion search matches both languages (typing 李青 or *Ahri* both find her). The BYOK narration is instructed to answer in whichever language the UI is in.

**5. Visual layer — a 3D showcase over the arena (pure CSS/canvas, zero dependencies)**
- The Draft Room opens on a hero band with a **CSS-3D showcase ring** (`js/showcase.js`): twelve champion cards on a `preserve-3d` rotor, spinning slowly, draggable, pausing on hover. The cards are the dataset's most-played champions overall, and every number on them — games played and win rate — comes from the same GRID aggregates (`championStats`) the scouting views use; nothing is decorative fiction. The ring also mirrors the live draft through a single read-only hook at the end of the render path: a champion picked in the current game lights up with a PICKED badge, and fearless-banned champions dim behind the same `F·G#` badge the board itself uses. Behind the app, a fixed canvas paints a subtle particle starfield (≈130 particles, paused while the tab is hidden) over the existing arena backdrop. Champion tiles answer the pointer with a small perspective tilt and a holographic shine. All of it is transform/opacity/canvas only — no libraries, no fonts, no extra network calls — and `prefers-reduced-motion` stills the ring, the starfield, and the tilt.

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

**Tests:** `node tools/smoke_test.js` — 99 checks covering the draft sequence, Fearless carry-over, the demo BO5 replay, insight sample sizes, brief completeness for every team, copilot legality (exactly 3 recommendations, never an unavailable champion, across all 100 demo draft states), the composition-radar rubric and aggregation arithmetic plus pool-depletion state tracking (scripted series: fearless / picked / banned reasons, remaining counts, the ≤1 alert), per-game side swaps with per-team wins, serialize/restore round-trips, the BYOK layer (correct Bailian preset; zero network calls while unconfigured; endpoint URL policy; clean rejection on HTTP 401 / empty / network errors), and the bilingual layer (every UI string key used in code/HTML exists in both locales; brief, insights and copilot generate cleanly in 中文 with legality re-verified across the full demo replay; `nameZh` present for all 173 champions; narration instructed to answer in the UI language). A second suite, `python3 tools/test_aggregate.py` (16 checks), pins the aggregation semantics (dry-role ordering, Game-4-only pool-depth averaging, per-side split bucketing with a top-5 cap) against synthetic series.

## Data provenance

**Champions** — Riot **Data Dragon** 16.23.1 (`data/champions.json`: id, name, nameZh, tags, the `info` ratings {attack, defense, magic} carried verbatim, approximated pro roles from a curated position map; regenerate with `tools/build_champions.py`). Roles are approximations used for filtering and pool views. One consequence to know: picks are attributed to the champion's *primary* role, because the GRID starter data carries no per-player position to attribute them by — `meta/rosters.csv` and `meta/players.csv` have no position field, and feed player state carries name/team/side plus map coordinates only. A flex pick is therefore credited to the champion's primary role rather than the lane it was actually played in. `nameZh` comes from the same version's zh_CN snapshot — note that zh_CN swaps the en_US field meanings (its "title" is the personal name 阿狸， its "name" the epithet 九尾妖狐）, so `nameZh` is taken from the zh_CN "title" field; if the zh_CN fetch ever fails, the builder reports it and writes English names only rather than inventing translations.

**Match data — REAL, from GRID.** The official starter repository
([cloud9esports/stl-hackathon-2026-grid-starter](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter))
contains the full GRID event feeds for 745 LoL series (LCK, LEC, LTA North/South, LCS — 2025 and 2026 seasons), including `team-banned-character` / `team-picked-character` draft events. `tools/build_scouting_from_grid.py` streams those feeds for 12 selected pro teams (Cloud9 Kia, T1, Gen.G, Hanwha Life, KT, Dplus KIA, G2, Fnatic, Karmine Corp, Movistar KOI, GIANTX, Team Liquid), joins player names from `meta/rosters.csv`, and validates every game (exactly 10 picks + 10 bans, GRID's `session_valid` flag): **466 series, 1,041 games** survived validation (59 games dropped). The draft events also carry each team's side: all 1,041 kept games state both teams' sides consistently, and the validator drops any game whose sides cannot be resolved from the feed, so a side is never guessed — that is what makes the blue/red side splits (Methodology Q1) possible. Like everything else here, the splits are aggregates only: per-side game/win counts and top-5 count tables, never per-game records. Because a dropped game takes its picks with it, within-series Fearless counts can sit slightly below the theoretical values (5 of a team's own picks and 10 shared-pool champions per game): Team Liquid's Game-4 averages, for example, are 14.2 own picks removed / 28.3 shared-pool champions removed against a theoretical 15 / 30, because some of their series are missing a dropped game from the early picks.

**License handling — read this before reusing the data.** GRID's data license allows building with the data during the hackathon but **forbids redistribution**; the starter README draws the line explicitly: raw feeds and per-game extracts must not be committed, while *"code, charts, screenshots and aggregate results are fine to commit."* This project therefore ships **aggregates only**: `data/scouting.json` contains per-team tendency tables and counts (the same aggregates the charts show), never per-game records. To reproduce: clone the starter repo *next to* this project (never inside it — see `.gitignore`), then run `STL_DATA_DIR=/path/to/starter python3 tools/build_scouting_from_grid.py` (requires `pip install zstandard`). Aggregates were computed with `tools/aggregate.py`.

**Sample fallback.** If `data/scouting.json` is absent, the app loads `data/scouting.sample.json` — a clearly-labeled **sample** dataset (fictional teams, seeded simulation via `tools/generate_sample_data.py`, same schema). The UI badge and footer always state which dataset is loaded. Sample data is never presented as real.

## Methodology — the two judge questions

**Q1: What are the opponent's recurring pick/ban tendencies?**
From 1,041 real games we aggregate, per team: first-selection frequencies; bans received; per-role champion pools (games + win rate per champion); and per-champion contingency tables (games/wins with the champion, without it, and when it was banned against them). Every headline number is additionally split by side — blue/red games and win rate, plus each side's top-5 first picks and top-5 bans received — because a first pick is a side-dependent resource in pro play: the Side splits view shows the two columns side by side, and the AI brief surfaces the split only when it is material (a win-rate gap of ≥15 points with ≥10 games on each side, or a different #1 first pick per side with ≥5 first-picks each). Insight cards are generated by explicit rules over these tables (thresholds are constants in `js/scouting.js`), and every card prints its n. Examples the rules find in the real data: Karmine Corp won 100% of 8 Kalista games vs. 62% without her (+38 pts → *Ban Kalista*); opponents banned Pantheon against T1 in 16 games and T1 won 81% of them, above their 64% baseline (→ *Ban review: Pantheon* — the ban did not lower their win rate).

**Q2: How does the draft shift in Fearless Games 3/4/5?**
Within every series that reached Game 3+, we track by game number: what the team actually picked, how many of *their own* earlier picks were already fearless-banned (5 per game, cumulative — each team picks 5 champions per game), and the total shared-pool shrinkage (10 per game across both teams). The Fearless Shift view shows the migration (e.g., a team's Game-1 comfort picks disappear and Game-4/5 picks scatter into pocket picks), and the pool-exhaustion rule quantifies it: across T1's 5 series that reached Game 4+, an average of **3.6 of their top-5 comfort picks were already gone by Game 4**, with Jungle, Mid, Top and ADC running dry. No non-Fearless tool surfaces this, because in a normal draft the pool resets every game.

**Win-rate heuristic — formula and limitations.**
For each champion, the dataset gives games G and wins W. We shrink small samples toward 50% with a prior of m = 16 games: `WR' = (W + 8) / (G + 16)` — strong enough that a 5-game hot streak no longer outranks a proven 100-game champion. The draft bar and the Copilot use this one shared formula (`DraftCore.shrunkWinRate`). A side's draft score is `Σ (WR' − 0.50)` over its five picks; Blue's estimated win probability is the logistic `1 / (1 + e^(−6·(scoreBlue − scoreRed)))`, updated live as picks land. **Limitations, stated plainly:** it uses champion-level (not player- or matchup-level) win rates pooled across patches and opponents; it ignores team strength, side win-rate, draft order, and synergies/counters; bans are ignored. It is a conversation starter for the draft room, labeled "heuristic estimate" everywhere it appears — not a prediction model. **Future work (deliberately not in this build):** synergy and matchup modeling, patch-recency weighting, and a self-scouting profile of your own team's tendencies.

**Composition radar — attribute rubric and limitations.**
The radar scores each team's *current-game picks* on five 0–10 dimensions, from Data Dragon's own `info` ratings plus class tags (`js/comp.js`, where the rubric also lives as code comments). **Frontline** is `info.defense` verbatim. **Engage** and **Control** start from a tag baseline — Tank (7/7), Support (6/7), Fighter (5/4), Assassin (5/2), Mage (3/6), Marksman (2/3), taking the max across a champion's tags — and are then *raised* (never lowered) by a curated override list of champions whose hard engage or heavy CC is widely known but invisible to tags and ratings (Malphite, Ornn, Leona, Nautilus, Sejuani, Zac, Amumu, Rakan, Alistar, Kennen, Rell, Maokai, Ashe's arrow, and a matching control list). Those overrides are an **editorial rating by the author**, stated plainly: champions outside the lists are scored on tags + info alone. **Scaling** is `max(info.attack, info.magic)`, +1 for Marksman/Mage, capped at 10. Team aggregation counts what coaches count: Engage and Frontline are the mean of the team's *top two* scores (one engage tool is not a teamfight starter), Control and Scaling are means over all picks, and **Damage balance** is `(1 − |physShare − magicShare|) × 10` from the summed attack vs. magic ratings. Like the win-rate bar, this is a **heuristic estimate** for draft-room discussion — it models no synergies, matchups, or player proficiency — and it is labeled as such under the chart.

## Tooling

The app itself is deliberately dependency-free: hand-written HTML/CSS/JS (`js/draft.js` is a pure, DOM-free state machine — the same file the Node smoke tests exercise; `js/scouting.js` is pure analytics over the aggregate profiles; `js/app.js` is rendering only). Data tooling is Python 3 stdlib plus `zstandard` for reading GRID feeds.

**JetBrains tooling.** This repository is an **IntelliJ IDEA** project — its `.idea` project files are committed with the code. During the polish pass the project was opened in IntelliJ IDEA and its built-in code inspections (Project Default profile) were run over the composition/depletion analytics module, `js/comp.js`. The ES2015-migration inspection's quick-fix converted all 27 `var` declarations in that file to `let`/`const`, and the file was then reformatted with IDEA's formatter. The pass is behavior-neutral: the full Node smoke suite and the Python aggregate tests pass unchanged, and the pass is visible as its own commit in the repo history.

## Project structure

```
index.html            App shell (Draft Room + Scouting views)
css/style.css         Dark esports analytics theme (polished, bilingual-ready)
js/i18n.js            EN / 中文 dictionary + locale state (pure logic)
js/draft.js           Fearless draft state machine (pure logic, tested)
js/comp.js            Composition radar rubric + pool depletion (pure logic, tested)
js/scouting.js        Tendency analytics + insight rules (pure logic)
js/brief.js           AI Brief Generator — structured pre-match briefs (pure logic)
js/copilot.js         AI Draft Copilot — perceive → reason → recommend (pure logic)
js/llm.js             Optional BYOK narration layer (user's own endpoint + key)
js/app.js             Rendering / event wiring
data/champions.json   Data Dragon 16.23.1 snapshot (173 champions, EN + 中文 names)
data/scouting.json    REAL GRID-derived aggregates (12 teams, 1,041 games)
data/scouting.sample.json  Labeled SAMPLE fallback (fictional, seeded)
data/demo_series.json Scripted Fearless-legal BO5 for one-click demos
tools/build_champions.py        Regenerate champions.json from Data Dragon
tools/build_scouting_from_grid.py  GRID feeds -> aggregates (needs starter repo)
tools/generate_sample_data.py   Seeded sample-data generator
tools/aggregate.py              Shared aggregation used by both builders
tools/test_aggregate.py         Aggregation unit tests (synthetic series)
tools/smoke_test.js             State-machine + data smoke tests
docs/submission.md              Devpost submission copy
docs/video-script.md            ≤3-minute demo video script
```

## License

Project code and documentation: MIT (see `LICENSE`, © YYB1219). Champion data © Riot Games via Data Dragon; GRID-derived aggregates are computed from the GRID starter dataset under its hackathon license terms described above.
