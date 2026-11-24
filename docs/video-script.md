# Demo Video Script — Fearless Draft Room (≤ 3:00)

**Format:** screen recording of the app (1080p), Chinese narration, English subtitles throughout.
**Pacing:** ~165 Chinese characters per 30 seconds. Total narration ≈ 880 characters ≈ 2:45–2:58.
**Revision (AI layer):** a 20-second AI Copilot segment was inserted at 0:55–1:15. To hold the 3:00 cap, the intro (0:15), the Fearless-engine segment (0:35), and the Q1 scouting segment (1:15) were trimmed by 5s / 5s / 10s of narration and screen time.
**Before recording:** in the Copilot panel set **Opponent = T1** and **We are = Blue side** — the recommendations, denial reasons, and warnings in this script assume that setup.
**Rule for the whole video:** the two judge questions are on screen as captions whenever we answer them —
Q1 "对手的选禁倾向是什么？" / Q2 "无畏征召打到第 3/4/5 局，BP 会怎么变？"

---

## Shot list

### 0:00–0:15 — HOOK: the pool collapse (strongest selling point first)

| | |
|---|---|
| **Screen** | App already open on the demo series at **Game 5**. The gold pool banner fills the top: "Game 5: 40 champions fearless-banned · pool at 77%". Cursor sweeps across the champion grid — 40 tiles are greyed out, badged F·G1…F·G4. |
| **Action** | Click *Load demo series (BO5)* is NOT shown yet — start at the end state. Slow zoom on the banner, then on the badged tiles. |
| **Narration** | 「第五局，还没开始 BP，四十个英雄已经没了。这就是无畏征召——前面每一局选过的英雄，后面全部禁用。普通 BP 工具到这里直接失效，因为它们默认每局都是满英雄池。」 |
| **Subtitle** | Game 5. 40 champions already gone — before the draft even starts. This is Fearless Draft, and normal draft tools break here. |

### 0:15–0:35 — What this is + one-click demo *(trimmed 5s)*

| | |
|---|---|
| **Screen** | Reset to a fresh app. Header + both tabs visible. Click **Load demo series (BO5)**, then **Auto-play demo**. |
| **Action** | Let Game 1 draft play at auto-play speed: bans and picks land in the standard 20-step order; the win-rate bar breathes as picks land. |
| **Narration** | 「这是 Fearless Draft Room，为 Cloud9 × JetBrains 黑客松 Category 2 开发的 BP 管理与侦察系统。点一下，载入一场完整的 BO5 演示。BP 严格按职业比赛的二十步顺序走，胜率影响条实时更新——它只是启发式估算，公式和局限都写在 README 里。」 |
| **Subtitle** | A draft organizer + scouting system. One click loads a full BO5. The win-rate bar is a documented heuristic — formula and limits are in the README. |

### 0:35–0:55 — The Fearless engine (differentiation) *(trimmed 5s)*

| | |
|---|---|
| **Screen** | Auto-play crosses into **Game 2**. Game 1's ten picks are greyed out with gold `F·G1` badges. Try to click one — the state machine rejects it. Pool banner now reads 10 fearless-banned, pool at 94%. |
| **Action** | Attempt one illegal click on a F·G1 tile; then let auto-play continue a few picks. |
| **Narration** | 「注意第二局：第一局选过的十个英雄全部变灰，带着 F·G1 标记，而且点不动——不是界面灰掉，是状态机直接拒绝非法选择。Ban 不延续，只有 Pick 会。这就是无畏征召的规则引擎。」 |
| **Subtitle** | Game 2: Game 1's picks are locked out by the state machine itself — not just greyed out. Bans don't carry over. Picks do. |

### 0:55–1:15 — NEW: the AI Draft Copilot, live (20s)

| | |
|---|---|
| **Screen** | Stay in the Draft Room, Game 2 auto-play running. Scroll so the **AI Draft Copilot** panel is fully visible (Opponent = T1, We are = Blue side). The headline updates each step; a gold warning is on screen: T1's Jungle comfort pool is nearly dry. |
| **Action** | Let two picks land. After each pick, the Top-3 recommendation cards **reshuffle live** — pause half a second on a reason line that reads "Denies T1: they won …% on … across … picks (n=…)". |
| **Narration** | 「BP 进行中，副驾面板在实时读局势。每落一子，推荐立刻重排：轮到我们选，给三个最优解；轮到对手，亮出威胁名单。每条推荐都带数据出处和样本量，而且只从当前合法的英雄里选——被禁的永远不会出现。教练做决定，它做计算。」 |
| **Subtitle** | The AI Copilot re-reads the position after every action: 3 recommendations, each with its evidence and sample size — and never an illegal champion. The coach decides; it computes. |

### 1:15–1:45 — Judge Q1: opponent tendencies + one-click brief *(trimmed 10s)*

| | |
|---|---|
| **Screen** | Switch to **Scouting & Tendencies** tab. Opponent selector: **T1**. Caption overlay: 「评委问题一：对手的选禁倾向是什么？」 Show first-pick table, banned-against table, then scroll the role pools. End the segment on the **AI Brief** panel at the bottom and click **Copy brief**. |
| **Action** | Select T1; scroll through the three tables; land on the "How to Win" cards; then scroll to the AI Brief panel (tendencies → ban targets → G1–G5 plan) and click **Copy brief**. |
| **Narration** | 「评委的第一个问题：对手的选禁倾向是什么？这里不是样本数据——是 GRID 官方数据，466 个系列、1041 场比赛，聚合出的十二支职业战队画像。一抢优先级、最常被针对的 Ban、每个位置的英雄池和胜率，全在这里。再点一下，同一份数据直接生成一份完整的赛前简报：三大 Ban 目标、G1 到 G5 的系列计划，一键复制就能带走。」 |
| **Subtitle** | Q1: What are the opponent's tendencies? Real GRID data — 466 series, 1,041 games, 12 pro teams. And the same data generates a full pre-match brief in one click. |

### 1:45–2:20 — How to Win cards (evidence or it didn't happen)

| | |
|---|---|
| **Screen** | Zoom on three cards for T1: a wasted-ban card (Pantheon), a ban-target card, and the red/gold **Pool Exhaustion** card. Highlight the "sample: n=…" chip on one card. |
| **Action** | Click/hover each card in turn; end on the pool-exhaustion card. |
| **Narration** | 「每张洞察卡都是规则从数据里生成的，不是手写的。这一张说：对手 Ban 了 16 次潘森，T1 照样赢了 81%，高于他们 64% 的基线——这个 Ban 是浪费的。每一张卡都带着样本量，教练可以自己判断该信几分。最后一张是无畏征召独有的：英雄池枯竭预警。」 |
| **Subtitle** | Every insight is rule-generated from the data, and every card shows its sample size. |

### 2:20–2:50 — Judge Q2: the late-series shift

| | |
|---|---|
| **Screen** | Scroll to the **Fearless Shift** table for T1 (top picks by game number; removed counts rising to G5), then cut back to the Draft Room at Game 5 with the pool banner — and the Copilot panel showing the gold warning: **"⚠ Meta ADC pool nearly dry: only 12 champions with 30+ dataset games remain available in this role"**. Caption: 「评委问题二：打到第四、第五局，BP 会怎么变？」 |
| **Action** | Point at the G4/G5 rows; cut to the Game-5 draft board; hold one beat on the Copilot pool-dry warning; finish the last picks of the demo. |
| **Narration** | 「第二个问题：系列赛打长了，BP 怎么变？这张表按局数拆开：T1 打到第四局的系列赛里，他们最舒服的五个英雄平均已经没了 3.5 个，上单和中单最先见底。回到第五局的棋盘——池子只剩 77%，副驾的枯竭预警已经亮了：ADC 的版本英雄池只剩十二个。但教练不用再对着表格手算哪些英雄已经出局，系统替他记着。」 |
| **Subtitle** | Q2: By Game 4, an average of 3.5 of T1's top-5 comfort picks are already gone. The system tracks it — the coach doesn't have to. |

### 2:50–3:00 — Close

| | |
|---|---|
| **Screen** | Series summary + the copyable text export; click **Copy draft history**. End card: project name + "Fearless Draft Room — Cloud9 × JetBrains Hackathon, Category 2". |
| **Action** | Copy the export; fade to end card. |
| **Narration** | 「赛后，一键导出整个系列 BP 记录，直接进复盘。Fearless Draft Room——为无畏征召而生的 BP 指挥室。」 |
| **Subtitle** | One-click export for the post-series review. Fearless Draft Room. |

---

## Recording checklist

- [ ] Pre-load the app via a local static server (`python3 -m http.server 8000`) so icons and data load instantly; record at 1080p, browser zoom 100%.
- [ ] Rehearse the demo auto-play once end-to-end (it is deterministic: the demo BO5 always ends 3–2).
- [ ] Set the Copilot panel to **Opponent = T1, We are = Blue side** before recording; leave the demo running to Game 2 for the Copilot segment (T1's Jungle pinch warning appears there) and to Game 5 for the ADC meta-pool warning.
- [ ] The numbers quoted in narration (40 champions / 77%, Pantheon 16 games / 81% vs 64%, T1 top-5 → 3.5 gone by G4, 12 meta ADC champions left in Game 5) come from the shipped GRID aggregates and the demo replay — if the dataset is rebuilt before recording, re-check these numbers in the Scouting tab and update the script.
- [ ] Keep every "heuristic" mention honest: the win-rate bar is labeled an estimate on screen and in narration.
- [ ] English subtitles on for the full runtime (judges may not follow Chinese narration).
