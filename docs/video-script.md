# Demo Video Script — Fearless Draft Room (≤ 3:00)

**Format:** screen recording of the app (1080p), **English narration**, English on-screen text throughout.
**Pacing:** English VO at ~130–150 words/minute. Total narration ≈ 426 words across 3:00 (per-segment word counts in the table at the bottom — nothing is rushed).
**Narration format:** each segment gives the **English VO line** (this is what gets recorded), a **中文对照** line directly under it (reference only — for the producer to know exactly what is being said; NOT recorded, NOT subtitled), and **字幕** chunks (burned-in English subtitles, ≤ 12 words per line — used on the fallback route, harmless to keep on the TTS route too).
**Shot directions / production notes are in Chinese.**
**VO route (decide before recording):** 首选英文 TTS（ElevenLabs 或 Edge TTS）或录制者本人英文配音；备选为中文配音 + 烧录英文字幕（用下方「字幕」分行，每行 ≤ 12 个英文词）。无论哪条路线，**录制时应用必须切到 EN 模式**，画面里不出现中文 UI。
**Story setup (new):** 剧情设定为「你是 Cloud9 教练组，备战对阵 T1 的 BO5」。开场设置镜头里蓝方选 **Cloud9 Kia**、红方选 **T1**——队伍下拉一选，Copilot 的对手会自动联动到 T1，不需要再单独设置对手。
**Rule for the whole video:** the two judge questions appear as English caption overlays whenever we answer them —
Q1: **"What pick/ban tendencies repeat most often for this opponent?"**
Q2: **"How does the opponent's draft strategy shift in a Fearless Draft Game 3/4/5?"**

---

## Shot list

### 0:00–0:15 — HOOK: the pool collapse (strongest selling point first)

| | |
|---|---|
| **Screen** | App already open on the demo series at **Game 5**. The gold pool banner fills the top: "Game 5: 40 champions fearless-banned · pool at 77%". Cursor sweeps across the champion grid — 40 tiles are greyed out, badged F·G1…F·G4. |
| **Action** | 录制前先把演示跑到 Game 5 停住（开场不展示点击 Load）。Slow zoom on the banner, then on the badged tiles. |
| **Narration (EN)** | "Game five. Forty champions already gone — before the draft even starts. This is Fearless Draft: any champion picked earlier in the series stays banned. Normal draft tools break here. This one was built for it." |
| **中文对照** | 第五局。还没开始 BP，四十个英雄已经没了。这就是无畏征召：系列赛里前面选过的英雄，后面全部禁用。普通 BP 工具到这里直接失效——这个就是为它而生的。 |
| **字幕** | Game five. Forty champions already gone — before the draft even starts. ／ This is Fearless Draft: any champion picked earlier ／ in the series stays banned. ／ Normal draft tools break here. ／ This one was built for it. |

### 0:15–0:35 — What this is + the Cloud9 setup

| | |
|---|---|
| **Screen** | Reset to a fresh app（注意：应用首次打开会自动预载演示第 3 局，录这一段前先 Reset / New series 回到干净状态）. Header + both tabs visible. Set **Blue team = Cloud9 Kia**, **Red team = T1** in the team selects. Click **Load demo series (BO5)**, then **Auto-play demo**. |
| **Action** | 选队伍时在下拉上停半拍：让评委看清蓝方 Cloud9 Kia、红方 T1，并注意到 Copilot 的 Opponent 已自动变成 T1（无需第二次选择）。然后让 Game 1 以自动播放速度走完开局：bans and picks land in the standard 20-step order; the win-rate bar breathes as picks land. |
| **Narration (EN)** | "Fearless Draft Room, built for the Cloud9 and JetBrains hackathon. You are Cloud9's coaching staff, preparing a best-of-five against T1. Blue: Cloud9 Kia. Red: T1 — the Copilot's opponent links automatically. One click loads the series, twenty steps in order. The win-rate bar is a heuristic estimate, documented, not magic." |
| **中文对照** | 这是 Fearless Draft Room，为 Cloud9 × JetBrains 黑客松开发。假设你是 Cloud9 教练组，正在备战对阵 T1 的 BO5。蓝方：Cloud9 Kia。红方：T1——Copilot 的对手会自动联动。点一下载入整场系列赛，按职业比赛的二十步顺序走。胜率条是启发式估算——有文档说明，不是魔法。 |
| **字幕** | Fearless Draft Room, built for the Cloud9 and JetBrains hackathon. ／ You are Cloud9's coaching staff, ／ preparing a best-of-five against T1. ／ Blue: Cloud9 Kia. Red: T1 ／ — the Copilot's opponent links automatically. ／ One click loads the series, twenty steps in order. ／ The win-rate bar is a heuristic estimate, documented, not magic. |

### 0:35–0:55 — The Fearless engine (differentiation)

| | |
|---|---|
| **Screen** | Auto-play crosses into **Game 2**. Game 1's ten picks are greyed out with gold `F·G1` badges. Try to click one — the state machine rejects it. Pool banner now reads 10 fearless-banned, pool at 94%. |
| **Action** | Attempt one illegal click on a F·G1 tile; then let auto-play continue a few picks. |
| **Narration (EN)** | "Game two. Every champion Cloud9 and T1 picked in game one is greyed out, badged F·G1 — and locked. Watch: I try to click one, and the state machine refuses. It is not a grey icon; the pick is illegal. Bans reset each game. Picks never come back." |
| **中文对照** | 第二局。第一局 Cloud9 和 T1 选过的每个英雄都变灰、带上 F·G1 标记，而且锁死。看：我点一个，状态机直接拒绝——不是图标变灰，是这个选择本身非法。Ban 每局重置，Pick 永远不回来。 |
| **字幕** | Game two. Every champion Cloud9 and T1 picked in game one ／ is greyed out, badged F·G1 — and locked. ／ Watch: I try to click one, and the state machine refuses. ／ It is not a grey icon; the pick is illegal. ／ Bans reset each game. Picks never come back. |

### 0:55–1:15 — The AI Draft Copilot, live (20s)

| | |
|---|---|
| **Screen** | Stay in the Draft Room, Game 2 auto-play running. Frame the draft board + the **AI Draft Copilot** panel together (the panel now sits directly above the champion grid — no scrolling needed). Opponent shows **T1** (auto-linked from the team selects), We are = Blue side. The headline updates each step; a gold warning is on screen: T1's Jungle comfort pool is nearly dry. |
| **Action** | Let two picks land. After each pick, the Top-3 recommendation cards **reshuffle live**. |
| **后期（必做）** | 剪辑时对其中一张推荐卡的**理由行做局部放大（zoom-in）或加高亮框，停留 2–3 秒**——锁定的就是那行 "Denies T1: they won …% on … across … picks (n=…)"，让评委一眼看清「针对 T1 + 胜率 + 样本量」。 |
| **Narration (EN)** | "While the draft runs, the Copilot reads the board live. Every pick reshuffles its top three: our best options on our turn, threats to deny on theirs. Each card shows the evidence and the sample size — and it only suggests champions still legal. The coach decides. It computes." |
| **中文对照** | BP 进行中，Copilot 实时读局势。每落一子，Top-3 立刻重排：轮到我们，给最优解；轮到对手，亮出要针对的威胁。每张卡都带数据出处和样本量——而且只推荐当前合法的英雄。教练做决定，它做计算。 |
| **字幕** | While the draft runs, the Copilot reads the board live. ／ Every pick reshuffles its top three: ／ our best options on our turn, ／ threats to deny on theirs. ／ Each card shows the evidence and the sample size ／ — and it only suggests champions still legal. ／ The coach decides. It computes. |

### 1:15–1:45 — Judge Q1: opponent tendencies + one-click brief

| | |
|---|---|
| **Screen** | Switch to **Scouting & Tendencies** tab. Caption overlay (English): **Q1: "What pick/ban tendencies repeat most often for this opponent?"** First flip the team selector to **Cloud9 Kia** for a ~3-second beat (our own profile), then switch to **T1** and go deep. |
| **Action** | ① 选 Cloud9 Kia 停留约 3 秒（知己）；② 切到 T1；③ 三张表（一抢表、被针对 Ban 表、各位置英雄池）**合并成一次平滑滚动，约 5 秒一带而过，不停留细看**；④ 直接落到 **AI Brief** 面板：镜头里生成简报（三大 Ban 目标 → G1–G5 系列计划），点击 **Copy brief**。**本段不要在 How to Win 卡片上停留**——那是下一段（1:45–2:20）的内容。 |
| **Narration (EN)** | "First, know yourself: Cloud9's own profile — our first picks, our pools. Then the opponent. Question one: what are T1's tendencies? This is not sample data. It is GRID's official dataset: 466 series, 1,041 games, twelve pro teams. First picks, the bans opponents waste on them, every role's pool. And the same data writes the brief: ban targets and a game-by-game plan — generated, and copied, in one click." |
| **中文对照** | 先知己：Cloud9 自己的画像——我们的一抢、我们的英雄池。再看对手。评委问题一：T1 的选禁倾向是什么？这不是样本数据——是 GRID 官方数据：466 个系列、1041 场比赛、十二支职业战队。一抢优先级、对面浪费在他们身上的 Ban、每个位置的英雄池。同一份数据还能直接写出简报：Ban 目标和逐局计划——一键生成、一键复制。 |
| **字幕** | First, know yourself: Cloud9's own profile ／ — our first picks, our pools. ／ Then the opponent. Question one: what are T1's tendencies? ／ This is not sample data. ／ It is GRID's official dataset: ／ 466 series, 1,041 games, twelve pro teams. ／ First picks, the bans opponents waste on them, every role's pool. ／ And the same data writes the brief: ／ ban targets and a game-by-game plan ／ — generated, and copied, in one click. |

### 1:45–2:20 — How to Win cards (evidence or it didn't happen)

| | |
|---|---|
| **Screen** | Zoom on three cards for T1: a wasted-ban card (Pantheon), a ban-target card, and the red/gold **Pool Exhaustion** card. Highlight the "sample: n=…" chip on one card. |
| **Action** | Click/hover each card in turn; end on the pool-exhaustion card. |
| **Narration (EN)** | "Every insight card is generated by rules from the data — none of it is hand-written. This one is my favorite: opponents have banned Pantheon against T1 sixteen times. T1 won eighty-one percent of those games — well above their sixty-four percent baseline. That ban is wasted; spend it elsewhere. Every card carries its sample size, so the coach can judge how much to trust it. And the last card is one only Fearless Draft makes possible: pool exhaustion." |
| **中文对照** | 每张洞察卡都是规则从数据里生成的，没有一句是手写的。我最喜欢这张：对手对 T1 禁了 16 次潘森，T1 照样赢了 81%——远高于他们 64% 的基线。这个 Ban 是浪费的，省下来禁别的。每张卡都带样本量，教练可以自己判断信几分。最后一张是无畏征召独有的：英雄池枯竭。 |
| **字幕** | Every insight card is generated by rules from the data ／ — none of it is hand-written. ／ This one is my favorite: ／ opponents have banned Pantheon against T1 sixteen times. ／ T1 won eighty-one percent of those games ／ — well above their sixty-four percent baseline. ／ That ban is wasted; spend it elsewhere. ／ Every card carries its sample size, ／ so the coach can judge how much to trust it. ／ And the last card is one only Fearless Draft makes possible: ／ pool exhaustion. |

### 2:20–2:50 — Judge Q2: the late-series shift

| | |
|---|---|
| **Screen** | Caption overlay (English): **Q2: "How does the opponent's draft strategy shift in a Fearless Draft Game 3/4/5?"** Show the **Fearless Shift** view for T1 and the **pool-depletion panel**: camera and stress land on the **Jungle / Mid rows** (flagged nearly dry) and on T1's top-5 comfort picks struck through. Then cut back to the Draft Room at Game 5 with the pool banner. |
| **Action** | Point at the G4/G5 rows of the Fearless Shift table; cut to the Game-5 draft board; hold one beat on the depletion panel's Jungle and Mid rows; finish the last picks of the demo. **本段不再强调「ADC 版本池只剩 12 个」——那个数字力度不够，已从旁白删除。** |
| **Narration (EN)** | "Question two: the late-series shift. Across T1's five long series, by game four an average of 3.6 of their five most-played champions — Viktor, Xin Zhao, Jhin, Rumble, Gwen — are already fearless-banned. Gone, before game four even starts. Their jungle and mid pools run driest — and their most-played picks, Xin Zhao and Viktor, eighteen games each, are exactly what vanishes. The system tracks it all. The coach doesn't have to." |
| **中文对照** | 评委问题二：系列赛后段的变化。T1 在数据里的 5 个长系列赛中，到第四局，他们最常用的五个英雄——维克托、赵信、烬、兰博、格温——平均已有 3.6 个被无畏禁用。第四局还没开始，人就没了。打野和中单的池子最先见底——而他们用得最多的两个英雄，赵信和维克托（各 18 局），正是消失得最快的。系统全程替教练记着，教练不用手算。 |
| **字幕** | Question two: the late-series shift. ／ Across T1's five long series, by game four ／ an average of 3.6 of their five most-played champions ／ — Viktor, Xin Zhao, Jhin, Rumble, Gwen — ／ are already fearless-banned. ／ Gone, before game four even starts. ／ Their jungle and mid pools run driest ／ — and their most-played picks, Xin Zhao and Viktor, ／ eighteen games each, are exactly what vanishes. ／ The system tracks it all. The coach doesn't have to. |

### 2:50–3:00 — Close

| | |
|---|---|
| **Screen** | Series summary + the copyable text export; click **Copy draft history**. End card: project name + "Fearless Draft Room — Cloud9 × JetBrains Hackathon, Category 2" + small line: **"Built with JetBrains IDEs · Powered by GRID official data"**. |
| **Action** | Copy the export; fade to end card. |
| **Narration (EN)** | "After the series, one click exports the full draft history for review. Fearless Draft Room — the draft room built for Fearless Draft." |
| **中文对照** | 赛后一键导出整个系列的 BP 记录，直接进复盘。Fearless Draft Room——为无畏征召而生的 BP 指挥室。 |
| **字幕** | After the series, one click exports the full draft history for review. ／ Fearless Draft Room — the draft room built for Fearless Draft. |

---

## Narration pacing (checked per segment)

| Segment | Seconds | EN words | Implied pace |
|---|---|---|---|
| 0:00–0:15 Hook | 15 | 36 | 144 wpm |
| 0:15–0:35 What this is + Cloud9 setup | 20 | 50 | 150 wpm |
| 0:35–0:55 Fearless engine | 20 | 48 | 144 wpm |
| 0:55–1:15 Copilot live | 20 | 49 | 147 wpm |
| 1:15–1:45 Q1 scouting + brief | 30 | 69 | 138 wpm |
| 1:45–2:20 How to Win cards | 35 | 79 | 135 wpm |
| 2:20–2:50 Q2 late-series shift | 30 | 72 | 144 wpm |
| 2:50–3:00 Close | 10 | 23 | 138 wpm |
| **Total** | **180** | **426** | **~142 wpm avg** |

---

## Recording checklist

- [ ] **UI in EN mode** for the entire recording (the app defaults to EN — confirm the header toggle shows EN active); no Chinese UI text anywhere on screen. All caption overlays (Q1/Q2) in English, worded exactly as in this script.
- [ ] **VO route decided**: English TTS (ElevenLabs / Edge TTS) or own English VO preferred. Fallback only: Chinese VO + burned-in English subtitles using the 字幕 chunks above (≤ 12 words per line).
- [ ] Pre-load the app via a local static server (`python3 -m http.server 8000`) so icons and data load instantly; record at 1080p, browser zoom 100%.
- [ ] **Setup shot**: Blue team = **Cloud9 Kia**, Red team = **T1** in the team selects — the Copilot opponent auto-links to T1 (no second step). Confirm the Copilot panel shows **Opponent = T1, We are = Blue side**. Note: a first-ever load auto-preloads the demo at Game 3 — Reset / New series before filming the 0:15 setup segment; run the demo ahead to Game 5 for the 0:00 hook shot.
- [ ] Rehearse the demo auto-play once end-to-end (it is deterministic: the demo BO5 always ends 3–2). Leave the demo running to Game 2 for the Copilot segment (T1's Jungle pinch warning appears there).
- [ ] Post-production: in the 0:55–1:15 segment, zoom in / highlight-box the Copilot reason line ("Denies T1: … (n=…)") for 2–3 seconds.
- [ ] The numbers quoted in narration trace to the shipped GRID aggregates and the demo replay: 40 champions / pool at 77% in Game 5 (demo); Pantheon banned 16 times, T1 won 81% vs their 64% baseline; 466 series / 1,041 games / 12 teams; by Game 4 an average of **3.6 of T1's top 5** (Viktor, Xin Zhao, Jhin, Rumble, Gwen) fearless-banned across their 5 long series; driest roles **Jungle and Mid**; Xin Zhao and Viktor most-played at **18 games each**. If the dataset is rebuilt before recording, re-check these numbers in the Scouting tab and update the script. (The old "12 meta ADC champions" line was deliberately cut — do not re-add it.)
- [ ] Keep every "heuristic" mention honest: the win-rate bar is labeled an estimate on screen and in narration.
- [ ] **End-card honesty**: the line "Built with JetBrains IDEs" goes on the end card **only after the real JetBrains IDE working session has actually happened** (it is scheduled before recording) — film/publish the end card after that session, so the claim is true.
