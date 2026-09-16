# Reken Spelletjes voor Groep 6 & 7

Twelve maths games for Dutch primary-school children aged roughly 9–11, in
Dutch and English, with six difficulty levels each and a dashboard for parents.

**Play:** https://trungnguyen87.github.io/Kids_Math_Games/
*(after the one-time setup in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §4)*

Free, no account, no ads, nothing to install — and it works offline once
opened. Nothing a child types or answers ever leaves their device.

---

## The games

| | Game | Trains |
|---|---|---|
| ✖️ | **Tafel Monster** | Times tables, missing factors, division, word problems |
| 🍕 | **Breuken Baas** | Adding, subtracting, simplifying and multiplying fractions |
| 📏 | **Meten is Weten** | Units, time intervals, money |
| 💯 | **Procenten Puzzel** | Percentages, fractions and decimals as one idea |
| 🕵️ | **Het X-Mysterie** | Solving equations, up to two unknowns |
| 📐 | **Meetkunde Meesters** | Perimeter, area, volume, angles |
| 🚗 | **Verhoudingen & Snelheid** | Ratios, scale, speed, unit prices |
| 🔢 | **Getallen Universum** | Negative numbers, long multiplication and division, decimals |
| ⚡ | **Bliksemronde** | Instant recall, against a 60-second clock |
| 🎯 | **Getallenjacht** | Number properties, from the recognition side |
| 🧠 | **Logica Lab** | Sequences, odd-one-out, deduction, magic squares |
| 🔐 | **Code Kraker** | Pure elimination reasoning (Mastermind with digits) |

Plus **📖 Uitleg Concepten**, a reference a child can open mid-game, and
**📊 Ouder Dashboard** — accuracy per game, questions per day, the full log and
a CSV export.

Every game starts at a gentle warm-up level and gets harder after three correct
answers in a row, easier after two wrong ones. A child can also just tap the
level they want.

## Two front-ends

| | Where | Status |
|---|---|---|
| **`web/`** | Static site, deployed to GitHub Pages | **Current.** All twelve games. |
| `app.py`, `pages/`, `utils/` | Streamlit | Reference implementation, still runs |

The web version was ported from the Streamlit one and keeps its question
generators, level curves, scoring, badges and both languages exactly. What
changed is everything a child feels: real-time clocks instead of one-second
server ticks, an on-screen number pad instead of a desktop spinner, canvas
confetti, Web Audio sound, instant answers, and offline play.

`utils/i18n.py` is still the single source of truth for all 473 strings in both
languages; `web/js/i18n-data.js` is generated from it.

Why this platform and not Streamlit: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §1.

## Running it locally

The web app has no build step and no dependencies — but it does need a server,
because ES modules and service workers will not load from a `file://` URL.

```bash
npm start        # http://127.0.0.1:8080
```

or

```bash
python3 -m http.server 8080 --directory web
```

The Streamlit version, if you want to compare:

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Tests

```bash
npm test                 # 62 logic tests - generators, scoring, levels, i18n parity
npm run check:precache   # every shipped file is in the service worker's cache list
npm run test:smoke       # real Chromium: every route, gameplay, i18n, timers, mobile, offline
```

The logic tests run each question generator several hundred times per level,
because the bugs worth catching are the ones that need an unlucky draw: a
triangle whose third angle comes out negative, a division that does not divide,
a fraction the child cannot type into a whole-number box.

## Documentation

- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — why GitHub Pages, click-by-click
  setup, updating, installing on a child's tablet, troubleshooting.
- **[docs/PLATFORM_ROADMAP.md](docs/PLATFORM_ROADMAP.md)** — the plan for turning
  this into a classroom platform: pupil accounts, objective tracking, exams.
- **[CHANGELOG.md](CHANGELOG.md)** — what changed.
- **[SESSIONS.md](SESSIONS.md)** — why, and what was learned along the way.

## Privacy

There is no server and no account. Scores, levels and the answer log live in
the browser's own storage on the child's device. No analytics, no ad tech, no
third-party fonts or CDNs on any page a child sees. The parent dashboard can
export everything as CSV and delete everything with two clicks.
