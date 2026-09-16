/**
 * Browser smoke test: open every route in a real Chromium, play a few
 * questions, and fail on any console error or unhandled rejection.
 *
 * The Node tests cover the maths. This covers the half that only exists in a
 * browser - the router, the DOM the games build, the service worker, and the
 * dozens of small ways a hand-written front-end can throw on load and still
 * look fine in a screenshot.
 *
 * Usage:
 *   node tests/web/smoke.mjs [baseUrl] [--screenshots DIR] [--headed]
 *
 * Playwright is expected to be resolvable (it is installed globally in CI and
 * in the dev container); the script says so plainly rather than crashing if
 * it is not.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "playwright is not installed. Install it with:\n  npm install -g playwright\nand re-run.",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const baseUrl = args.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:8080";
const shotIndex = args.indexOf("--screenshots");
const shotDir = shotIndex !== -1 ? args[shotIndex + 1] : null;
const headed = args.includes("--headed");

const ROUTES = [
  "home",
  "tafel",
  "breuken",
  "meten",
  "procenten",
  "algebra",
  "meetkunde",
  "verhoudingen",
  "getallen",
  "bliksemronde",
  "getallenjacht",
  "logica",
  "code",
  "competitie",
  "voortgang",
  "rewards",
  "uitleg",
  "dashboard",
];

const problems = [];
const note = (route, message) => problems.push(`[${route}] ${message}`);

const browser = await chromium.launch({
  headless: !headed,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

let currentRoute = "boot";
page.on("console", (message) => {
  if (message.type() === "error") note(currentRoute, `console error: ${message.text()}`);
});
page.on("pageerror", (error) => note(currentRoute, `page error: ${error.message}`));
page.on("requestfailed", (request) => {
  // A favicon 404 is noise; anything the app actually imports is not.
  if (!/favicon/.test(request.url())) {
    note(currentRoute, `request failed: ${request.url()} (${request.failure()?.errorText})`);
  }
});

if (shotDir) mkdirSync(shotDir, { recursive: true });

async function visit(route) {
  currentRoute = route;
  await page.goto(`${baseUrl}/#/${route}`, { waitUntil: "networkidle" });
  // The router renders after a dynamic import resolves, so wait for content
  // rather than assuming it is there when the network goes quiet.
  await page.waitForSelector("#kmg-main > *", { timeout: 8000 });
  await page.waitForTimeout(350);

  const heading = await page.locator("#kmg-main h1").first().textContent();
  if (!heading || !heading.trim()) note(route, "no <h1> rendered");

  const bootLeft = await page.locator("#kmg-boot").count();
  if (bootLeft) note(route, "the boot placeholder was never removed");

  if (shotDir) {
    await page.screenshot({ path: path.join(shotDir, `${route}.png`), fullPage: false });
  }
  return heading?.trim();
}

console.log(`Smoke-testing ${baseUrl}\n`);

for (const route of ROUTES) {
  const heading = await visit(route);
  console.log(`  ${route.padEnd(16)} ${heading ?? "(no heading)"}`);
}

// --- play a real question in a typed-answer game ---------------------------

currentRoute = "tafel:play";
await page.goto(`${baseUrl}/#/tafel`, { waitUntil: "networkidle" });
await page.waitForSelector(".kmg-question");

const scoreBefore = Number(await page.locator(".kmg-scorebox-value").first().textContent());

// Tap out an answer on the on-screen pad, exactly as a child on a tablet does.
await page.locator(".kmg-padkey", { hasText: /^7$/ }).first().click();
const typed = await page.locator(".kmg-numinput").inputValue();
if (typed !== "7") note("tafel:play", `number pad typed "${typed}" instead of "7"`);

await page.locator(".kmg-padkey-del").click();
if ((await page.locator(".kmg-numinput").inputValue()) !== "") {
  note("tafel:play", "backspace did not clear the field");
}

// Now answer correctly, by reading the question the app is actually showing.
const questionText = await page.locator(".kmg-question-text").textContent();
const [a, b] = [...questionText.matchAll(/\d+/g)].map((m) => Number(m[0]));
if (!Number.isFinite(a) || !Number.isFinite(b)) {
  note("tafel:play", `could not parse the question: "${questionText}"`);
} else {
  await page.locator(".kmg-numinput").fill(String(a * b));
  await page.locator(".kmg-btn-primary").first().click();
  await page.waitForSelector(".kmg-banner", { timeout: 4000 });

  const banner = await page.locator(".kmg-banner").first().getAttribute("class");
  const isCorrect = banner.includes("kmg-banner-ok");
  // Level 0 is "a x b" only, so a x b is genuinely the answer there; on any
  // other level the question may be a division or word problem, in which case
  // a wrong answer is the expected outcome and equally fine to observe.
  console.log(`\n  answered "${questionText.trim()}" with ${a * b} -> ${isCorrect ? "correct" : "wrong"}`);

  if (isCorrect) {
    const scoreAfter = Number(await page.locator(".kmg-scorebox-value").first().textContent());
    if (scoreAfter <= scoreBefore) {
      note("tafel:play", `score did not rise: ${scoreBefore} -> ${scoreAfter}`);
    }
  }
}

// --- reward shop: earn coins, then unlock and equip something --------------

currentRoute = "rewards:earn";
// Force a clean level 0 with a reset streak, whatever tafel:play above left
// it at: two clicks to different levels always land on the second one, since
// the level picker only skips a click that targets the already-active level.
await page.locator('.kmg-levelbtn[data-level="2"]').click();
await page.locator('.kmg-levelbtn[data-level="0"]').click();
await page.waitForTimeout(200);

// Six correct answers in a row stays inside levels 0-1, where tafel only
// ever asks straight multiplication, so "a x b" can be parsed and answered
// reliably - enough to clear the shop's cheapest item (30 coins: 3 x 5 at
// level 0, then 2 x 10 at level 1, once the third correct answer levels up).
for (let i = 0; i < 6; i++) {
  const text = await page.locator(".kmg-question-text").textContent();
  const [a, b] = [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    note("rewards:earn", `could not parse question ${i + 1}: "${text}"`);
    break;
  }
  await page.locator(".kmg-numinput").fill(String(a * b));
  await page.locator(".kmg-btn-primary").first().click();
  const ok = await page
    .waitForSelector(".kmg-banner-ok", { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    // Wrong answers do not auto-advance, and the check button then stays
    // disabled - stop here rather than hang retrying a frozen question.
    note("rewards:earn", `answer ${i + 1} to "${text}" was not marked correct`);
    break;
  }
  await page.waitForTimeout(1400); // auto-advance to the next question
}

const coinsBefore = Number(await page.locator(".kmg-scorebox-coins").first().textContent());
if (!(coinsBefore >= 30)) note("rewards:earn", `expected at least 30 coins, sidebar shows ${coinsBefore}`);

currentRoute = "rewards:shop";
await page.goto(`${baseUrl}/#/rewards`, { waitUntil: "networkidle" });
await page.waitForSelector(".kmg-reward-card");

const balanceShown = Number(await page.locator(".kmg-reward-balance-value").textContent());
if (balanceShown !== coinsBefore) {
  note("rewards:shop", `sidebar coins (${coinsBefore}) and shop balance (${balanceShown}) disagree`);
}

// Unlock the cheapest affordable item - on a fresh profile that is the first
// locked avatar card, which the shop should auto-equip.
await page.locator(".kmg-reward-card.is-locked .kmg-reward-btn:not([disabled])").first().click();
await page.waitForTimeout(300);

if (!(await page.locator(".kmg-reward-card.is-unlocked").count())) {
  note("rewards:shop", "unlocking an item did not turn any card into is-unlocked");
}
if (!(await page.locator(".kmg-reward-card.is-equipped").count())) {
  note("rewards:shop", "no card is marked equipped after unlocking a character");
}

const balanceAfter = Number(await page.locator(".kmg-reward-balance-value").textContent());
if (!(balanceAfter < balanceShown)) {
  note("rewards:shop", `balance did not drop after unlocking: ${balanceShown} -> ${balanceAfter}`);
}
console.log(`  rewards shop: ${balanceShown} coins -> unlocked an item -> ${balanceAfter} left`);

// The daily coin cap strip must render a real number - it is the thing that
// stops one long session from clearing the whole shop, so it needs to be
// visible, not just correct in state.
const dailyCapText = await page.locator(".kmg-reward-daily-value").textContent();
if (!/\d+/.test(dailyCapText ?? "")) {
  note("rewards:shop", `daily coin cap indicator did not render a number: "${dailyCapText}"`);
}

// A level-gated item still out of reach (mythic tier needs level 5; this
// profile only just reached level 2) must show a lock reason instead of a
// price, whatever coins are on hand.
const lockedMythicCard = page.locator(".kmg-reward-card.is-locked:has(.kmg-tier-mythic)").first();
if (await lockedMythicCard.count()) {
  const hasLockMessage = await lockedMythicCard.locator(".kmg-reward-lockmsg").count();
  const hasBuyButton = await lockedMythicCard.locator(".kmg-reward-btn").count();
  if (!hasLockMessage || hasBuyButton) {
    note("rewards:shop", "a locked mythic item should show a lock reason, not a buy button, before its level is reached");
  }
} else {
  note("rewards:shop", "expected at least one locked mythic-tier card in the shop");
}

// Switching back to the default character must move the "equipped" tag.
const switchButton = page.locator(".kmg-reward-card.is-unlocked .kmg-reward-btn").first();
if (await switchButton.count()) {
  await switchButton.click();
  await page.waitForTimeout(200);
  const stillOneEquipped = await page.locator(".kmg-reward-card.is-equipped").count();
  if (stillOneEquipped !== 1) {
    note("rewards:shop", `expected exactly one equipped card after switching, found ${stillOneEquipped}`);
  }
}

// --- the answer must be recorded for the parent dashboard ------------------

currentRoute = "dashboard:data";
await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const hasChart = await page.locator(".kmg-chart svg").count();
if (!hasChart) note("dashboard:data", "no chart rendered after a question was answered");
const hasRows = await page.locator(".kmg-logtable tbody tr").count();
if (!hasRows) note("dashboard:data", "the answered question is not in the log table");
const hasActivityRows = await page.locator(".kmg-activity-table tbody tr").count();
if (!hasActivityRows) note("dashboard:data", "no rows in the daily activity log table");

// A refresh must not lose any of it - the whole point of keeping results and
// activity in localStorage instead of only in page memory.
currentRoute = "dashboard:reload";
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
if (!(await page.locator(".kmg-logtable tbody tr").count())) {
  note("dashboard:reload", "the log table is empty after refreshing the page");
}
if (!(await page.locator(".kmg-activity-table tbody tr").count())) {
  note("dashboard:reload", "the daily activity log is empty after refreshing the page");
}

// --- language switch -------------------------------------------------------

currentRoute = "i18n";
await page.goto(`${baseUrl}/#/home`, { waitUntil: "networkidle" });
const dutchHeading = await page.locator("#kmg-main h1").first().textContent();
await page.locator('.kmg-langbtn[data-lang="en"]').click();
await page.waitForTimeout(400);
const englishHeading = await page.locator("#kmg-main h1").first().textContent();
if (dutchHeading === englishHeading) {
  note("i18n", `switching to English did not change the heading ("${dutchHeading}")`);
}
await page.locator('.kmg-langbtn[data-lang="nl"]').click();
await page.waitForTimeout(300);

// --- a timed game must actually tick, and stop when you leave --------------

currentRoute = "bliksem:timer";
await page.goto(`${baseUrl}/#/bliksemronde`, { waitUntil: "networkidle" });
await page.locator(".kmg-btn-primary").first().click();
await page.waitForSelector(".kmg-ring", { timeout: 4000 });
const firstTick = await page.locator(".kmg-ring text").textContent();
await page.waitForTimeout(1600);
const secondTick = await page.locator(".kmg-ring text").textContent();
if (firstTick === secondTick) note("bliksem:timer", `the clock did not move (${firstTick})`);
console.log(`  bliksem clock: ${firstTick}s -> ${secondTick}s`);

// Navigating away mid-round must not leave the rAF loop running on a detached
// node - that used to be the classic leak in this kind of app.
await page.goto(`${baseUrl}/#/home`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// --- mobile layout ---------------------------------------------------------

currentRoute = "mobile";
const phone = await context.newPage();
phone.on("pageerror", (error) => note("mobile", `page error: ${error.message}`));
await phone.setViewportSize({ width: 390, height: 780 });
await phone.goto(`${baseUrl}/#/breuken`, { waitUntil: "networkidle" });
await phone.waitForSelector(".kmg-question", { timeout: 8000 });
const overflow = await phone.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (overflow > 1) note("mobile", `the page scrolls sideways by ${overflow}px at 390px wide`);

// Nothing may sit invisibly on top of the game. A full-screen overlay left
// showing at phone width dims the page and swallows every tap, and it looks
// almost right in a screenshot - so assert on the actual hit test.
const covered = await phone.evaluate(async () => {
  const target = document.querySelector(".kmg-padkey, .kmg-choice, .kmg-btn-primary");
  if (!target) return "no tappable control found";

  // elementFromPoint only answers for coordinates inside the viewport, so
  // scroll the control into view first - otherwise every below-the-fold
  // control looks "covered" and the check cries wolf.
  target.scrollIntoView({ block: "center", behavior: "instant" });
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const box = target.getBoundingClientRect();
  const onTop = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  if (!onTop) return "the control is outside the viewport";
  if (onTop === target || target.contains(onTop)) return null;
  const describe = (node) =>
    `<${node.tagName.toLowerCase()} class="${node.getAttribute("class") ?? ""}">`;
  return `covered by ${describe(onTop)}`;
});
if (covered) note("mobile", `the first control is not tappable: ${covered}`);

// And prove it by clicking: Playwright refuses a click that another element
// would intercept.
await phone
  .locator(".kmg-padkey, .kmg-choice, .kmg-btn-primary")
  .first()
  .click({ timeout: 3000 })
  .catch((error) => note("mobile", `could not tap the first control: ${error.message.split("\n")[0]}`));

if (shotDir) await phone.screenshot({ path: path.join(shotDir, "mobile-breuken.png") });

// --- offline, after the service worker has installed ------------------------

currentRoute = "offline";
await page.goto(`${baseUrl}/#/home`, { waitUntil: "networkidle" });
const swReady = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "unsupported";
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  return registration ? "ready" : "failed";
});
console.log(`  service worker: ${swReady}`);

if (swReady === "ready") {
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .waitForSelector("#kmg-main > *", { timeout: 8000 })
    .catch(() => note("offline", "the app did not render with the network off"));
  const offlineHeading = await page.locator("#kmg-main h1").first().textContent();
  console.log(`  offline reload rendered: ${offlineHeading?.trim() ?? "(nothing)"}`);
  await context.setOffline(false);
}

await browser.close();

// --- report ----------------------------------------------------------------

console.log("");
if (problems.length) {
  console.error(`FAILED - ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`OK - ${ROUTES.length} routes, gameplay, i18n, timers, mobile and offline all clean.`);
