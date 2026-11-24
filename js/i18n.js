/*
 * i18n.js — bilingual UI layer (English / 简体中文） for Fearless Draft Room.
 *
 * A tiny dictionary + lookup, shared by the browser app and the pure
 * logic modules (brief.js, copilot.js, scouting.js, draft.js, llm.js),
 * which resolve I18n lazily from the global scope at call time — the
 * same pattern copilot.js uses for DraftCore / Scouting.
 *
 *   I18n.t(key, params)  — translated string; {name} placeholders in the
 *                          template are replaced from params. A key
 *                          missing in the active locale falls back to
 *                          the English string; a key missing everywhere
 *                          returns the key itself (the smoke tests scan
 *                          every t('...') call site and every data-i18n
 *                          attribute and assert full coverage, so a
 *                          missing key fails CI rather than shipping).
 *   I18n.role(roleKey)   — localized role name ("Top" -> 上单）.
 *   I18n.getLocale() / I18n.setLocale('en'|'zh')
 *                        — locale persists in localStorage key
 *                          `fdr.lang`; DEFAULT is 'en' (the judging
 *                          panel is international; the author toggles
 *                          to 中文）.
 *
 * Numbers and data are never translated — only UI chrome and the
 * template sentences the generators build around the numbers.
 *
 * Environment-agnostic: module.exports under Node, window.I18n in
 * browsers.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "fdr.lang";

  var DICT = {
    en: {
      /* ---- app chrome / header / footer ---- */
      "app.title": "Fearless Draft Room — Cloud9 × JetBrains, Category 2",
      "app.tagline": "Macro Scouting & Draft Management for Fearless Draft series — Cloud9 × JetBrains Hackathon, Category 2 (LoL)",
      "app.loading": "loading data…",
      "app.loadError": "Failed to load data: {msg} — serve this folder over HTTP (see README).",
      "nav.aiSettings": "⚙ AI settings (BYOK)",
      "nav.demo": "▶ Load demo series (BO5)",
      "nav.draftTab": "Draft Room",
      "nav.scoutingTab": "Scouting & Tendencies",
      "badge.grid": "Match data: GRID (official hackathon dataset)",
      "badge.sample": "Match data: SAMPLE — demonstration only",
      "footer.gridData": "Scouting data derived from the official GRID starter dataset for the Cloud9 × JetBrains Hackathon (aggregates only; raw GRID feeds are license-restricted and are not redistributed with this project).",
      "footer.sampleData": "The bundled scouting dataset is a clearly-labeled SAMPLE generated for demonstration (see tools/generate_sample_data.py). It is not real match data. The app is built to load GRID-derived aggregates in the same schema via tools/build_scouting_from_grid.py.",
      "footer.built": "Built for the Cloud9 × JetBrains \"Sky's The Limit\" Hackathon 2026 · Category 2 · Champion data © Riot Games via Data Dragon.",

      /* ---- roles / phases / common ---- */
      "role.All": "All",
      "role.Top": "Top",
      "role.Jungle": "Jungle",
      "role.Mid": "Mid",
      "role.ADC": "ADC",
      "role.Support": "Support",
      "phase.ban1": "Ban Phase 1",
      "phase.pick1": "Pick Phase 1",
      "phase.ban2": "Ban Phase 2",
      "phase.pick2": "Pick Phase 2",
      "phase.draftComplete": "Draft complete",
      "phase.complete": "Game {game} draft complete — mark the winner, then advance.",
      "phase.turn": "{phase} — {team} to {verb} {kind}",
      "kind.pick": "PICK",
      "kind.ban": "BAN",
      "kind.watch": "WATCH",
      "common.banVerb": "ban",
      "common.pickVerb": "pick",
      "common.pts": "{v} pts",
      "common.andJoin": " and ",
      "common.period": ".",

      /* ---- BYOK settings panel ---- */
      "settings.title": "AI narration settings — bring your own key (optional)",
      "settings.close": "Close",
      "settings.note": "The Brief Generator and Draft Copilot run <b>fully locally</b> and need no key. This optional layer only re-narrates their structured facts with a model you choose. <b>Your API key is stored only in this browser's localStorage and is sent only to the endpoint below — no key is bundled with this app.</b>",
      "settings.preset": "Provider preset",
      "settings.baseUrl": "Endpoint base URL",
      "settings.baseUrlPh": "https://…/v1",
      "settings.model": "Model",
      "settings.modelPh": "model name",
      "settings.apiKey": "API key",
      "settings.apiKeyPh": "paste your own key — never shared",
      "settings.save": "Save settings",
      "settings.clear": "Clear",
      "llm.preset.bailian": "Aliyun Bailian (DeepSeek)",
      "llm.preset.openai": "OpenAI",
      "llm.preset.openrouter": "OpenRouter",
      "llm.preset.gemini": "Google Gemini",
      "llm.preset.custom": "Custom OpenAI-compatible endpoint",
      "llm.statusSaved": "Saved: {preset} · {model} · {url}",
      "llm.statusNone": "Not configured — the brief and copilot still work fully, offline.",
      "llm.hintOn": "Sends only the structured facts above to your configured model.",
      "llm.hintOff": "Configure your own model in ⚙ AI settings (BYOK) to enable narration.",
      "llm.narrateBtn": "✨ AI narration (my model)",
      "llm.asking": "Asking your model…",
      "llm.failed": "AI narration failed: {msg}",
      "llm.errNoConfig": "No LLM configured — open AI settings and save your own endpoint + API key first.",
      "llm.errNoFetch": "fetch is not available in this environment.",
      "llm.errHttp": "LLM request failed: HTTP {status}",
      "llm.errEmpty": "LLM response contained no narrative.",
      "llm.errBadUrl": "Endpoint must use https:// (http:// is only allowed for localhost / 127.0.0.1).",
      "llm.errTimeout": "LLM request timed out after 30 seconds.",
      "toast.settingsSaved": "AI settings saved (this browser only).",
      "toast.settingsIncomplete": "Saved, but endpoint, model and key are all required to enable narration.",
      "toast.settingsCleared": "AI settings cleared from this browser.",
      "toast.briefCopied": "Brief copied.",

      /* ---- draft room setup / board ---- */
      "setup.format": "Format",
      "setup.blue": "Blue team",
      "setup.red": "Red team",
      "setup.patch": "Patch",
      "setup.patchPh": "e.g. 16.23",
      "setup.newSeries": "New series",
      "draft.bans": "Bans",
      "draft.picks": "Picks",
      "draft.wonBtn": "Mark game won",
      "draft.wonDone": "✓ Won this game",
      "draft.scoreLine": "{blue}  {bw} – {rw}  {red}  ·  Game {game} of {format}",
      "draft.undo": "↩ Undo",
      "draft.resetGame": "Reset game",
      "draft.nextGame": "Next game →",
      "draft.swapSides": "Swap sides ⇄",
      "draft.resetSeries": "Reset series",
      "slot.banEmpty": "— ban —",
      "slot.pickEmpty": "— pick —",
      "pool.banner": "Game <b>{game}</b>: <b>{count}</b> champions fearless-banned from earlier games · pool at <b>{pct}%</b> ({avail}/{total} available)",
      "wr.label": "Draft win-rate impact <em>(heuristic estimate)</em>",
      "wr.title": "Heuristic estimate — see README for the formula and its limits",
      "grid.searchPh": "Search champions…",
      "grid.noMatch": "No champions match.",
      "summary.title": "Series summary & export",
      "summary.copy": "Copy draft history",
      "summary.game": "Game {game}",
      "summary.wonSuffix": " — {team} won",
      "summary.picksLabel": "picks",
      "summary.bansLine": "Bans: {list}",
      "summary.fearlessAfter": "Fearless-banned after this game ({count}): {list}",
      "demo.step": "Demo step →",
      "demo.autoplay": "▶ Auto-play demo",
      "demo.pause": "⏸ Pause demo",
      "demo.noData": "Demo data failed to load.",
      "demo.stopped": "Demo stopped: {msg}",
      "demo.preloadNotice": "Demo BO5 preloaded at Game 3 — 20 champions are fearless-banned. Use Reset for a fresh draft.",
      "demo.dismiss": "Dismiss",
      "alert.seriesComplete": "Series is complete (or the format has no more games).",

      /* ---- copilot panel chrome ---- */
      "copilot.title": "AI Draft Copilot",
      "copilot.titleHint": "(data-driven, runs locally — perceive the draft state → reason over the evidence → recommend; the coach decides)",
      "copilot.opponent": "Opponent",
      "copilot.weAre": "We are",
      "copilot.blueSide": "Blue side",
      "copilot.redSide": "Red side",
      "copilot.noneOpp": "None — dataset-wide",
      "copilot.standby": "Copilot standing by…",
      "copilot.complete": "Draft complete — no further recommendations.",

      /* ---- composition radar + pool depletion (draft view) ---- */
      "comp.title": "Composition radar",
      "comp.empty": "No picks yet — the radar fills in as champions are locked in.",
      "comp.note": "Heuristic estimate: Data Dragon info ratings + tag baselines + editorial engage/CC overrides — rubric and limits in README.",
      "comp.dim.engage": "Engage",
      "comp.dim.frontline": "Frontline",
      "comp.dim.control": "Control",
      "comp.dim.scaling": "Scaling",
      "comp.dim.balance": "Damage mix",
      "depl.title": "Opponent pool depletion",
      "depl.titleHint": "(the copilot opponent's top-5 comfort picks per role, vs. this series)",
      "depl.noOpponent": "Choose an opponent in the AI Draft Copilot panel to watch their comfort pools deplete as this series consumes champions.",
      "depl.left": "{left}/{total} left",
      "depl.dry": "⚠ nearly dry",

      /* ---- copilot generated text ---- */
      "copilot.gameLabel": "Game {game}",
      "copilot.poolPart": "Pool at {pct}% ({count} fearless-banned)",
      "copilot.turnOurs": "Your {team} to {action}.",
      "copilot.turnTheirs": "{team} to {action}.",
      "copilot.heuristic": "Heuristic: {blue} {bp}% – {rp}% {red} (estimate).",
      "copilot.theOpponent": "the opponent",
      "reason.deny": "Denies {opp}: they won {wr} on {champ} (n={n})",
      "reason.suffixRole": ", and it fills an open role for us.",
      "reason.fillRole": "Fills our open {role} slot; dataset WR {wr} (n={games}).",
      "reason.highestRole": "Highest-rated available {role}: WR {wr} (n={games}).",
      "reason.highest": "Highest-rated available: WR {wr} (n={games}).",
      "reason.noSample": "No dataset sample on {champ} yet — rated on role fit only.",
      "reason.removeComfort": "Remove the comfort: {opp} won {wrWith} with {champ} vs. {wrWithout} without (n={n}).",
      "reason.firstPickPriority": "Their first-pick priority: {count} first picks (n={games}) — deny the opener.",
      "reason.strongestOpen": "Strongest open champion in the dataset: WR {wr} (n={games}) — don't hand it over.",
      "reason.watchComfort": "Watch: {opp} may take {champ} — their comfort pick at WR {wr} (n={picks}). Have the counter or the trade ready.",
      "reason.watchStrongest": "Watch: {champ} is the strongest open champion by dataset WR ({wr}, n={games}) — expect it to be contested.",
      "reason.protectRole": "Protect: {champ} is our best remaining {role} option (WR {wr}, n={games}) — expect {opp} to consider banning it; keep a backup ready.",
      "reason.protect": "Protect: {champ} is our best remaining option (WR {wr}, n={games}) — expect {opp} to consider banning it; keep a backup ready.",
      "warn.none": "none",
      "warn.pinch": "⚠ {opp}'s {role} comfort pool is nearly dry: only {left} of their top-5 {role} picks remain ({names}) — one more targeted ban closes the role (pool sample n={n} games).",
      "warn.metaDry": "⚠ Meta {role} pool nearly dry: only {left} champions with {min}+ dataset games remain available in this role — draft depth decides this game.",
      "sum.title": "DRAFT STATE — {blue} vs. {red} ({format}), series score {bw}–{rw}.",
      "sum.mode": "Mode: {mode}.",
      "sum.recs": "Copilot recommendations:",
      "sum.recLine": "  {rank}. [{kind}] {champ} — {reason}",
      "sum.warning": "Warning: {text}",

      /* ---- scouting view chrome ---- */
      "scout.opponent": "Opponent",
      "scout.meta": "{team} — {games} games in dataset · {wins} wins ({pct}) · {label}",
      "scout.firstPicks": "Most frequent first selections",
      "scout.bannedAgainst": "Most banned against them",
      "scout.poolsTitle": "Champion pools by role",
      "scout.poolsHint": "(top 5 per role · games · win rate)",
      "scout.shiftTitle": "Fearless shift — how their draft changes as the series goes long",
      "scout.howtoTitle": "How to Win — rule-generated insights",
      "scout.howtoHint": "(every card shows its sample size)",
      "scout.fpExtra": "({share} of {n} games)",
      "scout.baExtra": "(in {share} of games vs them)",
      "scout.colChampion": "Champion",
      "scout.colGames": "Games",
      "scout.colWR": "WR",
      "scout.distinct": "{count} distinct",
      "scout.shiftColGame": "Game",
      "scout.shiftColTop": "Their top picks in that game number",
      "scout.shiftColOwn": "Their own picks already fearless-banned (avg)",
      "scout.shiftColShared": "Shared pool removed (avg)",
      "scout.shiftUnit": "{count} champions",
      "scout.shiftNote": "Based on {n} series that reached Game 3. By Game 5 the shared pool has lost up to 40 champions — every pick from Games 1–4 is gone for both teams.",
      "scout.noShift": "No series of 3+ games for this team in the dataset.",
      "scout.sampleN": "sample: n={n}",
      "scout.noInsights": "No insight rules fired for this team at the current thresholds.",
      "scout.sidesTitle": "Side splits — blue side vs. red side",
      "scout.sidesHint": "(per side: games · win rate · top first picks · top bans against)",
      "scout.blueSide": "Blue side",
      "scout.redSide": "Red side",
      "scout.sideRecord": "{games} games · {wins} wins ({wr})",
      "scout.sideFirstPicks": "Top first picks",
      "scout.sideBannedAgainst": "Top bans against",
      "scout.noSides": "No side-split data for this team in the dataset.",

      /* ---- brief panel (rendered in app.js) ---- */
      "brief.title": "AI Brief — pre-match brief",
      "brief.titleHint": "(generated locally from the aggregates above; every number carries its n)",
      "brief.copy": "Copy brief",
      "brief.noProfile": "No profile available for this team.",
      "brief.sec1": "1 · Overall tendencies",
      "brief.sec2": "2 · Top 3 ban targets",
      "brief.sec3": "3 · First-pick priority",
      "brief.sec4": "4 · Fearless late-series risk",
      "brief.sec5": "5 · Series plan (G1–G5)",
      "brief.sec1Body": "{team}: {games} games, {wins} wins ({wr}). Top first picks: {fp}. Most banned against them: {ba}.",
      "brief.listItem": "{champ} ×{count} ({share})",
      "brief.banTargetLine": "{champ} — won {wrWith} in {picked} picks vs. {wrWithout} without ({diff})",
      "brief.sec3Priority": "{champ} — first-picked {count}/{n} games ({share}), {ratio}× the dataset-wide rate. Deny it or pre-draft the counter.",
      "brief.sec3None": "No champion clears the 2× dataset-rate bar; most common opener: {opener}.",
      "brief.sec3Opener": "{champ} ({count}/{n})",
      "brief.exhaustion": "Pool exhaustion: by Game 4 an average of {avg} of their top-5 comfort picks ({top5}) are already fearless-banned",
      "brief.longSeriesN": "n={n} long series",
      "brief.dryRoles": "Dry roles first: {roles}.",
      "brief.g3Line": "By Game 3 they have lost an average of {removed} of their own picks; the shared pool is down {pool} champions",
      "brief.seriesN": "n={n} series",
      "brief.concentrated": "Concentrated {role} pool: {c1} + {c2} cover {share} of its games",
      "brief.sideWrLine": "Side split: {wrB} win rate on blue ({gamesB} games) vs. {wrR} on red ({gamesR} games) — a {gap}-point gap.",
      "brief.sideFpClause": " Their #1 first pick flips by side too: {champB} on blue, {champR} on red.",
      "brief.sideFpLine": "Side split: their #1 first pick flips by side — {champB} on blue ({countB} of {gamesB}) vs. {champR} on red ({countR} of {gamesR}).",

      /* ---- brief plain text + series plan (brief.js) ---- */
      "brief.textTitle": "PRE-MATCH BRIEF — vs. {team} ({tag})",
      "brief.textDataset": "Dataset: {games} games, {wins} wins ({wr}). Generated locally from aggregate data; every number below carries its sample size.",
      "brief.textSec1": "1) OVERALL TENDENCIES",
      "brief.textFpLine": "   Top first picks: {list}",
      "brief.textBaLine": "   Most banned against them: {list}",
      "brief.fpItem": "{champ} ×{count} ({share} of {n})",
      "brief.baItem": "{champ} ×{count} ({share} of games)",
      "brief.textSec2": "2) TOP 3 BAN TARGETS",
      "brief.textBanLine": "   {rank}. {champ} — picked {picked}×, won {wrWith} with it vs. {wrWithout} without ({diff})",
      "brief.textSec3": "3) FIRST-PICK PRIORITY",
      "brief.textPriority": "   {champ}: first-picked {count}/{n} games ({share}) — {ratio}× the dataset-wide rate ({global}). Deny or pre-draft the counter.",
      "brief.textNoPriority": "   No champion clears the 2× dataset-rate priority bar; their most common opener is {opener}.",
      "brief.textSec4": "4) FEARLESS LATE-SERIES RISK",
      "brief.textExhaustion": "   Pool exhaustion: by Game 4, an average of {avg} of their top-5 comfort picks ({top5}) are fearless-banned (n={n} long series). Dry roles first: {roles}.",
      "brief.textG3": "   By Game 3 they have lost an average of {removed} of their own picks; shared pool down {pool} (n={n} series).",
      "brief.textConcentrated": "   Concentrated {role} pool: {c1} + {c2} = {share} of {total} games.",
      "brief.textSideWrLine": "   Side split: blue-side win rate {wrB} ({gamesB} games) vs. red-side {wrR} ({gamesR} games) — a {gap}-point gap.",
      "brief.textSideFpClause": " Their #1 first pick flips by side too: {champB} on blue, {champR} on red.",
      "brief.textSideFpLine": "   Side split: their #1 first pick flips by side — {champB} on blue ({countB} of {gamesB} blue games) vs. {champR} on red ({countR} of {gamesR} red games).",
      "brief.textSec5": "5) SERIES PLAN (G1–G5)",
      "plan.g1Title": "Game 1 — hit the comfort picks",
      "plan.g2Title": "Game 2 — same plan, one tier down",
      "plan.g3Title": "Game 3 — draft against the migrated pool",
      "plan.g4Title": "Game 4 — attack the dry roles",
      "plan.g5Title": "Game 5 — depth wins the decider",
      "plan.g1Ban": "Open the ban phase on {champ}: {team} won {wrWith} in {picked} picks with it vs. {wrWithout} without ({diff}).",
      "plan.g1Deny": "Deny the first-pick priority {champ} (first-picked {count}/{n} games, {ratio}× the dataset rate) — ban it or take it away.",
      "plan.g1Opener": "Their most common opener is {champ} ({count}/{n} first picks) — have the counter or the trade prepared.",
      "plan.g1Full": "Full {total}-champion pool: this is the only game where their whole comfort pool is available, so spend bans on evidence, not habits.",
      "plan.g1FullBare": "Full champion pool: this is the only game where their whole comfort pool is available, so spend bans on evidence, not habits.",
      "plan.g2Gone": "10 champions are fearless-banned now. Their most-picked Game-1 champions across {series} series ({gone}) are exactly the ones that disappear first.",
      "plan.g2Promote": "Promote ban target #2, {champ} ({diff} differential, n={n}), if it survived Game 1 unpicked.",
      "plan.g2Slide": "Expect their draft to slide one tier down the same roles — keep the Game-1 ban plan, re-ranked, rather than reinventing it.",
      "plan.g3Shift": "Measured shift: entering Game 3 they have already lost an average of {removed} of their own earlier picks, and the shared pool is down {pool} champions (across {series} series).",
      "plan.g3Migrate": "Their Game-3 drafts migrate toward: {list}. Pre-draft answers for those, not for their Game-1 selves.",
      "plan.g3Pinch": "Start pinching the {role} pool: {c1} + {c2} cover {share} of its {total} games — phase-2 bans bite now.",
      "plan.g3None": "No Game-3 series sample for this team in the dataset — plan from the ban targets and role depth above.",
      "plan.g4Exhaust": "In {series} series that reached Game 4+, an average of {avg} of their top-5 comfort picks ({top5}) were already fearless-banned by Game 4 (n={n} series).",
      "plan.g4Dry": "Roles that run dry first for them: {roles} — aim the second ban phase there and force off-comfort picks.",
      "plan.g4Thin": "Thinnest pools by distinct champions played: {list}.",
      "plan.thinItem": "{role} ({distinct} distinct)",
      "plan.g4None": "No Game-4+ series sample for this team in the dataset — keep pressure on the shallowest role pools from section 4.",
      "plan.g5Gone": "40 champions are fearless-banned before this draft starts{extra}.",
      "plan.g5Extra": " (their series history shows an average shared-pool loss of {pool} champions by Game 5)",
      "plan.g5Pocket": "Have two pocket picks rehearsed in {roles} — those roles decide Game 5 for both teams.",
      "plan.g5Target": "If {champ} is somehow still available ({diff}, n={n}), it is the highest-value remaining ban or takeaway.",
      "plan.g5Comfort": "Draft for comfort over meta: with the pool at ~77%, the team that prepared deeper pools wins this game in the draft room.",

      /* ---- insight cards (scouting.js) ---- */
      "insight.banTitle": "Ban {champ}",
      "insight.banBody": "{team} picked {champ} in {picked}/{n} games ({rate}) and won {wrWith} of those. Without it: {wrWithout} over {unpicked} games — {diff} points lower.",
      "insight.fpTitle": "First-pick priority: {champ}",
      "insight.fpBody": "{team} first-picked {champ} in {count}/{n} games ({share}) — {ratio}× the dataset-wide rate ({global}). Deny it with a first-phase ban, or pre-draft its counter.",
      "insight.wastedTitle": "Ban review: {champ}",
      "insight.wastedBody": "Opponents banned {champ} against {team} in {bans} games, and {team} still won {wins}/{bans} of them ({wr}) — above their {baseline} baseline, so this ban did not lower their win rate. Consider reviewing its priority and spending the ban elsewhere.",
      "insight.pinchTitle": "Pinch the {role} pool",
      "insight.pinchBodyPlayer": "{player} ({team} {role}) leans on {c1} and {c2} for {share} of the role's {total} games. Two targeted bans (or one ban plus a takeaway pick) force them deep into the pool.",
      "insight.pinchBody": "{team} {role} leans on {c1} and {c2} for {share} of the role's {total} games. Two targeted bans (or one ban plus a takeaway pick) force them deep into the pool.",
      "insight.fearlessTitle": "Fearless thins them out by Game 3",
      "insight.fearlessBody": "Across {series} series that reached Game 3, {team} entered Game 3 with an average of {removed} of their own earlier picks fearless-banned, and the shared pool was already down {pool} champions. Drag the series long and their draft gets predictable.",
      "insight.exhaustTitle": "⚠ Pool exhaustion warning — Game 4/5",
      "insight.exhaustMain": "In {series} series that reached Game 4+, an average of {avg} of {team}'s top-5 comfort picks ({top5}) were already fearless-banned by Game 4.",
      "insight.exhaustDry": " Roles that run dry first: {roles} — prepare deep-pool pocket picks there, or close the series early.",
      "insight.exhaustNoDry": " If the series goes long, expect them on off-comfort picks.",

      /* ---- draft export + state-machine errors (draft.js) ---- */
      "export.header": "=== {blue} vs {red} — {format}{patchPart} ===",
      "export.patchPart": " — Patch {patch}",
      "export.score": "Series score: {blue} {bw} – {rw} {red}",
      "export.game": "Game {game}",
      "export.winnerSuffix": " — winner: {team}",
      "export.bans": "  {team} bans:  {list}",
      "export.picks": "  {team} picks: {list}",
      "export.fearless": "  Fearless-banned after Game {game} (cumulative): {list}",
      "err.complete": "Draft is already complete for this game.",
      "err.fearless": "{champ} was picked earlier in this series (Fearless Draft).",
      "err.used": "{champ} is already picked or banned in this game.",
      "err.invalid": "Invalid champion selection.",
      "err.swapLocked": "Sides can only be swapped before this game's first ban or pick."
    },

    zh: {
      /* ---- 应用外壳 / 页眉 / 页脚 ---- */
      "app.title": "无畏征召 BP 室 — Cloud9 × JetBrains，Category 2",
      "app.tagline": "为无畏征召系列赛打造的宏观侦察与 BP 管理——Cloud9 × JetBrains 黑客松，Category 2（英雄联盟）",
      "app.loading": "正在加载数据…",
      "app.loadError": "数据加载失败：{msg}——请通过 HTTP 服务打开此文件夹（见 README）。",
      "nav.aiSettings": "⚙ AI 设置 (BYOK)",
      "nav.demo": "▶ 加载演示系列赛 (BO5)",
      "nav.draftTab": "BP 室",
      "nav.scoutingTab": "侦察与倾向",
      "badge.grid": "比赛数据：GRID（黑客松官方数据集）",
      "badge.sample": "比赛数据：样本——仅供演示",
      "footer.gridData": "侦察数据来自 Cloud9 × JetBrains 黑客松官方 GRID 起始数据集（仅聚合结果；GRID 原始数据受许可限制，不随本项目分发）。",
      "footer.sampleData": "内置的侦察数据集是明确标注的样本数据，由脚本生成、仅供演示（见 tools/generate_sample_data.py），不是真实比赛数据。本应用可通过 tools/build_scouting_from_grid.py 加载同结构的 GRID 聚合数据。",
      "footer.built": "为 Cloud9 × JetBrains「Sky's The Limit」黑客松 2026 而作 · Category 2 · 英雄数据 © Riot Games（Data Dragon）。",

      /* ---- 位置 / 阶段 / 通用 ---- */
      "role.All": "全部",
      "role.Top": "上单",
      "role.Jungle": "打野",
      "role.Mid": "中单",
      "role.ADC": "ADC",
      "role.Support": "辅助",
      "phase.ban1": "禁用阶段 1",
      "phase.pick1": "选用阶段 1",
      "phase.ban2": "禁用阶段 2",
      "phase.pick2": "选用阶段 2",
      "phase.draftComplete": "BP 已完成",
      "phase.complete": "第 {game} 局 BP 已完成——标记胜者后进入下一局。",
      "phase.turn": "{phase} —— {team} {kind}",
      "kind.pick": "选用",
      "kind.ban": "禁用",
      "kind.watch": "警戒",
      "common.banVerb": "禁用",
      "common.pickVerb": "选用",
      "common.pts": "{v} 个百分点",
      "common.andJoin": " 和 ",
      "common.period": "。",

      /* ---- BYOK 设置面板 ---- */
      "settings.title": "AI 解读设置——自备密钥（可选）",
      "settings.close": "关闭",
      "settings.note": "简报生成器和 Draft Copilot 完全在<b>本地运行</b>，不需要密钥。这个可选层只是把它们的结构化事实用你选择的模型复述一遍。<b>你的 API 密钥只保存在本浏览器的 localStorage 中，只会发送到下面填写的端点——本应用不内置任何密钥。</b>",
      "settings.preset": "服务商预设",
      "settings.baseUrl": "端点基础 URL",
      "settings.baseUrlPh": "https://…/v1",
      "settings.model": "模型",
      "settings.modelPh": "模型名称",
      "settings.apiKey": "API 密钥",
      "settings.apiKeyPh": "粘贴你自己的密钥——不会外传",
      "settings.save": "保存设置",
      "settings.clear": "清除",
      "llm.preset.bailian": "阿里云百炼（DeepSeek）",
      "llm.preset.openai": "OpenAI",
      "llm.preset.openrouter": "OpenRouter",
      "llm.preset.gemini": "Google Gemini",
      "llm.preset.custom": "自定义 OpenAI 兼容接口",
      "llm.statusSaved": "已保存：{preset} · {model} · {url}",
      "llm.statusNone": "未配置——简报和副驾仍可完全离线工作。",
      "llm.hintOn": "只会把上方结构化事实发送给你配置的模型。",
      "llm.hintOff": "在 ⚙ AI 设置 (BYOK) 里配置你自己的模型后即可启用解读。",
      "llm.narrateBtn": "✨ AI 解读（我的模型）",
      "llm.asking": "正在询问你的模型…",
      "llm.failed": "AI 解读失败：{msg}",
      "llm.errNoConfig": "尚未配置 LLM——先打开 AI 设置，保存你自己的端点 + API 密钥。",
      "llm.errNoFetch": "当前环境不支持 fetch。",
      "llm.errHttp": "LLM 请求失败：HTTP {status}",
      "llm.errEmpty": "LLM 响应里没有解读内容。",
      "llm.errBadUrl": "端点必须使用 https://（http:// 仅允许 localhost / 127.0.0.1）。",
      "llm.errTimeout": "LLM 请求超时（30 秒）。",
      "toast.settingsSaved": "AI 设置已保存（仅本浏览器）。",
      "toast.settingsIncomplete": "已保存，但端点、模型和密钥都填齐才能启用解读。",
      "toast.settingsCleared": "AI 设置已从本浏览器清除。",
      "toast.briefCopied": "简报已复制。",

      /* ---- BP 室设置 / 面板 ---- */
      "setup.format": "赛制",
      "setup.blue": "蓝方队伍",
      "setup.red": "红方队伍",
      "setup.patch": "版本",
      "setup.patchPh": "如 16.23",
      "setup.newSeries": "新建系列赛",
      "draft.bans": "禁用",
      "draft.picks": "选用",
      "draft.wonBtn": "标记本局获胜",
      "draft.wonDone": "✓ 本局已获胜",
      "draft.scoreLine": "{blue}  {bw} – {rw}  {red}  ·  第 {game} 局 / {format}",
      "draft.undo": "↩ 撤销",
      "draft.resetGame": "重置本局",
      "draft.nextGame": "下一局 →",
      "draft.swapSides": "换边 ⇄",
      "draft.resetSeries": "重置系列赛",
      "slot.banEmpty": "— 禁用 —",
      "slot.pickEmpty": "— 选用 —",
      "pool.banner": "第 <b>{game}</b> 局：已有 <b>{count}</b> 个英雄被无畏征召禁用 · 英雄池剩余 <b>{pct}%</b>（{avail}/{total} 可用）",
      "wr.label": "BP 胜率影响 <em>（启发式估算）</em>",
      "wr.title": "启发式估算——公式与局限见 README",
      "grid.searchPh": "搜索英雄…",
      "grid.noMatch": "没有符合的英雄。",
      "summary.title": "系列赛总结与导出",
      "summary.copy": "复制 BP 记录",
      "summary.game": "第 {game} 局",
      "summary.wonSuffix": " —— {team} 获胜",
      "summary.picksLabel": "选用",
      "summary.bansLine": "禁用：{list}",
      "summary.fearlessAfter": "本局后无畏禁用（{count}）：{list}",
      "demo.step": "演示下一步 →",
      "demo.autoplay": "▶ 自动播放演示",
      "demo.pause": "⏸ 暂停演示",
      "demo.noData": "演示数据加载失败。",
      "demo.stopped": "演示已停止：{msg}",
      "demo.preloadNotice": "已预载演示 BO5 第 3 局——20 个英雄已被无畏征召禁用。点「重置系列赛」可从头开始。",
      "demo.dismiss": "关闭",
      "alert.seriesComplete": "系列赛已结束（或该赛制没有更多对局）。",

      /* ---- 副驾面板外壳 ---- */
      "copilot.title": "AI Draft Copilot（实时副驾）",
      "copilot.titleHint": "（数据驱动，本地运行——感知 BP 状态 → 基于证据推理 → 给出推荐；最终由教练决定）",
      "copilot.opponent": "对手",
      "copilot.weAre": "我方是",
      "copilot.blueSide": "蓝方",
      "copilot.redSide": "红方",
      "copilot.noneOpp": "无——全数据集",
      "copilot.standby": "副驾待命中…",
      "copilot.complete": "BP 已完成——没有更多推荐。",

      /* ---- 阵容雷达 + 英雄池枯竭（BP 视图） ---- */
      "comp.title": "阵容雷达",
      "comp.empty": "尚未选用英雄——锁定英雄后雷达会逐步成形。",
      "comp.note": "启发式估算：Data Dragon info 评分 + 职业标签基线 + 开团/控制编辑修正——规则与局限见 README。",
      "comp.dim.engage": "开团",
      "comp.dim.frontline": "坦度",
      "comp.dim.control": "控制",
      "comp.dim.scaling": "发育",
      "comp.dim.balance": "伤害均衡",
      "depl.title": "对手英雄池枯竭",
      "depl.titleHint": "（副驾所选对手每个位置的前 5 绝活，对照本系列赛）",
      "depl.noOpponent": "在 AI Draft Copilot 面板里选择对手，即可看到他们的绝活池如何随本系列赛的进行而枯竭。",
      "depl.left": "剩 {left}/{total}",
      "depl.dry": "⚠ 接近枯竭",

      /* ---- 副驾生成文本 ---- */
      "copilot.gameLabel": "第 {game} 局",
      "copilot.poolPart": "英雄池剩余 {pct}%（已无畏禁用 {count} 个）",
      "copilot.turnOurs": "我方 {team} 进行{action}。",
      "copilot.turnTheirs": "{team} 进行{action}。",
      "copilot.heuristic": "启发式估算：{blue} {bp}% – {rp}% {red}。",
      "copilot.theOpponent": "对手",
      "reason.deny": "以抢代禁：抢下 {champ}，不让 {opp} 拿到——他们用它的胜率是 {wr}（n={n}）",
      "reason.suffixRole": "，且能补上我方空缺位置。",
      "reason.fillRole": "补上我方空缺的{role}位置；数据集 WR {wr}（n={games}）。",
      "reason.highestRole": "当前可选的最高评分{role}：WR {wr}（n={games}）。",
      "reason.highest": "当前可选的最高评分英雄：WR {wr}（n={games}）。",
      "reason.noSample": "数据集里还没有 {champ} 的样本——仅按位置适配评分。",
      "reason.removeComfort": "拆掉绝活：{opp} 用 {champ} 胜率 {wrWith}，不用时 {wrWithout}（n={n}）。",
      "reason.firstPickPriority": "他们的一抢优先级：一抢了 {count} 次（n={games}）——别让他们拿到开局。",
      "reason.strongestOpen": "数据集中当前最强的可选英雄：WR {wr}（n={games}）——别放给对方。",
      "reason.watchComfort": "注意：{opp} 可能选 {champ}——他们的绝活，胜率 {wr}（n={picks}）。准备好克制或交换方案。",
      "reason.watchStrongest": "注意：{champ} 是按数据集 WR 当前最强的可选英雄（{wr}，n={games}）——预计会被争抢。",
      "reason.protectRole": "保护：{champ} 是我方剩余最好的{role}选择（WR {wr}，n={games}）——预计 {opp} 会考虑禁用它；准备好备选。",
      "reason.protect": "保护：{champ} 是我方剩余最好的选择（WR {wr}，n={games}）——预计 {opp} 会考虑禁用它；准备好备选。",
      "warn.none": "无",
      "warn.pinch": "⚠ {opp} 的{role}绝活池接近枯竭：他们前 5 的{role}英雄只剩 {left} 个（{names}）——再来一个针对性禁用就能封死这个位置（英雄池样本 n={n} 局）。",
      "warn.metaDry": "⚠ {role}的版本英雄池接近枯竭：该位置只剩 {left} 个数据集场次 ≥{min} 的可选英雄——这局拼的是英雄池深度。",
      "sum.title": "对局状态 —— {blue} vs {red}（{format}），系列赛比分 {bw}–{rw}。",
      "sum.mode": "模式：{mode}。",
      "sum.recs": "副驾推荐：",
      "sum.recLine": "  {rank}. [{kind}] {champ} —— {reason}",
      "sum.warning": "警告：{text}",

      /* ---- 侦察视图外壳 ---- */
      "scout.opponent": "对手",
      "scout.meta": "{team} —— 数据集内 {games} 局 · {wins} 胜（{pct}） · {label}",
      "scout.firstPicks": "最常用的一抢",
      "scout.bannedAgainst": "最常被针对禁用的英雄",
      "scout.poolsTitle": "各位置英雄池",
      "scout.poolsHint": "（每个位置前 5 · 场次 · 胜率）",
      "scout.shiftTitle": "无畏迁移——系列赛拖长后他们的 BP 如何变化",
      "scout.howtoTitle": "如何取胜——规则生成的洞察",
      "scout.howtoHint": "（每张卡都标注样本量）",
      "scout.fpExtra": "（占 {n} 局的 {share}）",
      "scout.baExtra": "（在对他们的 {share} 对局中被禁）",
      "scout.colChampion": "英雄",
      "scout.colGames": "场次",
      "scout.colWR": "胜率",
      "scout.distinct": "共 {count} 个",
      "scout.shiftColGame": "局数",
      "scout.shiftColTop": "该局数下他们最常用的选用",
      "scout.shiftColOwn": "他们自己的选用已被无畏禁用（平均）",
      "scout.shiftColShared": "共享英雄池减少（平均）",
      "scout.shiftUnit": "{count} 个英雄",
      "scout.shiftNote": "基于打到第 3 局的 {n} 个系列赛。到第 5 局，共享英雄池最多会失去 40 个英雄——第 1–4 局的每一个选用对双方都不可用。",
      "scout.noShift": "该队在数据集中没有 3 局以上的系列赛。",
      "scout.sampleN": "样本：n={n}",
      "scout.noInsights": "在当前阈值下，该队没有触发任何洞察规则。",
      "scout.sidesTitle": "红蓝方拆分——蓝方 vs 红方",
      "scout.sidesHint": "（按方拆分：场次 · 胜率 · 一抢前五 · 被针对禁用前五）",
      "scout.blueSide": "蓝方",
      "scout.redSide": "红方",
      "scout.sideRecord": "{games} 局 · {wins} 胜（{wr}）",
      "scout.sideFirstPicks": "一抢前五",
      "scout.sideBannedAgainst": "被针对禁用前五",
      "scout.noSides": "数据集中没有该队的红蓝方拆分数据。",

      /* ---- 简报面板（app.js 渲染） ---- */
      "brief.title": "AI 简报——赛前简报",
      "brief.titleHint": "（基于上方聚合数据本地生成；每个数字都带样本量）",
      "brief.copy": "复制简报",
      "brief.noProfile": "该队没有可用的档案数据。",
      "brief.sec1": "1 · 总体倾向",
      "brief.sec2": "2 · 三大禁用目标",
      "brief.sec3": "3 · 一抢优先级",
      "brief.sec4": "4 · 无畏征召后期风险",
      "brief.sec5": "5 · 系列赛计划（G1–G5）",
      "brief.sec1Body": "{team}：{games} 局，{wins} 胜（{wr}）。最常用一抢：{fp}。最常被针对禁用：{ba}。",
      "brief.listItem": "{champ} ×{count}（{share}）",
      "brief.banTargetLine": "{champ}——选用时胜率 {wrWith}（{picked} 局），不用时 {wrWithout}（{diff}）",
      "brief.sec3Priority": "{champ}——在 {n} 局里一抢了 {count} 次（{share}），是数据集整体一抢率的 {ratio} 倍。禁用它，或提前准备克制方案。",
      "brief.sec3None": "没有英雄达到数据集一抢率 2 倍的门槛；最常用的开局是：{opener}。",
      "brief.sec3Opener": "{champ}（{count}/{n}）",
      "brief.exhaustion": "英雄池枯竭：到第 4 局，他们前 5 绝活（{top5}）平均已有 {avg} 个被无畏禁用",
      "brief.longSeriesN": "n={n} 个长系列赛",
      "brief.dryRoles": "最先枯竭的位置：{roles}。",
      "brief.g3Line": "到第 3 局，他们自己的选用平均已失去 {removed} 个；共享英雄池减少 {pool} 个",
      "brief.seriesN": "n={n} 个系列赛",
      "brief.concentrated": "{role}英雄池高度集中：{c1} + {c2} 占了该位置 {share} 的对局",
      "brief.sideWrLine": "红蓝方拆分：蓝方胜率 {wrB}（{gamesB} 局），红方胜率 {wrR}（{gamesR} 局），相差 {gap} 个百分点。",
      "brief.sideFpClause": " 一抢首选也随方翻转：蓝方 {champB}、红方 {champR}。",
      "brief.sideFpLine": "红蓝方拆分：一抢首选随方翻转——蓝方 {champB}（{gamesB} 局中 {countB} 次），红方 {champR}（{gamesR} 局中 {countR} 次）。",

      /* ---- 简报纯文本 + 系列赛计划（brief.js） ---- */
      "brief.textTitle": "赛前简报 —— 对手 {team}（{tag}）",
      "brief.textDataset": "数据集：{games} 局，{wins} 胜（{wr}）。基于聚合数据本地生成；下方每个数字都带样本量。",
      "brief.textSec1": "1）总体倾向",
      "brief.textFpLine": "   最常用一抢：{list}",
      "brief.textBaLine": "   最常被针对禁用：{list}",
      "brief.fpItem": "{champ} ×{count}（占 {n} 局的 {share}）",
      "brief.baItem": "{champ} ×{count}（占对局的 {share}）",
      "brief.textSec2": "2）三大禁用目标",
      "brief.textBanLine": "   {rank}. {champ}——选用 {picked} 次，胜率 {wrWith}；不用时 {wrWithout}（{diff}）",
      "brief.textSec3": "3）一抢优先级",
      "brief.textPriority": "   {champ}：在 {n} 局里一抢了 {count} 次（{share}）——是数据集整体一抢率（{global}）的 {ratio} 倍。禁用它，或提前准备克制方案。",
      "brief.textNoPriority": "   没有英雄达到数据集一抢率 2 倍的优先级门槛；他们最常用的开局是 {opener}。",
      "brief.textSec4": "4）无畏征召后期风险",
      "brief.textExhaustion": "   英雄池枯竭：到第 4 局，他们前 5 绝活（{top5}）平均已有 {avg} 个被无畏禁用（n={n} 个长系列赛）。最先枯竭的位置：{roles}。",
      "brief.textG3": "   到第 3 局，他们自己的选用平均已失去 {removed} 个；共享英雄池减少 {pool} 个（n={n} 个系列赛）。",
      "brief.textConcentrated": "   {role}英雄池高度集中：{c1} + {c2} = 该位置 {total} 局的 {share}。",
      "brief.textSideWrLine": "   红蓝方拆分：蓝方胜率 {wrB}（{gamesB} 局），红方胜率 {wrR}（{gamesR} 局），相差 {gap} 个百分点。",
      "brief.textSideFpClause": " 一抢首选也随方翻转：蓝方 {champB}、红方 {champR}。",
      "brief.textSideFpLine": "   红蓝方拆分：一抢首选随方翻转——蓝方 {champB}（{gamesB} 局中 {countB} 次），红方 {champR}（{gamesR} 局中 {countR} 次）。",
      "brief.textSec5": "5）系列赛计划（G1–G5）",
      "plan.g1Title": "第 1 局——打他们的绝活",
      "plan.g2Title": "第 2 局——同样的计划，低一档",
      "plan.g3Title": "第 3 局——针对迁移后的英雄池",
      "plan.g4Title": "第 4 局——攻击枯竭的位置",
      "plan.g5Title": "第 5 局——深度决定胜负",
      "plan.g1Ban": "禁用阶段先手针对 {champ}：{team} 用它在 {picked} 局里胜率 {wrWith}，不用时 {wrWithout}（{diff}）。",
      "plan.g1Deny": "拆掉一抢优先级 {champ}（{n} 局里一抢了 {count} 次，是数据集一抢率的 {ratio} 倍）——禁用它，或直接抢走。",
      "plan.g1Opener": "他们最常用的开局是 {champ}（一抢 {count}/{n} 次）——准备好克制或交换方案。",
      "plan.g1Full": "完整的 {total} 英雄池：只有这一局他们的全部绝活都可用，所以把禁用花在证据上，而不是习惯上。",
      "plan.g1FullBare": "完整英雄池：只有这一局他们的全部绝活都可用，所以把禁用花在证据上，而不是习惯上。",
      "plan.g2Gone": "现在已有 10 个英雄被无畏禁用。他们在第 1 局最常用的英雄（跨 {series} 个系列赛：{gone}）正是首先消失的那批。",
      "plan.g2Promote": "把 2 号禁用目标 {champ} 提上来（胜率差 {diff}，n={n}），前提是它在第 1 局没被选用而存活下来。",
      "plan.g2Slide": "预计他们的 BP 会沿同样的位置低一档滑动——保留第 1 局的禁用计划、重新排序，而不是推倒重来。",
      "plan.g3Shift": "实测迁移：进入第 3 局时，他们平均已失去 {removed} 个自己先前的选用，共享英雄池减少 {pool} 个英雄（跨 {series} 个系列赛）。",
      "plan.g3Migrate": "他们的第 3 局 BP 会迁移向：{list}。为这些英雄准备答案，而不是为他们第 1 局的样子。",
      "plan.g3Pinch": "开始掐 {role} 英雄池：{c1} + {c2} 占了该位置 {total} 局的 {share}——第二轮禁用现在开始见效。",
      "plan.g3None": "该队在数据集中没有第 3 局的系列赛样本——按上方的禁用目标和位置深度来计划。",
      "plan.g4Exhaust": "在打到第 4 局以上的 {series} 个系列赛里，到第 4 局时，他们前 5 绝活（{top5}）平均已有 {avg} 个被无畏禁用（n={n} 个系列赛）。",
      "plan.g4Dry": "他们最先枯竭的位置：{roles}——把第二轮禁用瞄准那里，逼他们拿不擅长的英雄。",
      "plan.g4Thin": "按使用过的不同英雄数计最薄的英雄池：{list}。",
      "plan.thinItem": "{role}（{distinct} 个）",
      "plan.g4None": "该队在数据集中没有第 4 局以上的系列赛样本——继续对第 4 节里最浅的位置英雄池施压。",
      "plan.g5Gone": "这局 BP 开始前已有 40 个英雄被无畏禁用{extra}。",
      "plan.g5Extra": "（他们的系列赛历史显示，到第 5 局共享英雄池平均减少 {pool} 个英雄）",
      "plan.g5Pocket": "在 {roles} 准备好两个口袋英雄——这些位置决定双方的第 5 局。",
      "plan.g5Target": "如果 {champ} 居然还可用（{diff}，n={n}），它是剩余价值最高的禁用或抢选目标。",
      "plan.g5Comfort": "选擅长的而不是版本的：英雄池只剩约 77%，准备了更深英雄池的队伍在 BP 室里就赢下这局。",
      "insight.banTitle": "禁用 {champ}",
      "insight.banBody": "{team} 在 {n} 局里选用了 {picked} 次 {champ}（{rate}），胜率 {wrWith}。不用时：{unpicked} 局胜率 {wrWithout}——低了 {diff} 个百分点。",
      "insight.fpTitle": "一抢优先级：{champ}",
      "insight.fpBody": "{team} 在 {n} 局里一抢了 {count} 次 {champ}（{share}）——是数据集整体一抢率（{global}）的 {ratio} 倍。用第一阶段禁用拆掉它，或提前准备克制方案。",
      "insight.wastedTitle": "{champ} 的禁用优先级建议复核",
      "insight.wastedBody": "对手在 {bans} 局里对 {team} 禁用了 {champ}，而 {team} 仍赢下其中 {wins} 局（{wr}）——高于他们 {baseline} 的基线，也就是说这个禁用并没有压低他们的胜率。建议复核它的优先级，把禁用留给别处。",
      "insight.pinchTitle": "掐 {role} 英雄池",
      "insight.pinchBodyPlayer": "{player}（{team} {role}）有 {share} 的对局靠 {c1} 和 {c2}（该位置共 {total} 局）。两个针对性禁用（或一个禁用加一个抢选）就能把他们逼进英雄池深处。",
      "insight.pinchBody": "{team} 的{role}有 {share} 的对局靠 {c1} 和 {c2}（该位置共 {total} 局）。两个针对性禁用（或一个禁用加一个抢选）就能把他们逼进英雄池深处。",
      "insight.fearlessTitle": "无畏征召到第 3 局就把他们掏空",
      "insight.fearlessBody": "在打到第 3 局的 {series} 个系列赛里，{team} 进入第 3 局时平均已有 {removed} 个自己先前的选用被无畏禁用，共享英雄池也已减少 {pool} 个英雄。把系列赛拖长，他们的 BP 就会变得可预测。",
      "insight.exhaustTitle": "⚠ 英雄池枯竭预警——第 4/5 局",
      "insight.exhaustMain": "在打到第 4 局以上的 {series} 个系列赛里，到第 4 局时，{team} 前 5 绝活（{top5}）平均已有 {avg} 个被无畏禁用。",
      "insight.exhaustDry": "最先枯竭的位置：{roles}——在那里准备深池口袋英雄，或尽早结束系列赛。",
      "insight.exhaustNoDry": "系列赛拖得越长，越要指望他们拿不擅长的英雄。",
      "export.header": "=== {blue} vs {red} —— {format}{patchPart} ===",
      "export.patchPart": " —— 版本 {patch}",
      "export.score": "系列赛比分：{blue} {bw} – {rw} {red}",
      "export.game": "第 {game} 局",
      "export.winnerSuffix": " —— 胜者：{team}",
      "export.bans": "  {team} 禁用：{list}",
      "export.picks": "  {team} 选用：{list}",
      "export.fearless": "  第 {game} 局后累计无畏禁用：{list}",
      "err.complete": "本局 BP 已完成。",
      "err.fearless": "{champ} 已在本系列赛先前的对局中被选用（无畏征召）。",
      "err.used": "{champ} 已在本局被选用或禁用。",
      "err.invalid": "无效的英雄选择。",
      "err.swapLocked": "只能在本局第一次禁用或选用之前换边。"
    }
  };

  /* ---- locale state (localStorage where available; memory in Node) ---- */
  var memoryLocale = null;
  function storedLocale() {
    try {
      if (typeof localStorage !== "undefined") return localStorage.getItem(STORAGE_KEY);
    } catch (e) { /* storage blocked */ }
    return memoryLocale;
  }
  function persistLocale(loc) {
    memoryLocale = loc;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, loc);
    } catch (e) { /* storage blocked — memory copy still applies */ }
  }

  var locale = storedLocale() === "zh" ? "zh" : "en";

  function getLocale() { return locale; }

  function setLocale(loc) {
    locale = loc === "zh" ? "zh" : "en";
    persistLocale(locale);
    return locale;
  }

  function t(key, params) {
    var s = DICT[locale][key];
    if (s == null) s = DICT.en[key];       // silent EN fallback
    if (s == null) return key;             // tests assert this never ships
    if (params) {
      // Single regex pass: every {name} is resolved at most once, a
      // placeholder without a matching param is left untouched, and a
      // param VALUE containing "{...}" is never re-substituted.
      s = s.replace(/\{([^{}]+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(params, k)
          ? String(params[k]) : m;
      });
    }
    return s;
  }

  /* Localized role name for a data role key ("Top" -> 上单）. */
  function role(roleKey) { return t("role." + roleKey); }

  /* HTML-escape a user- or data-derived string before it is spliced
   * into innerHTML. Escapes & < > " ' — the five characters that can
   * break out of text or attribute context. */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    DICT: DICT,
    getLocale: getLocale,
    setLocale: setLocale,
    t: t,
    role: role,
    esc: esc
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.I18n = api;
})(typeof window !== "undefined" ? window : globalThis);
