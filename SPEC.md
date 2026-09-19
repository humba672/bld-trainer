# BLD Trainer Spec

2026-09-18 · Rajiv Srivastava

## Purpose and scope

A personal website for learning 3x3 blindfolded solving, from a first Old Pochmann success through Orozco to full 3-style, using a GAN 356 i Carry smart cube as the input device.

The cube tells the site every turn you make. The site uses that to check scrambles, time memo and execution separately, and show exactly where a failed solve went wrong.

Out of scope: other puzzles, multi-blind, other cube brands, accounts, multi-user features, a mobile layout, and any runtime AI calls.

## Settled decisions

These came from Rajiv's answers on 2026-09-18. Everything else in this spec is a proposal until he rules on it.

| # | Decision |
| --- | --- |
| S1 | Starting point: learning OP, no successful solve yet |
| S2 | Route: OP, then Orozco, then 3-style. M2 is skipped |
| S3 | Device: Windows PC, Chrome or Edge |
| S4 | Lettering: Speffz, A to X |
| S5 | Build: static site on GitHub Pages, all data in the browser |
| S6 | Cube: GAN 356 i Carry, exact variant unknown. P0 detects its protocol |
| S7 | Exit tests approved as written, with manual override |
| S8 | In Full solve the memo is typed only after a DNF, never before or during. Tracing drill still uses a typed memo |
| S9 | Execution ends on spacebar only. No idle timer, no auto-stop |
| S10 | OP buffers confirmed: UR for edges, UBL for corners |
| S11 | Memo advice is shown once, then hidden |
| S12 | Only execution errors in a full solve send that case back to the Alg drill queue. Memo and recall errors do not |
| S13 | Clicking a letter pair shows memorization ideas, everywhere pairs appear except during a timed Full solve |
| S14 | You can save your own image for a pair, and yours shows first |
| S15 | Ideas come from a list bundled with the site. No live lookups. The list's source is Q9 |

## Platform and cube connection

The site is a static TypeScript single-page app, built with Vite and deployed to GitHub Pages. Pages serves HTTPS, which Web Bluetooth requires. There is no server and no database.

**Bluetooth library.** Use [gan-web-bluetooth](https://classic.yarnpkg.com/en/package/gan-web-bluetooth) (MIT, TypeScript). It decrypts GAN traffic and emits a move event per turn plus full facelet state on request. The fallback is its fork, [smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth), which keeps the same GAN calls. General tools are not enough: [Twizzle connects to the i Carry but cannot stream it](https://github.com/cubing/cubing.js/issues/289).

**Connection flow.** A Connect button opens Chrome's device picker. The decryption key depends on the cube's MAC address. If the browser cannot read it, the site asks for it once and saves it. The header shows connection state and battery, and offers a "cube is solved" reset for when tracked state drifts.

**No gyroscope.** The i Carry reports the six face turns only. Three consequences:

- Whole-cube rotations are invisible. You hold white top, green front throughout. OP, Orozco and 3-style need no rotations.
- Slice and wide moves arrive as two face turns. M shows up as R plus L', and the core turns under your hands. The site tracks that hidden turn so later moves are read in your frame, and displays the pair as M.
- A true R L' and an M look identical on the wire. All correctness checks therefore compare cube states and ignore which way the cube is facing. Only the move display relies on the guess.

**Phase 0 proves all of this** on the actual cube before anything else is built, including which protocol generation it speaks.

## Cube conventions

Orientation is white top, green front. Lettering is standard Speffz: each face lettered clockwise from its top-left sticker, faces in the order U, L, F, R, B, D, with edges and corners lettered separately.

Buffers change once, at the move from OP to Orozco. Orozco and 3-style share buffers, so nothing is relearned after that.

| Stage | Edge buffer | Edges shoot to | Corner buffer | Corners shoot to |
| --- | --- | --- | --- | --- |
| Old Pochmann | UR (B) | UL (D), T and J perms | UBL (A) | RDF (P), altered Y perm |
| Orozco | UF (C) | UB helper | UFR (C) | UBR helper |
| 3-style | UF (C) | any pair, one commutator | UFR (C) | any pair, one commutator |

The site generates memo as letter pairs. Its memo advice appears once, on first use, and is then hidden: memorize corners first as images, then edges as sounds, and execute edges first.

## Method ladder

The site has four stages. Each unlocks when you meet the previous stage's exit test, and you can override the lock. The exit tests are approved as written (S7).

| Stage | What you learn | Size | Exit test |
| --- | --- | --- | --- |
| 0. Foundations | Speffz recall, cycle tracing, cycle breaks, flipped and twisted pieces, parity | 48 stickers | Letter any sticker in under 2 s at 95%; trace 5 scrambles in a row correctly |
| 1. Old Pochmann | T, Ja, Jb and altered Y perms, the parity alg, setups for every target | 22 edge and 21 corner targets | 5 blind successes in 10 consecutive attempts |
| 2. Orozco | One commutator per target on the new UF and UFR buffers. Every alg is reused in 3-style | 22 edge and 21 corner targets, each both ways | Every case under 4 s; 14 successes in 20 attempts |
| 3. 3-style | One commutator per letter pair, corners first, added in small sets by spaced repetition | 378 corner and 440 edge cases | None. Open-ended |

Each stage is taught in the same four steps: learn the algs sighted, solve sighted while reading the memo, execute with eyes closed from a displayed memo, then full blind.

Later refinements (floating buffers, parity shortcuts, 2-flip and 2-twist algs) are left for a future version.

## Practice modes

Every function below has its own screen, reached from a left-hand menu. Scrambles are random-state and cube pictures come from the open-source cubing.js library.

| Screen | What it does | Needs cube |
| --- | --- | --- |
| Home | Connection status, current stage and exit-test progress, drills due today, last 5 solves | No |
| Letter drill | Highlights a sticker on a drawn cube; you type its letter. Timed, weakest stickers repeat more | No |
| Tracing drill | Shows a scramble and confirms you applied it. You type your memo; the site checks it by simulating it, so any valid cycle-break order passes | Yes |
| Alg drill | Shows a target or letter pair. You execute it; the site confirms the result and records recognition and execution time | Yes |
| Full solve | Scramble, confirm, memo, blind execution, result with diagnosis | Yes |
| Solve review | Replays a past solve target by target and marks where it diverged | No |
| Letter pairs | All 552 pairs in a grid. Shows your image and the suggestions for each; you add or edit your own here (proposed, Q10) | No |
| Alg sheet | Every alg for the stage with your stats per case. You can replace any alg with your own | No |
| Progress | Success rate, memo and execution times, and case coverage over time | No |
| Settings | Cube MAC, export and import of data, reset | No |

**Full solve timing.** Memo time starts when the scramble is confirmed complete. Your first turn ends memo and starts execution. Execution ends only when you press space. The site then reads the cube and reports success or DNF. After a DNF it asks you to type the memo you used; you never type it before or during the solve.

**Alg drill scheduling.** Cases come back on a spaced-repetition schedule (ts-fsrs). A case counts as correct only if the cube ends in the right state, and slow cases are rated harder. An execution error in a full solve puts that case back in the queue; memo and recall errors do not.

**Letter-pair ideas.** Wherever a letter pair is shown, clicking it opens a small panel. Your own image for that pair comes first, then the bundled suggestions, with a box to save or change your image. The panel is disabled from scramble confirmation until the end of a timed Full solve, and works again in the result and in Solve review.

## Error diagnosis

After a DNF the site names the first target that went wrong and the kind of mistake. This is the main reason to use a smart cube for BLD.

From the scramble, your stage and your buffers, the site computes the cube state expected after each target. It records every turn during execution and compares the live state with those checkpoints, ignoring cube orientation.

- **During execution**, the site infers each target from the state change: after a correct alg, exactly the buffer and one target have swapped.
- **After a DNF**, you type the memo you used. The site checks whether that memo would have solved the scramble and compares it with the targets you actually shot to.
- A memo typed from memory after the solve can itself be misremembered, so memo and recall verdicts are less certain than execution verdicts.

| Verdict | How it is detected |
| --- | --- |
| Memo error | The memo you type after the DNF would not solve the scramble. The first wrong letter is shown |
| Recall error | Your typed memo is right, but a clean swap went to a different target |
| Execution error | The state matches no clean swap. The turns you made are shown beside the expected alg, with a note when a setup was not undone |

Solve review shows the verdict, the target, memo and execution splits, and the full move list grouped by target.

## Data and progress

All data lives in the browser's IndexedDB on your PC. Nothing is sent anywhere.

Stored: every solve (scramble, typed memo, timestamped moves, splits, verdict), every drill attempt, the spaced-repetition state per case, your custom algs, your letter-pair images, the current stage, and the cube's MAC.

Browser data is lost if site data is cleared or you change browsers. Settings therefore offers a one-click export to a JSON file and an import that restores it. The site reminds you to export after every 50 solves.

Alg lists, lettering and the letter-pair suggestions ship as JSON files in the repo, so an alg can be corrected without touching code.

## Build phases

Six phases, each ending in something you can use. Phase 0 is a go or no-go test of the cube link.

| Phase | Delivers | Done when |
| --- | --- | --- |
| P0. Cube link | Repo, Pages deploy, Connect button, live move log and cube picture, slice-move handling | 100 mixed turns including M and wide moves, and the picture still matches your cube |
| P1. Foundations | Home, Settings, Letter drill, Tracing drill, memo generator for OP buffers, letter-pair ideas panel and Letter pairs screen | The site's memo solves 1,000 random scrambles in simulation |
| P2. OP solving | OP alg sheet, Alg drill, Full solve with splits and success or DNF | You complete a timed attempt end to end |
| P3. Diagnosis | Checkpoints, the three verdicts, Solve review, Progress, export and import | Planted errors of each kind are named correctly |
| P4. Orozco | UF and UFR memo generator, Orozco alg sheet and drills, stage gating | Same tests as P1 to P3 on the new buffers |
| P5. 3-style | Letter-pair case sets, spaced repetition across 818 cases, coverage view | Pair drills run; diagnosis works at pair level |

P0 to P3 give you everything needed for a first success. P4 and P5 can wait until you are close to the OP exit test.

## Open questions

Three questions remain. None blocks P0. Q9 and Q10 need a ruling before P1; Q6 before P4.

- [ ] **Q6. Alg sources.** OP algs are standard. Orozco and 3-style lists need a seed. At P4 Claude shortlists two public sheets and Rajiv picks one.
- [ ] **Q9. Source of the letter-pair list.** CoLPI blocks automated access, and no open license could be confirmed on any curated BLD list. Proposal: an original list written for this project, 2 to 3 concrete, family-friendly images per pair, generated offline and committed as JSON.
- [ ] **Q10. Letter pairs screen.** Proposal: add the browse-and-edit grid described in Practice modes, so your images can be managed outside a drill.
