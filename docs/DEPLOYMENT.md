# Deployment: where these games should live, and how to put them there

**Recommendation: GitHub Pages.** Free forever, no account beyond the GitHub
one this repository already uses, no server, no cold starts, and one click to
turn on. The URL will be:

```
https://trungnguyen87.github.io/Kids_Math_Games/
```

Everything below is the reasoning, then the click-by-click steps.

---

## 1. Why not Streamlit

Streamlit was the right call for getting twelve working games in front of a
child in weeks. It is the wrong call for *these* games now, for four reasons
that all show up as things a nine-year-old notices.

**Every tap is a network round-trip.** Streamlit's model is: the browser sends
an event, the server re-runs the whole Python script, and the new page is
streamed back. That is fine for a form. For a 60-second speed round it means
the child's tap is measured with the network in the loop, and the "answered in
1.2 seconds" bonus is partly measuring the wifi.

**The clock has to be faked.** `Bliksemronde` and `Getallenjacht` ran their
countdown in an `st.fragment(run_every=1)` — one server round-trip per second,
stepping one whole second at a time. The answer buttons had to sit *outside*
that fragment because a rerun landing between render and click would swallow
the tap. That is a lot of care spent working around the platform.

**The app goes to sleep.** On Streamlit Community Cloud an app with no traffic
is suspended, and the next visitor gets a "this app has gone to sleep, click to
wake it" screen and then a cold start. For a child opening a bookmark after
school, that is the difference between playing and giving up.

**It cannot work offline.** No wifi, no games — in the car, at a grandparent's
house, on a school trip.

None of this is a criticism of the Streamlit version. It did its job. But the
games are now interactive, animated and timed, and that is a client-side job.

## 2. What was compared

| Option | Cost | Sleeps? | Offline | Account needed | Deploy |
|---|---|---|---|---|---|
| **GitHub Pages** ✅ | Free, public repos | No | Yes (PWA) | The GitHub one you have | Push to `main` |
| Cloudflare Pages | Free tier | No | Yes | New Cloudflare account | Connect repo |
| Netlify | Free tier, 300 build-min/mo | No | Yes | New Netlify account | Connect repo |
| Vercel | Free tier, non-commercial only | No | Yes | New Vercel account | Connect repo |
| Streamlit Community Cloud | Free | **Yes** | No | Streamlit account | Push to `main` |
| itch.io | Free | No | Partly | itch.io account | Upload a zip |

Cloudflare Pages and Netlify are genuinely good and would work fine. GitHub
Pages wins here on one specific ground: **it needs nothing new.** The code is
already on GitHub, the repository is already public, and there is no second
account, no second dashboard, and no second set of credentials to lose. For a
project maintained in evenings, that matters more than the CDN benchmarks.

Worth knowing: GitHub Pages is free for **public** repositories on every plan.
This repository is public, so there is nothing to pay. (If it were ever made
private, Pages would need a paid GitHub plan — that is the one thing that would
change the recommendation.)

Soft limits, none of which this app will approach: 1 GB published site, 100 GB
bandwidth a month, 10 builds an hour. The whole app is well under 1 MB.

## 3. What changes, honestly

The migration is not free. Two things genuinely change:

**Results are now per device.** The Streamlit version wrote
`logs/all_sessions_log.csv` on the server, which meant one shared history — and
also meant it was wiped on every redeploy. The web version stores results in
the browser's own storage, which is better in three ways (it survives
redeploys, it survives being offline, and no child's data ever leaves their
device) and worse in one: a tablet and a laptop keep separate histories. The
parent dashboard therefore has a prominent **CSV export**, and the exported
columns are identical to the ones the Streamlit version wrote, so old and new
exports open side by side.

This also settles, for free, most of the privacy questions in
[PLATFORM_ROADMAP.md](PLATFORM_ROADMAP.md) §6: there is no server, no third
party, no analytics and no external fonts or CDNs on a page a child sees.

**Clearing browser data clears progress.** "Clear cookies and site data" wipes
scores, levels and history. The CSV export is the answer; the dashboard says so
on the page.

The classroom platform in the roadmap will still need a real backend. Nothing
here blocks that — the question generators, the level curve and the objective
map are all still plain, portable logic, and a static front-end can talk to an
API whenever one exists.

---

## 4. First deployment — do this once

**Time: about three minutes.** You need admin on the repository, which you have.

### Step 1 — Get the code onto `main`

The web app lives in the `web/` folder and the workflow that publishes it in
`.github/workflows/deploy-pages.yml`. Both need to be on the default branch:

```bash
git checkout main
git pull origin main
git merge claude/game-deployment-platform-4sln0n   # or merge the pull request on github.com
git push origin main
```

If you are working through a pull request instead, just merge it in the GitHub
UI — same thing.

### Step 2 — Turn Pages on

1. Open **https://github.com/TrungNguyen87/Kids_Math_Games/settings/pages**
   (or: repository → **Settings** → **Pages** in the left sidebar).
2. Under **Build and deployment**, find **Source**.
3. Change it from *Deploy from a branch* to **GitHub Actions**.

That is the whole configuration. There is nothing to save — the dropdown
applies immediately.

> **Why "GitHub Actions" and not "Deploy from a branch"?** The branch option can
> only publish the repository root or a `/docs` folder. The app lives in
> `web/`, and moving it to the root would put `app.py`, `utils/` and `tests/`
> on the public web too.

### Step 3 — Run the first deployment

The workflow runs automatically on any push that touches `web/`. To run it now
without waiting for one:

1. Go to the **Actions** tab.
2. Pick **Deploy to GitHub Pages** in the left-hand list.
3. Click **Run workflow** → **Run workflow** (leave the branch as `main`).

It takes roughly 40 seconds. A green tick means it is live.

### Step 4 — Open it

```
https://trungnguyen87.github.io/Kids_Math_Games/
```

The link is also shown on the Actions run page and under Settings → Pages.

> **The first visit can 404 for a minute or two.** GitHub's CDN needs a moment
> the very first time a site is published. Wait, then hard-refresh
> (`Ctrl`/`Cmd` + `Shift` + `R`).

### Step 5 — Check it actually works

Open the site and confirm:

- [ ] The home page lists all twelve games as tiles.
- [ ] A game opens and a question appears.
- [ ] Answering with the on-screen number pad scores a point.
- [ ] The 🇳🇱 / 🇬🇧 buttons in the sidebar change the language.
- [ ] **Ouder Dashboard** shows the question you just answered.
- [ ] Turn wifi off, reload — the app still opens. (This needs one prior visit,
      so the service worker has installed.)

---

## 5. Updating the site

Push to `main`. That is the whole process.

```bash
git add -A
git commit -m "Make the pizza slices bigger"
git push origin main
```

The workflow re-runs and the site updates in under a minute. Watch it in the
**Actions** tab.

### How a child actually receives the update

The app installs a **service worker**, which caches everything so it works
offline. That cache is named after the commit SHA, stamped in at deploy time by
the workflow:

```yaml
- name: Stamp the build id into the service worker
  run: sed -i "s/__BUILD_ID__/${GITHUB_SHA::12}/" web/sw.js
```

A new commit means a new cache name, which means the next visit re-downloads
everything and throws the old copy away. The child sees a small "there is a new
version, reload the page" note; the next reload after that is the new version.

**This is why you should never edit files directly in the GitHub web UI and
expect an instant update** — the mechanism works, but it needs a fresh commit,
which the web editor does create. It is fine. Just do not be surprised that the
old version survives until one reload after the deploy.

### If an update seems stuck

On the device that is stuck:

- Hard-refresh: `Ctrl`/`Cmd` + `Shift` + `R`.
- Or: browser settings → clear site data for the site, then reload. (This also
  clears saved scores — export the CSV from the dashboard first.)

---

## 6. Putting it on a child's device

The site is a **PWA**: it can be installed to the home screen and then opens
full-screen with no browser bars, exactly like an app. There is no app store
and nothing to pay.

**iPad / iPhone (Safari — note this only works in Safari, not Chrome on iOS)**
1. Open the site in Safari.
2. Tap the **Share** button (the square with an arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.

**Android (Chrome)**
1. Open the site.
2. A **"Add to your home screen"** button appears at the bottom for a few
   seconds — tap it.
3. Or: **⋮** menu → **Add to Home screen** / **Install app**.

**Chromebook / Windows / Mac (Chrome or Edge)**
1. Open the site.
2. Click the **install icon** in the address bar (a screen with a down arrow),
   or **⋮** → **Cast, save and share** → **Install page as app**.

**Anything else** — a bookmark works fine. Installing only adds the full-screen
window and the home-screen icon.

Once installed, open it once with wifi on. After that it works with the wifi
off.

---

## 7. Optional: a nicer address

`trungnguyen87.github.io/Kids_Math_Games` is long for a child to type. Two ways
to shorten it, neither required.

**A free `github.io` root address.** Create a second repository named exactly
`trungnguyen87.github.io`, and anything published from it is served at
`https://trungnguyen87.github.io/`. Only worth it if you want this app to be
the only thing at that address.

**Your own domain** (about €10/year at any registrar):

1. Buy the domain, e.g. `rekenspelletjes.nl`.
2. At the registrar's DNS panel, add either:
   - four `A` records for the apex (`@`) pointing at `185.199.108.153`,
     `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; or
   - one `CNAME` record for `www` pointing at `trungnguyen87.github.io`.
3. In **Settings → Pages → Custom domain**, enter the domain and click
   **Save**. This writes a `CNAME` file into the published site.
4. Wait for the DNS check to go green, then tick **Enforce HTTPS**.

GitHub issues the certificate; there is nothing to renew.

---

## 8. Working on it locally

No build step and no dependencies to install — but you do need a *server*,
because ES modules and service workers refuse to load from a `file://` URL.

```bash
npm start                  # serves web/ at http://127.0.0.1:8080
```

or, with Python instead of Node:

```bash
python3 -m http.server 8080 --directory web
```

Then open http://127.0.0.1:8080.

Editing a file and reloading is the whole edit loop. Note that the service
worker caches aggressively; while developing, open DevTools → **Application** →
**Service Workers** and tick **Bypass for network**, or use a private window.

### Before you push

```bash
npm test              # 62 logic tests: generators, scoring, levels, i18n
npm run check:precache # every shipped file is in the service worker's list
```

And, with the local server running, the full browser pass:

```bash
npm run test:smoke    # every route, real gameplay, i18n, timers, mobile, offline
```

`check:precache` matters more than it looks: if you **add a file** under `web/`
and forget to add it to the `PRECACHE` list in `web/sw.js`, the app works
perfectly in testing and then fails offline, on that one file, in front of a
child. CI runs this check before every deploy for exactly that reason.

If you change any text, edit it in `utils/i18n.py` — that is still the single
source of truth for both languages — and regenerate:

```bash
npm run gen:i18n      # rewrites web/js/i18n-data.js from utils/i18n.py
```

The generator refuses to run if a key exists in one language and not the other.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 404 at the Pages URL | Pages not switched to *GitHub Actions*, or the first publish is still propagating | Settings → Pages → Source = GitHub Actions; then wait 2 minutes and hard-refresh |
| Workflow fails at *Verify the service worker precache list* | A file under `web/` is missing from `PRECACHE` in `web/sw.js` | The error names the file; add it to the list |
| Blank page, console says "Failed to load module" | A file was renamed but an import still points at the old name | Check the browser console; it names the path |
| The site loads but shows an old version | Service worker cache | Hard-refresh once. If it persists, clear site data |
| Games work online but not offline | The service worker has not installed yet, or the site was opened from `file://` | Visit once over HTTPS with a network, then try offline |
| No sound | Browsers block audio until the page has been tapped once | Tap anything. Also check the 🔊 toggle in the sidebar |
| Scores vanished | Browser data was cleared, or a different browser/device | Restore from a CSV export, or accept the reset — and export regularly |
| Workflow does not run on push | The push did not touch `web/` | Actions tab → Deploy to GitHub Pages → Run workflow |

---

## 10. What is deployed, exactly

```
web/
├── index.html               the only HTML file; everything else is routed in the browser
├── manifest.webmanifest     name, icons and colours for "add to home screen"
├── sw.js                    service worker: the offline cache
├── css/app.css              the whole stylesheet
├── icons/                   app icons (SVG + PNG, including a maskable one)
└── js/
    ├── main.js              entry point
    ├── router.js            hash router (#/tafel), so every URL is refreshable
    ├── shell.js             the drawer, score panel and top bar
    ├── i18n.js              translations; i18n-data.js is generated from utils/i18n.py
    ├── state.js             score, levels, streaks, profiles (localStorage)
    ├── log.js               the attempt log and CSV export
    ├── visuals.js           the animated SVG library
    ├── charts.js            the two dashboard charts
    ├── fx.js                confetti, toasts, level-up cards
    ├── sound.js             Web Audio sound effects
    ├── games/               one file per game
    └── pages/               home, explainer, parent dashboard
```

Nothing is bundled, minified or transpiled. What is in the repository is what
the browser runs — which means anyone (including a future you) can open
DevTools on the live site and read exactly the code that is in `web/`.

---

## 11. The Streamlit app is still here

`app.py`, `pages/` and `utils/` are untouched and still run:

```bash
pip install -r requirements.txt
streamlit run app.py
```

They are kept deliberately for now, as the reference the port was checked
against, and because `utils/i18n.py` is still the source of truth for the copy
in both apps. Once the web version has been used for a few weeks and nothing is
missing, the Streamlit half can be deleted — that is a decision to make on
evidence, not on the day of the migration.
