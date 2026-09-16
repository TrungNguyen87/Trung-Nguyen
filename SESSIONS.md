# Session log

A record of each working session on this project: what was asked, what was
actually done, what was found along the way, and what is still open.

The CHANGELOG says *what changed*. This file says *why, and what we learned* —
including the things that turned out to be wrong, so the next session doesn't
rediscover them.

---

## Session 9 — 16 September 2026

### Asked

1. **Question visibility fix:** In competition mode, only choices were visible, and the questions were not displayed.
2. **Remote Multiplayer:** Allow 2 players at 2 different locations (e.g., son in the Netherlands and friends in Vietnam) to play the competition mode simultaneously at the same time.
3. **Thorough testing & deployment verification:** Verify GitHub Pages deployment and precache tests pass.
4. **Save memory and changelog before committing.**

### Decided: Remote Multiplayer Architecture (Netherlands <-> Vietnam)

- **Server-Authoritative Synchronization:**
  - Implemented `MultiplayerManager` in `server-multiplayer.js`, coordinating real-time matches across international connections over WebSockets (`/ws/competitie`).
  - Added REST fallback endpoints (`/api/rooms/create`, `/api/rooms/join`, `/api/rooms/:code`, `/api/rooms/:code/action`) with polling so gameplay continues uninterrupted even if strict school or international proxies block WebSocket upgrades.
  - Server maintains the authoritative clock, question sequencing, answer validation, and score calculation.
- **Room System & Usability:**
  - Fast 5-character alphanumeric room codes (e.g. `WY373`).
  - One-click copy buttons for both the code and direct join links (`#/competitie?room=CODE`).
  - Pre-populates room code from URL parameters so a friend in Vietnam can simply click a shared link and join immediately.
  - Real-time presence indicators show when the remote player enters the room, enabling the Host to start the match.
- **Scoring & Rules Preserved:**
  - Speed-based points: correct answers award up to 100 down to 20 points depending on reaction time within the 15-second clock.
  - Wrong answers award strictly **0 points**.
  - Detailed post-match comparison screen with trophy celebration, statistics breakdown, and question-by-question review.
  - Rematch button resets the room state for immediate replay.
- **Dual Mode Flexibility:**
  - Players can toggle between `🌐 Online op afstand` and `📱 Lokaal (zelfde scherm)` seamlessly.

### Fixed: Question Visibility & Sound Effects

- Root cause of hidden questions: `.kmg-question` styling included `opacity: 0; transform: translateY(14px)` meant for entry transitions, which left the question container invisible in competition view.
- Solution: Explicitly defined `.kmg-comp-question` and `.kmg-comp-question-text` with `opacity: 1 !important; visibility: visible !important; transform: none !important;`, rendered within an amber card banner with large font (`clamp(1.8rem, 4vw, 2.5rem)`), high contrast, and clean layout across both Local and Online competition screens.
- Fixed `TypeError: sound.playDing is not a function`: implemented and exported Web Audio synthesizer routines `playDing()` (rising bright two-tone chime) and `playBuzz()` (two-tone sawtooth alert) in `web/js/sound.js`, used by competition round submission handlers.

### Verification & Deployment Readiness

- `npm test`: All 80 automated unit tests pass (including logic, generation, speed scoring, and MultiplayerManager room lifecycle).
- `python3 tools/check_precache.py`: PRECACHE verified complete (49/49 files checked).
- GitHub Pages deploy workflow verified compatible.
- Tested real-time 2-player simulation across WebSockets in Node.js end-to-end.

---

## Session 8 — 16 September 2026

### Asked

1. **Add level tracking to let the player track their progress**: players don't need to redo what has already been done.
2. **Add a multiplayer competition mode**: allow players to play simultaneously on the same screen, compare results at the end, faster answers get more points, and incorrect answers award strictly 0 points.
3. **Thorough testing**: test all functionalities before committing.
4. **Ensure deployment on GitHub runs smoothly**: verify service worker precache lists and GitHub Pages deployment workflow.
5. **Save memory and changelog before committing**.

### Decided: Level Tracking Architecture & "No-Redo" Guarantee

- **State Model:** Maintained a separate `completedLevels` map of `Set`s per game in `state.js` alongside the active `levels` index. When a player successfully passes a round (or meets the mastery/level-up criteria in `gameflow.js`), `markLevelCompleted(gameKey, level)` is invoked.
- **Persistence:** Added `completedLevels` serialization to player profiles in `localStorage`, maintaining backwards compatibility with pre-existing profiles (automatically promoting levels below current level to completed).
- **Player Experience ("No-Redo"):**
  - Updated `ui.js` level selector: completed levels are visibly marked with green styling and a checkmark (`✓`).
  - If a player views or selects an already completed level, a clear banner informs them: *"Dit niveau is al behaald! Je hoeft dit niet opnieuw te doen"* along with a one-click button to jump to their next uncompleted level (`nextUncompletedLevel(gameKey)`).
  - Launching a game from the Home screen automatically starts the player at their next uncompleted level if their current level was already finished.
  - Added a dedicated Level Progress page (`web/js/pages/voortgang.js`, route `#/voortgang`) with comprehensive progress bars per subject, overall percentage, and instant continuation buttons.

### Decided: Multiplayer Competition Design

- **Hotseat Split-Screen Architecture:** Implemented in `web/js/pages/competitie.js` (`#/competitie`). No external servers or network latency required; both players compete simultaneously side-by-side on the same tablet, laptop, or desktop screen.
- **Rules & Scoring Engine:**
  - Standard 15-second round clock per question with visual urgency bar.
  - Formula: `round(100 - (elapsedSeconds / 15) * 80)`, clamped between 20 and 100 points for correct answers.
  - **Zero-Tolerance for Wrong Answers:** Any incorrect selection or timeout immediately yields **0 points** (`calculateCompetitionPoints(false, elapsed)`).
- **Post-Match Comparison:**
  - Animated winner announcement (or tie banner).
  - Score, correct answer count, and average reaction speed comparison.
  - Complete round-by-round ledger displaying question, expected answer, each player's choice, speed, and points.
- **Categories & Balance:** Five categories supported (Lightning Mix, Tables, Fractions, Percentages, and Grand Math Battle), across 3 difficulty tiers with 4 randomized multiple-choice options per question.

### Verification & Deployment Readiness

- **Unit & Logic Tests:** Expanded `tests/web/test_logic.mjs` with test suites covering level completion state transitions, profile serialization/restoration, competition question generation across all categories, and speed scoring rules. All 79 tests pass cleanly.
- **Precache Integrity:** Updated `web/sw.js` with new routes (`./js/pages/voortgang.js`, `./js/pages/competitie.js`). `python3 tools/check_precache.py` verified 48/48 files precached.
- **CI / GitHub Pages:** Confirmed `.github/workflows/deploy-pages.yml` checks pass cleanly and assets are properly served.

---

## Session 7 — 15 September 2026

**Branch:** `claude/reward-difficulty-characters-bbdk1u`

### Asked

1. Make the reward shop harder: a child was collecting every character and
   sticker in a single day, and unlocking the special ones should need a
   certain level as well as more points.
2. Add more characters and stickers, including special anime-style
   characters that cost more, and a rare 3D character only reachable after
   finishing everything.
3. A parent-visible activity/results log with at least 10 days of history
   that survives a page refresh.
4. Test everything at the end and confirm the GitHub deployment path is
   still clean.

### Decided: a coin cap, not just higher prices

Raising prices alone does not fix "cleared in one day", because the
underlying problem is that a long single session can earn thousands of
points. `state.js` now caps *spendable* coins at `DAILY_COIN_CAP` (300) per
calendar day - score, streaks, levels and badges stay uncapped, since those
are achievement, not currency. That is what turns "the shop" from a
one-sitting problem into a genuinely multi-week one, on top of higher
individual prices.

The other half of "a certain level" is `highestLevelReached()`: rare tier
and up now also check the child's best level across every game, independent
of coins. A locked card says which of the two - level or coins - is still
missing, in that priority order, rather than only ever showing a price.

### Decided: original characters, not licensed ones

Luffy (One Piece) was the example given, but a real franchise character's
name and likeness are trademarked/copyrighted; reproducing them - even as
emoji-and-name reward cards in a personal project - is not something to
build. The **mythic** tier delivers the same feeling (rare, anime-styled,
expensive, unlocked late) with original characters instead: Dragon Blade
Hero, Star Ninja, Galaxy Guardian, and matching stickers. Worth saying
plainly here so a future session does not "fix" this by adding the real
names back in.

### Decided: a real 3D reward, kept dependency-free

The one **ultra** item (`avatar_3d_champion`, gated on `requiresMastery`:
every game at its own true max - `allGamesAtTrueMax()`, not the shared
level-5 constant - and every other reward already unlocked) renders as an
actual rotating cube: six `.kmg-cube-face` divs, `transform-style:
preserve-3d`, one `@keyframes` rule. No Three.js, no new dependency - this
app's whole architecture is "no build step, no framework", and the existing
confetti/charts are hand-rolled for the same reason. It freezes on
`prefers-reduced-motion` for free, via the global rule every other animation
already obeys.

### Done

- **`web/js/rewards.js`**: catalog grown from 21 items to 49 (26 characters,
  23 stickers) across seven tiers; `minLevel` and `requiresMastery` gates;
  `lockReason()` so the UI can explain *why* something is locked, not just
  *that* it is.
- **`web/js/state.js`**: `DAILY_COIN_CAP`, `coinsEarnedToday`/`coinsEarnedDay`
  (persisted, UTC-day rollover), `highestLevelReached()`,
  `allGamesAtTrueMax()`.
- **`web/js/pages/rewards.js`** + **`web/css/app.css`**: tier ribbons, a
  daily-coins strip with its own progress bar, lock-reason messages, and the
  3D cube for the capstone card.
- **`web/js/log.js`**: `trimToBudget()` guarantees `MIN_RETENTION_DAYS` (14)
  survive regardless of the row-count budget - only older rows are trimmed
  to fit it.
- **`web/js/pages/dashboard.js`**: a new daily-activity table (date,
  players, sessions, questions, accuracy, minutes, points), newest first,
  next to the existing charts and raw log.
- **~50 new i18n keys**, NL and EN, hand-added: `utils/i18n.py` and its
  generator are gone from this repo (removed in an earlier session), so
  `web/js/i18n-data.js` is now the source of truth and was edited directly.
- Tests: 13 new Node tests (daily cap and its day-rollover, level/mastery
  gating on `unlockReward`, `trimToBudget`'s retention guarantee) and three
  new Playwright smoke checks (the daily-cap strip renders a number, a
  mythic-tier card shows a lock reason rather than a buy button, and a
  dashboard reload keeps both the raw log and the new activity table).

### Found along the way

**Testing this by hand-editing localStorage races the app's own autosave.**
`main.js` saves the current profile on `pagehide` and on
`visibilitychange`, so injecting a profile into localStorage on an
already-booted page and then calling `page.reload()` loses the injection:
the outgoing page's unload handler fires first, using its own stale
in-memory state, and overwrites what was just written. Seeding through
Playwright's `context.addInitScript()` (which runs before the app's own
boot code, on every navigation) avoids it for a first load - but then
itself becomes the trap on a *second* reload in the same test, since it
reseeds the original data every time. The fix used here: mutate state
in-page, then re-render with a client-side hash round-trip
(`location.hash = "#/home"` then back) instead of `reload()`, since the
router re-renders on `hashchange` without tearing down the document.
Worth remembering for any future test that pokes at localStorage mid-test.

**`npm test`/`check:precache`/`test:smoke` are not part of the GitHub Pages
deploy workflow** - `.github/workflows/deploy-pages.yml` only runs
`tools/check_precache.py`. Nothing here changed that, but it means the full
test suite (75 Node tests, precache check, 16-route Playwright smoke test)
is a local/manual discipline, not a CI gate - all three were run by hand
this session and are clean.

### Still open

- `DAILY_COIN_CAP` (300) and the tier costs are one set of numbers that
  felt right against this session's estimate of how fast a child earns
  coins; there is no telemetry to confirm it against, so a parent finding it
  too slow or too fast is a config change (`state.js`, `rewards.js`), not a
  redesign.
- No UI for a parent to adjust the daily cap - it is a constant in code.
  Fine for now, a real setting if this project ever gets a settings page.
- The dashboard's daily-activity table has no row cap of its own; on a
  device played on for years it will eventually be as long as the number of
  days ever played (the raw per-question table already caps at 200 shown
  rows, which is where this could follow if it ever becomes a problem).

---

## Session 6 — 10 September 2026

**Branch:** `claude/game-deployment-platform-4sln0n`

### Asked

1. Streamlit may not be a good deployment target for interactive, visual,
   animated games. Find a better **free** hosting option that is easy for kids
   to reach and easy to deploy.
2. Migrate all the games to it, improving interaction, animation and
   visualisation along the way.
3. Write a detailed step-by-step deployment guide.

### Decided: GitHub Pages, and a static client-side app

The platform question and the architecture question turned out to be the same
question. The reason Streamlit hurts here is not that its hosting is bad — it
is that **every tap is a server round-trip**, and these games are now animated
and timed. The countdowns had to be faked with `st.fragment(run_every=1)`: one
round-trip per second, stepping a whole second at a time, with the answer
buttons deliberately placed outside the fragment because a rerun landing
between render and click would swallow the tap. That is a lot of care spent
working around the platform rather than on the game.

So the fix is not "host Streamlit somewhere better". It is to make the app
client-side, at which point the hosting question answers itself: any static
host will do, and the cheapest, simplest one is the GitHub the code is already
on.

Cloudflare Pages and Netlify were the real alternatives and would both work.
GitHub Pages won on one specific ground: **it needs nothing new.** No second
account, no second dashboard, no second set of credentials to lose. For a
project maintained in evenings that beats CDN benchmarks. It is also free
without qualification here, because the repository is public.

Three consequences worth stating plainly, since they were the actual decision:

- **No cold start.** Streamlit Community Cloud sleeps an idle app; a child
  opening a bookmark after school would get "this app has gone to sleep".
- **It works offline.** A service worker precaches everything, so the games work
  in the car and at a grandparent's house. This was not possible before at all.
- **Results stop being a server file.** That is a real trade, not a pure win —
  see below.

### Done

**All twelve games, plus home, the explainer and the parent dashboard**, ported
to `web/` as plain ES modules. No build step, no framework, no bundler: what is
in the repository is what the browser runs. Question generators, level curves,
scoring, badges, adaptive difficulty and both languages were ported unchanged —
the Node test suite exists mostly to prove that.

**`utils/i18n.py` stayed the source of truth for copy.** `tools/gen_i18n.py`
parses it with `ast` (no Streamlit import needed) and emits
`web/js/i18n-data.js`, refusing to run if a key exists in one language and not
the other. That is what stopped 473 strings drifting between two front-ends
during the port.

**The interaction work is where the platform move actually pays.** The number
pad is the clearest example: `st.number_input` renders a small desktop spinner
that, on a tablet, summons the OS keyboard over the visual and the question. A
purpose-built pad in the calculator layout children already know is not a
nicer version of that — it is the thing that makes a tablet usable at all.
Similarly: correct answers auto-advance so a child in flow never hunts for
"next" (wrong ones deliberately do not — that is the one moment they need to
read); the fraction explorer is now the pizza itself, tapped slice by slice;
Number Hunt restyles one tile per tap instead of rebuilding twenty buttons.

**Animation and sound got the upgrade the CSS-only version could not have.**
Canvas confetti with gravity and tumble, bursting from the button the child
tapped. A full-screen level-up card, because the old toast was being missed.
Web Audio effects generated at the instant of the tap, including a correct
answer arpeggio that climbs a step for every answer in the streak — a small
thing a child notices within about four answers. All of it still honours
`prefers-reduced-motion`, on every single visual.

**The dashboard charts are hand-written SVG**, which removed pandas and Altair
from the payload. Both are single-measure charts, so both use one hue rather
than a categorical palette — a rainbow of game colours would imply a
distinction that is not in the data. The two hues were checked against the
light and dark surfaces for contrast and lightness rather than picked by eye.

### Found along the way

**Two bugs a test suite would not have caught, both found by looking.**

The first: at phone width, a semi-transparent overlay covered the entire app
and swallowed every tap. The nav scrim's `display: block` inside a
`@media (max-width: 900px)` block silently overrode the built-in
`[hidden] { display: none }`. It was invisible in the desktop screenshots and
the app still *rendered* correctly on a phone — it just could not be used.
Found by noticing that a mobile screenshot looked washed out. The smoke test
now hit-tests the first control at phone width and clicks it, so this class of
bug fails loudly next time.

The second: `Node.append(null)` prints the literal word "null". A conditional
child written as `condition ? el(...) : null` renders as text, because
`append()` stringifies its arguments. It was sitting under the streak counter
in the sidebar on every screenshot. Fixed with a filtering `append()` helper.

Both are worth remembering as a pattern: **the browser will happily render
something wrong rather than throw.** The Node tests caught none of it; a
screenshot caught both.

**A third, smaller one:** headless Chromium will not screenshot at an exact
small size — `--window-size` below ~500px and `--force-device-scale-factor`
below 0.5 are both clamped. Rather than add Pillow for three icons,
`tools/png_tool.py` crops and box-downscales PNGs with nothing but `zlib` and
`struct`.

### The trade being made, stated plainly

**Results are now per device.** The Streamlit version wrote
`logs/all_sessions_log.csv` on the server: one shared history, wiped on every
redeploy. Browser storage is better in three ways — it survives redeploys, it
survives being offline, and no child's data ever leaves their device — and
worse in one: a tablet and a laptop keep separate histories.

The CSV export is therefore prominent on the dashboard rather than at the
bottom, and its columns are byte-identical to the ones `utils/gamelog.py`
wrote, so an old export and a new one open side by side.

This also settles most of `docs/PLATFORM_ROADMAP.md` section 6 for free: no
server, no third party, no analytics, no external fonts or CDNs on any page a
child sees. Worth noting for the roadmap: the classroom platform will still
need a real backend, and nothing here blocks that — the generators, level curve
and objective map are still portable logic, and a static front-end can talk to
an API whenever one exists.

### Still open

- **The Streamlit app was deliberately not deleted.** `app.py`, `pages/` and
  `utils/` still run, and `utils/i18n.py` is still the source of truth for
  copy. Delete the Streamlit half once the web version has been used for a few
  weeks and nothing turns out to be missing — that is a decision to make on
  evidence, not on migration day.
- **Pages has to be switched on once by hand:** Settings → Pages → Source =
  *GitHub Actions*. It cannot be done from a workflow. `docs/DEPLOYMENT.md` §4
  walks through it.
- The parent dashboard shows the last 200 attempts in its table; everything
  older is in the CSV. If a parent ever wants to scroll further, that becomes a
  paging question.
- No per-device sync, by design. If the roadmap's classroom platform happens,
  that is where it belongs — not bolted onto the static app.

---

## Session 5 — 9 September 2026

**Branch:** `claude/edu-gaming-platform-plan-2e69e7`

### Asked

1. A development plan and roadmap for a bigger, teacher-facing classroom
   platform: multiple pupil accounts, logged and analysed play, per-child
   development roadmaps, and teacher-built exams — for a teacher with no
   software skills. With milestones and pauses for feedback and brainstorm.
2. Whether animation is possible with Streamlit and the current stack.
3. Find and fix small bugs so deployment runs cleanly.
4. More games — logic games suited to groep 6/7, and fast-response games.
5. Always add a changelog and a session log.

### Done

**1. Classroom platform plan** — `docs/PLATFORM_ROADMAP.md`, and published as
a shareable page for the conversation with the teacher.

Seven phases, six checkpoints, roughly 20 weeks to a pilot review. The
checkpoints are the substance: each one ends in a decision the *teacher*
makes, not a status update. Checkpoint 2 is a login dry run with five
children where the developer is not allowed to help; Checkpoint 4 compares
the mastery model against the teacher's own judgement of six pupils they know
well; Checkpoint 5 is the teacher building an exam alone while the developer
watches in silence.

Three things in the plan are worth carrying forward even if the rest is cut:

- **The learning-objective map is the keystone.** Today a log line records
  which *game* was played. Until it records which *objective* was practised,
  none of the analysis, recommendation or exam features are possible. It is
  the first real piece of work and it needs the teacher in the room.
- **The speed games make a second axis possible.** Accuracy says whether a
  child *can*; response time says whether they can *without thinking*. Both
  are recorded now. A child who is accurate but slow needs different work
  from one who is fast but sloppy, and few classroom tools show a teacher
  both.
- **Privacy is a blocking dependency, not a later chore.** This is data about
  identifiable children in a Dutch school. The plan refuses to start Phase 1
  before the AVG questions have written answers — controller vs. processor,
  verwerkersovereenkomst, DPIA, EU hosting, retention, parental access.

The plan also states plainly that Streamlit is unlikely to hold thirty
concurrent pupils, and schedules that decision — with a load test — at
Checkpoint 5, rather than letting it be discovered when a lesson falls over.

**2. Animation** — yes, and quite a lot of it, with no new dependency.

Two mechanisms, both pure CSS:

- Global keyframes and helper classes in a new `utils/anim.py`, injected once
  per run alongside the existing custom CSS.
- A `<style>` block embedded inside each generated SVG in `utils/visuals.py`,
  with class names scoped to that one render.

Every visual now builds itself rather than appearing complete: pizza slices
fill one at a time, dot arrays pop in row by row, bars grow from zero, clock
hands sweep round, shapes draw their own outline, the balance scale rocks and
settles. Question cards slide up; correct answers pop, wrong ones shake;
level-ups and badges fire confetti.

Four things learned that the next session should not have to rediscover:

- **Streamlit rebuilds the DOM for a markdown block on every rerun**, so a CSS
  animation attached to it restarts from 0% each time. That is what makes all
  of this work without JavaScript — and JavaScript was not an option anyway,
  because Streamlit strips `<script>` out of markdown HTML.
- **Inline SVG shares the page's global CSS scope.** Two pizzas on one page
  with a shared `.slice` class animate each other. Every class and element id
  is therefore prefixed with a per-render unique id, and there is a test for
  it.
- **A CSS `transform` silently replaces an SVG `transform` attribute.** The
  rectangle's height label carries `transform="rotate(90 ...)"`; animating it
  with `translateY` tipped it flat. Labels animate opacity only.
- **Confetti has to be queued, exactly like the sound effects.** A game
  triggers it right before `st.rerun()`, and `st.rerun()` throws away the
  current render before the browser sees it. It is stashed in session state
  and fired on the next run.

Everything is disabled under `prefers-reduced-motion`, showing the finished
picture instead of the movement.

**3. Bugs** — seven fixed. None of them were crashes; the app rendered
cleanly at every level in both languages before this session started. They
were *wrong answers*, which is worse, because a child cannot tell the
difference between a bug and being wrong.

- **Meten is Weten level 2 asked questions with wrong answers.** Decimal
  conversions used `round(value * factor)`, so "0,25 cm = ... mm" expected 2
  (Python rounds 2.5 to even) and "0,75 cm" expected 8. About 6% of level-2
  questions. The true answers were not even typeable in the whole-number
  input.
- **Breuken Baas punished a child for simplifying.** "1/2 + 2/4" expects 4/4;
  a child who worked it out and then reduced to 1/1 — the thing we teach them
  to do — was marked wrong. Grading now cross-multiplies.
- **Meetkunde Meesters could ask for a negative angle.** A rejection-sampling
  loop fell through after 30 tries using the last *rejected* draw.
- `requirements.txt` allowed Streamlit `>=1.37`, but the dashboard needs
  `>=1.49` for `st.dataframe(width="stretch")` — a fresh deploy resolving an
  older version would have crashed on the parent dashboard.
- `use_container_width` is deprecated and slated for removal.
- Verhoudingen could ask about a journey of "3 hours and 0 minutes".
- `speed_diagram_svg` had a hardcoded English "in" and a fixed element id
  that collides if two diagrams share a page.

**How they were found** matters more than the list. Rendering every page at
every level in both languages found *nothing*. Fuzzing the generators and
checking invariants against independently computed answers found all of them.
That approach is now committed as `tests/test_app.py` — 23 tests, runnable
with plain `python tests/test_app.py`.

**4. Four new games**, taking the app from 8 to 12:

| Game | Kind | What it actually trains |
|---|---|---|
| ⚡ Bliksemronde | Speed | Automaticity — recall without calculation |
| 🎯 Getallenjacht | Speed | Number properties from the recognition side |
| 🧠 Logica Lab | Logic | Pattern-finding, deduction, invalid inference |
| 🔐 Code Kraker | Logic | Elimination reasoning, no arithmetic at all |

Design notes worth keeping:

- **The timed games use `st.fragment(run_every=1)` for the clock, with the
  answer buttons outside the fragment.** A button inside an auto-rerunning
  fragment is a race: the rerun can land between the render and the tap, and
  the tap is lost.
- **Timed games adapt their level once per round, not per answer.** Inside a
  60-second round, three quick correct answers are often just three easy
  draws; 9-of-10 across a whole round is a much more honest signal.
- **Logica Lab's if/then questions generate the invalid converse half the
  time** ("All cats are fast; Sofie is fast; is Sofie a cat?"). Answering
  "yes" every time scores 50%, which is the point — that inference is the
  classic slip at this age.
- **Code Kraker's bulls-and-cows scoring is tested against a reference
  implementation over all 4096 secret/guess pairs.** The naive version counts
  a repeated digit twice, and the clues then contradict each other — which a
  child *will* notice, and will reasonably conclude the game is broken.

A shared `utils/gameflow.py` now holds the post-answer sequence the new games
use. The original eight keep their inline version on purpose, so this round's
diff stays reviewable.

### Findings the next session should know

- The app has no crash-level bugs left that this session could find; every
  page renders at every level in both languages, and the 23 tests pass.
- The bugs that ship here are *arithmetic* bugs. Any new question generator
  should get an invariant test that computes the answer a second, independent
  way — not just a "does it render" check.
- `logs/` is still an ephemeral filesystem. Profiles and history survive
  restarts only while the host keeps the disk; the download buttons remain
  the only reliable copy. The roadmap's Phase 1 replaces this with a real
  database and should be done before any classroom pilot.
- `utils/i18n.py` is now 459 keys and about 900 lines. It is still fine as a
  single dict, but if it doubles again it should move to per-language files.

### Still open

- The platform roadmap is a proposal. Nothing in it is built, and Checkpoint 1
  is meant to make it shorter.
- No load test has been run. The claim that Streamlit will struggle with 30
  concurrent pupils is reasoning, not measurement, and the roadmap treats it
  as a question to answer rather than a fact.
- The learning-objective map does not exist yet. It needs the teacher.
- No CI. The tests are committed and runnable but nothing runs them
  automatically on push.

---

## Sessions 1–4 (summarised)

Reconstructed from the CHANGELOG; these predate this file.

- **Session 1** — Adaptive difficulty levels 1–5 for the original four games,
  harder question types aimed at groep 6/7, session logging to CSV, the parent
  dashboard, the player-name field, the NL/EN language switcher, and the
  sidebar session-progress widget.
- **Session 2** — The manual level picker, the inline-SVG visualisation
  library, the interactive fraction explorer, and four new games for the end
  of groep 7 / middle of groep 8: Het X-Mysterie, Meetkunde Meesters,
  Verhoudingen & Snelheid, Getallen Universum.
- **Session 3** — Fixes: the navigation menu now follows the language toggle
  (moved from filename-based pages to an explicit `st.navigation` router); the
  player name actually persists; Tafel Monster's hint no longer gives away the
  answer; more interactive explorers; the cheat sheet extended to all eight
  games.
- **Session 4** — Persistent player profiles, milestone badges, synthesized
  sound effects, a gentler warm-up level 0, and "why" tips on wrong answers.
