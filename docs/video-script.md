# Demo Video Script — Fearless Draft Room, v5 (2:42, cap 3:00)

**Status:** v5 is the current demo cut (supersedes v4). Re-recorded against the
post-review build: the board-first layout (collapsible 3D showcase, collapsed by
default), the demo matchup aligned to two real dataset teams (Cloud9 Kia vs
Gen.G — board, Copilot and pool-depletion all analyse Gen.G), demo step /
auto-play controls at the top of the board, and the cleaned-up phase label.
English narration (TTS, Piper `en_US-amy-medium`, length-scale 0.86 — v4 used
Bailian `qwen3-tts-flash`/Cherry; the voice differs, the script's wording and
cadence follow v4), English burned-in subtitles (one short card at a time,
≤12 words per card), low electronic pad under the voice, loudness ≈ −15 LUFS.
**Structure:** one motif — the champion-pool counter — carried through seven
acts. The Game-5 cold open is bookended: the same board returns at the end,
reframed. The signature statistic (3.6) is teased early and cashed out in
Act 3. All numbers re-verified against `data/scouting.json` (466 series ·
1,041 games · 12 teams · T1 Pantheon 16 bans-against, 81% vs 64% baseline ·
T1 late-series avgTop5GoneByG4 = 3.6, n=5 · G5 pool 133/173 = 76.9%).

| Act | Time | Visual | Narration lines |
|---|---|---|---|
| A1 Cold open | 0:00–0:24 | Demo series at Game 5 start: pool banner (40 gone, 133/173), empty G5 board, Copilot ban targets. Chip: **GAME 5 · POOL 133/173** | L01–L04 |
| A2 The data | 0:24–0:52 | Scouting: T1 profile, role pools; big-number card **1,041 GAMES · 466 SERIES · 12 PRO TEAMS**; insight cards incl. Pantheon ban review | L05–L08 |
| A3 Exhaustion | 0:52–1:14 | Insight cards; the gold pool-exhaustion card (3.6 by Game 4, Jungle/Mid driest) and the AI Brief | L09–L11 |
| A4 Match day | 1:14–1:43 | **New first screen** (board first: banner, phase, Copilot); one-click demo load with controls at the top; Game 2 grid — F·G1-badged tiles locked. Chip: **GAME 2 · POOL 163/173** | L12–L15 |
| A5 Copilot + the bar | 1:43–2:08 | Copilot reshuffles after each demo step (PICK/WATCH cards, pool-dry warnings); the win-rate bar sits above it in frame | L16–L19 |
| A6 BYOK | 2:08–2:19 | The AI settings (BYOK) panel: presets, endpoint, key field | L20–L21 |
| A7 Bookend | 2:19–2:36 | Back to the Game-5 board; chip **GAME 5 · POOL 133/173** returns | L22–L24 |
| End card | 2:36–2:42 | Title + tagline + demo/repo URLs + **Built with JetBrains IDEs · Powered by GRID official data** | L25 over the card, then music tail |

## Narration (as recorded)

1. Game five. Two games all. And forty champions are already gone, before the draft even starts.
2. This is Fearless Draft. Any champion picked earlier in the series stays banned for the rest of it.
3. By Game Four, an average of three point six of T1's five comfort picks will already be off the board.
4. The only question is whether you see it coming — in Game One.
5. Start the night before, with the scouting board.
6. This is not sample data. It is GRID's official dataset: four hundred sixty-six series, one thousand forty-one games, twelve pro teams.
7. T1's first picks. Every role's pool. And the bans opponents waste on them.
8. Opponents have banned Pantheon against T1 sixteen times. T1 won eighty-one percent of those games, far above their sixty-four percent baseline.
9. And one card exists only because Fearless Draft does: pool exhaustion.
10. Across T1's five long series, by Game Four, three point six of their five most-played champions are already fearless-banned.
11. Their jungle and mid pools run driest. So the plan writes itself: close the series early, or arrive at Game Five with the deeper pool.
12. Draft day. The board comes first now: pool banner, the phase, and the Copilot, all in the first screen.
13. One click loads the series: Cloud9 Kia versus Gen G, twenty steps, in order — and the demo controls sit right at the top.
14. Game Two: every champion picked in Game One is greyed out, badged F·G1, and locked.
15. Watch: I try to click one, and the state machine refuses. It is not a grey icon. The pick is illegal.
16. Live, the Copilot reads the board after every pick, and reshuffles its top three.
17. Our turn: our best options. Their turn: the threats to deny. Each card with the evidence, and the sample size.
18. And watch the bar: every pick moves the win-rate estimate. A heuristic, documented, honest, not magic.
19. The Copilot computes. The coach decides.
20. Bring your own model, and it narrates the draft for you. A real call, from this browser, to the model in my settings.
21. Your key. Your model. Your draft room.
22. Game Five again. Forty champions gone, the pool at seventy-seven percent.
23. But this time, every one of those forty was in the plan, since Game One.
24. In Fearless Draft, the draft does not start at champion select. It starts in Game One.
25. Fearless Draft Room: the draft room built for Fearless Draft.

## What changed vs v4

- **First screen is the new layout**: v4 opened the Draft Room under a ~420px
  3D hero; v5's A4 shows the board-first screen (slim collapsed showcase bar,
  pool banner, phase bar and Copilot in the first viewport).
- **Demo matchup**: v4's scripted series fielded the fictional "Sentinels
  Five"; v5 fields Gen.G, so the board, the Copilot opponent and the
  pool-depletion panel agree on screen (new narration line 13 says so).
- **Demo controls** are visible at the top of the board in the A1/A4 takes
  (they sat under the champion grid in v4).
- **Phase label** reads "Ban Phase 2 — Gen.G to ban (13/20)" — v4's takes
  showed the duplicated "to ban BAN".
- **Voice**: Piper `en_US-amy-medium` (local, free) replaces Bailian TTS;
  wording updated only where the UI changed (lines 12–13), all statistics
  and the seven-act structure are unchanged.
- **Takes are all new**: captured from the current build with real champion
  icons (icons served from a local cache for the capture only, because the
  sandbox browser cannot reach the Data Dragon CDN; the shipped site still
  loads them from the CDN as before).

## Production notes

- Screen takes are scripted CDP captures of the real app (demo step-throughs
  driven through the app's own Step control), composited with slow zoom/pan,
  pool-counter chips and the big-number / end cards.
- Champion names stay on screen, out of the narration (TTS mispronounces
  them); numbers are spelled out in the TTS text and shown as digits in
  subtitles.
