# Demo Video Script — Fearless Draft Room, v4 (2:36, cap 3:00)

**Status:** v4 is the current published demo (supersedes the v3 script). English narration
(TTS, Cherry voice via Aliyun Bailian `qwen3-tts-flash`), English burned-in subtitles,
low electronic pad under the voice, loudness ≈ −15 LUFS.
**Structure:** one motif — the champion-pool counter — carried through seven acts.
The Game-5 cold open is bookended: the same board returns at the end, reframed.
The signature statistic (3.6) is teased at 0:13 and cashed out in Act 3.
The win-rate bar gets a dedicated close-up act (Act 5) instead of a mention.
All numbers were re-verified against `data/scouting.json` before recording
(466 series · 1,041 games · 12 teams · T1 Pantheon 16 bans-against, 81% vs 64% baseline ·
T1 late-series avgTop5GoneByG4 = 3.6, n=5 · G5 pool 133/173 = 76.9%).

| Act | Time | Visual | Narration lines |
|---|---|---|---|
| A1 Cold open | 0:00–0:22 | Demo series at Game 5: pool banner, badged grid. Chip: **GAME 5 · POOL 133/173** | L01–L04 |
| A2 The data | 0:22–0:51 | Scouting: T1 profile, role pools, bans-against. Big-number card: **1,041 GAMES · 466 SERIES · 12 PRO TEAMS** | L05–L08 |
| A3 Exhaustion | 0:51–1:15 | Insight cards; Q2 banner; the pool-exhaustion card | L10–L12 |
| A4 Match day | 1:15–1:33 | Load the series; Game 2 lock — a fearless-banned tile refuses the click. Chips: **GAME 1 · 173/173 → GAME 2 · 163/173** | L13–L15 |
| A5 Copilot + the bar | 1:34–2:00 | Copilot reshuffles after each action; cropped close-up of the win-rate bar swinging 50:50 → 30:70 across one pick phase | L17–L20 |
| A6 BYOK proof | 2:00–2:11 | A real narration call from the browser to the configured model, rendered live | L21–L22 |
| A7 Bookend | 2:12–2:32 | Back to the Game-5 board; chip **GAME 5 · POOL 133/173** returns | L23–L26 |
| End card | 2:32–2:36 | Title + tagline + demo/repo URLs | — (music only) |

## Narration (as recorded)

1. (0:00) Game five. Two games all. And forty champions are already gone, before the draft even starts.
2. (0:07) This is Fearless Draft. Any champion picked earlier in the series stays banned for the rest of it.
3. (0:13) By Game Four, an average of three point six of T1's five comfort picks will already be off the board.
4. (0:19) The only question is whether you see it coming — in Game One.
5. (0:22) Start the night before, with the scouting board.
6. (0:26) This is not sample data. It is GRID's official dataset: four hundred sixty-six series, one thousand forty-one games, twelve pro teams.
7. (0:35) T1's first picks. Every role's pool. And the bans opponents waste on them.
8. (0:42) Opponents have banned Pantheon against T1 sixteen times. T1 won eighty-one percent of those games, far above their sixty-four percent baseline.
9. (0:51) And one card exists only because Fearless Draft does: pool exhaustion.
10. (0:57) Across T1's five long series, by Game Four, three point six of their five most-played champions are already fearless-banned.
11. (1:06) Their jungle and mid pools run driest. So the plan writes itself: close the series early, or arrive at Game Five with the deeper pool.
12. (1:15) Draft day. One click loads the series: twenty steps, in order.
13. (1:20) Game Two: every champion picked in Game One is greyed out, badged F·G1, and locked.
14. (1:25) Watch: I try to click one, and the state machine refuses. It is not a grey icon. The pick is illegal.
15. (1:34) Live, the Copilot reads the board after every pick, and reshuffles its top three.
16. (1:40) Our turn: our best options. Their turn: the threats to deny. Each card with the evidence, and the sample size.
17. (1:49) And watch the bar: every pick moves the win-rate estimate. A heuristic, documented, honest, not magic.
18. (1:57) The Copilot computes. The coach decides.
19. (2:00) Bring your own model, and it narrates the draft for you. A real call, from this browser, to the model in my settings.
20. (2:08) Your key. Your model. Your draft room.
21. (2:12) Game Five again. Forty champions gone, the pool at seventy-seven percent.
22. (2:16) But this time, every one of those forty was in the plan, since Game One.
23. (2:21) In Fearless Draft, the draft does not start at champion select. It starts in Game One.
24. (2:28) Fearless Draft Room: the draft room built for Fearless Draft.

*(Line numbering follows the production script; two recorded lines were cut in the edit
where they duplicated an earlier line — the sample-size reminder and the format rule.)*

## Production notes

- Screen takes are re-cuts of the v2/v3 recordings plus one new take (the Act 5 bar
  close-up, recorded for v4 against the live app with a scripted 20-step draft).
- Champion names stay on screen, out of the narration (TTS mispronounces them);
  numbers are spelled out in the TTS text and shown as digits in subtitles.
- The pool-counter chips, the big-number card and the end card are generated graphics
  composited over the takes; subtitles are burned in, one narration line per card.
