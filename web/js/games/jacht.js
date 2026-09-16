/**
 * Getallenjacht / Number Hunt - the second speed game, and the one that trains
 * number *properties* rather than number facts.
 * Ported from pages/14_Getallenjacht.py.
 *
 * A rule appears ("tap every multiple of 6") and a grid of numbers fills the
 * screen. Tap the ones that match before the clock runs out. A hit turns
 * green, a miss turns red and costs a life. Clearing the whole grid before
 * time is up wins a bonus.
 *
 * Where Bliksemronde asks "what is 7 x 8?", this asks "which of these twenty
 * numbers are in the 7-times table?" - the same knowledge from the
 * recognition side, which is what makes divisibility and factors click.
 *
 * On Streamlit every tap was a full server rerun that rebuilt all twenty
 * buttons; here a tap just restyles the one tile, so the grid keeps up with
 * a child who is going fast - which is the entire point of a speed game.
 */
import { t } from "../i18n.js";
import { choice, randInt, sample, shuffle } from "../rng.js";
import { countdownRingSvg } from "../visuals.js";
import { el, clear, raw, append } from "../dom.js";
import { addScore, getLevel } from "../state.js";
import { adaptAfterRound, settleAnswer } from "../gameflow.js";
import { gameShell, recordedCaption, statRow } from "../ui.js";
import { bigCelebration, floatPoints } from "../fx.js";
import * as sound from "../sound.js";

const GAME_KEY = "jacht";
const GRID_COLS = 5;
const GRID_ROWS = 4;
const LIVES = 3;

// Seconds on the clock per level - it gets *shorter* as the rules get harder.
const LEVEL_SECONDS = { 0: 75, 1: 70, 2: 60, 3: 55, 4: 50, 5: 45 };

const PRIMES = new Set([
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
]);

const digitSum = (n) =>
  String(n)
    .split("")
    .reduce((s, d) => s + Number(d), 0);

/**
 * Which hunt rules this level can draw from. Each entry is
 * [ruleId, labelVars, predicate, [lo, hi]].
 */
export function rulesForLevel(level) {
  if (level === 0) {
    return [
      ["even", {}, (n) => n % 2 === 0, [1, 40]],
      ["odd", {}, (n) => n % 2 === 1, [1, 40]],
    ];
  }
  if (level === 1) {
    const table = choice([2, 5, 10]);
    return [
      ["multiple", { n: table }, (n) => n % table === 0, [1, 60]],
      ["greater", { n: 25 }, (n) => n > 25, [5, 50]],
    ];
  }
  if (level === 2) {
    const table = choice([3, 4, 6]);
    return [
      ["multiple", { n: table }, (n) => n % table === 0, [1, 70]],
      ["between", { lo: 20, hi: 40 }, (n) => n >= 20 && n <= 40, [5, 60]],
    ];
  }
  if (level === 3) {
    const table = choice([6, 7, 8, 9]);
    return [
      ["multiple", { n: table }, (n) => n % table === 0, [1, 99]],
      ["digitsum", { n: 9 }, (n) => digitSum(n) === 9, [10, 99]],
    ];
  }
  if (level === 4) {
    return [
      ["prime", {}, (n) => PRIMES.has(n), [2, 60]],
      ["square", {}, (n) => Math.trunc(Math.sqrt(n)) ** 2 === n, [1, 100]],
      ["multiple", { n: 12 }, (n) => n % 12 === 0, [1, 120]],
    ];
  }
  return [
    ["prime", {}, (n) => PRIMES.has(n), [2, 99]],
    ["factor_of", { n: 72 }, (n) => 72 % n === 0, [1, 80]],
    ["multiple_both", { a: 3, b: 4 }, (n) => n % 12 === 0, [1, 120]],
  ];
}

/** Build one round's grid. Exported so the tests can check it stays playable. */
export function buildRound(level) {
  const [ruleId, labelVars, predicate, [lo, hi]] = choice(rulesForLevel(level));

  // Build the grid so it always has a workable number of targets: too few and
  // there is nothing to hunt, too many and tapping everything wins.
  const cells = GRID_COLS * GRID_ROWS;
  const pool = [];
  for (let n = lo; n <= hi; n++) pool.push(n);
  const poolHits = pool.filter(predicate);
  const poolMisses = pool.filter((n) => !predicate(n));

  let targetCount = randInt(Math.max(3, Math.floor(cells / 5)), Math.max(4, Math.floor(cells / 3)));
  targetCount = Math.min(targetCount, poolHits.length);

  const hits = sample(poolHits, targetCount);
  const misses = sample(poolMisses, Math.min(cells - targetCount, poolMisses.length));
  const numbers = [...hits, ...misses];

  // Top up with anything left if the pools were thin (a very tight rule at a
  // small range), keeping the grid rectangular either way.
  const spare = pool.filter((n) => !numbers.includes(n));
  while (numbers.length < cells && spare.length) {
    numbers.push(spare.splice(randInt(0, spare.length - 1), 1)[0]);
  }

  shuffle(numbers);
  return {
    ruleId,
    ruleLabel: t(`jacht.rule_${ruleId}`, labelVars),
    numbers,
    targets: new Set(numbers.filter(predicate)),
  };
}

export function render(container) {
  let phase = "idle"; // idle | running | finished
  let round = null;
  let found = new Set();
  let wrong = new Set();
  let lives = LIVES;
  let roundPoints = 0;
  let cleared = false;
  let deadline = 0;
  let rafId = null;
  let lastTickSecond = null;
  let roundSeconds = LEVEL_SECONDS[0];
  let basePoints = 3;

  const shell = gameShell({
    gameKey: GAME_KEY,
    emoji: "🎯",
    titleKey: "jacht.title",
    taglineKey: "jacht.tagline",
    introKey: "jacht.intro",
    autoAdvance: false,
    onLevelChange: () => {
      stopClock();
      phase = "idle";
      paint();
    },
  });

  const stage = el("div.kmg-stage");
  shell.slots.extraSlot.append(stage, recordedCaption());

  const ring = el("div.kmg-ringwrap");
  const statsHost = el("div");
  const gridHost = el("div");

  function readRules() {
    const level = getLevel(GAME_KEY);
    roundSeconds = LEVEL_SECONDS[level];
    basePoints = 3 * (level + 1);
  }

  function stopClock() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tick() {
    const remaining = (deadline - performance.now()) / 1000;
    if (remaining <= 0) {
      stopClock();
      finishRound(false);
      return;
    }
    ring.innerHTML = countdownRingSvg(remaining, roundSeconds);
    const second = Math.ceil(remaining);
    if (second <= 5 && second !== lastTickSecond) {
      lastTickSecond = second;
      sound.playTick();
    }
    rafId = requestAnimationFrame(tick);
  }

  function startRound() {
    readRules();
    round = buildRound(getLevel(GAME_KEY));
    found = new Set();
    wrong = new Set();
    lives = LIVES;
    roundPoints = 0;
    cleared = false;
    lastTickSecond = null;
    phase = "running";
    deadline = performance.now() + roundSeconds * 1000;
    paint();
    stopClock();
    rafId = requestAnimationFrame(tick);
  }

  function finishRound(didClear) {
    stopClock();
    phase = "finished";
    cleared = didClear;

    if (didClear) {
      const bonus = basePoints * 3;
      addScore(bonus);
      roundPoints += bonus;
      bigCelebration();
    } else {
      sound.playTimeUp();
    }

    // One question in the log per round, holding the whole result - a per-tap
    // log entry would bury the arithmetic games in the dashboard.
    settleAnswer({
      gameKey: GAME_KEY,
      level: getLevel(GAME_KEY),
      questionText: t("jacht.log_question", { rule: round.ruleLabel }),
      studentAnswer: t("jacht.log_answer", { found: found.size, wrong: wrong.size }),
      correctAnswer: t("jacht.log_correct", { targets: round.targets.size }),
      isCorrect: didClear,
      points: roundPoints,
      adaptLevel: false,
      score: false,
    });
    adaptAfterRound(GAME_KEY, found.size, Math.max(1, round.targets.size));
    paint();
  }

  function tapNumber(number, tile) {
    if (phase !== "running" || found.has(number) || wrong.has(number)) return;

    if (round.targets.has(number)) {
      found.add(number);
      const gained = basePoints;
      addScore(gained);
      roundPoints += gained;
      sound.playCorrect(found.size);
      // Restyle the one tile rather than repainting the grid: a child on a
      // roll is tapping faster than a full rebuild can keep up with.
      tile.classList.add("is-hit");
      tile.textContent = `✅ ${number}`;
      tile.disabled = true;
      floatPoints(tile, `+${gained}`);
      paintStats();
      if (found.size === round.targets.size) finishRound(true);
    } else {
      wrong.add(number);
      lives -= 1;
      sound.playIncorrect();
      tile.classList.add("is-miss");
      tile.textContent = `❌ ${number}`;
      tile.disabled = true;
      paintStats();
      if (lives <= 0) finishRound(false);
    }
  }

  // --- rendering ----------------------------------------------------------

  function paintStats() {
    clear(statsHost);
    statsHost.append(
      statRow([
        { label: t("jacht.stat_found"), value: `${found.size}/${round.targets.size}` },
        { label: t("jacht.stat_lives"), value: lives ? "❤️".repeat(lives) : "💔" },
        { label: t("jacht.stat_points"), value: roundPoints },
      ]),
    );
  }

  function paintRunning() {
    clear(gridHost);
    const grid = el("div.kmg-huntgrid", { style: { "--kmg-cols": String(GRID_COLS) } });
    round.numbers.forEach((number) => {
      const tile = el("button.kmg-hunttile", {
        type: "button",
        text: String(number),
        onClick: () => tapNumber(number, tile),
      });
      grid.append(tile);
    });
    gridHost.append(grid);

    paintStats();
    stage.append(
      el("div.kmg-timedhead", {}, [ring, statsHost]),
      el("h2.kmg-huntrule", { text: `🎯 ${round.ruleLabel}` }),
      gridHost,
      el("button.kmg-btn.kmg-btn-ghost", {
        type: "button",
        text: t("jacht.stop_button"),
        onClick: () => finishRound(false),
      }),
    );
  }

  function paintIdle() {
    readRules();
    stage.append(
      raw("div.kmg-intro", `<p>${t("jacht.how_to", { seconds: roundSeconds, lives: LIVES })}</p>`),
      el("button.kmg-btn.kmg-btn-primary.kmg-btn-big", {
        type: "button",
        text: t("jacht.start_button"),
        onClick: () => startRound(),
      }),
    );
  }

  function paintFinished() {
    const missed = [...round.targets].filter((n) => !found.has(n)).sort((a, b) => a - b);
    const mistapped = [...wrong].sort((a, b) => a - b);

    stage.append(el("h2", { text: t("jacht.round_over") }));

    if (cleared) {
      stage.append(
        el("div.kmg-banner.kmg-banner-ok", {}, [
          el("span.kmg-banner-icon", { text: "🏆" }),
          el("span.kmg-banner-body", { text: t("jacht.cleared_banner", { points: roundPoints }) }),
        ]),
      );
    } else if (lives <= 0) {
      stage.append(
        el("div.kmg-banner.kmg-banner-bad", {}, [
          el("span.kmg-banner-icon", { text: "💔" }),
          el("span.kmg-banner-body", { text: t("jacht.out_of_lives") }),
        ]),
      );
    } else {
      stage.append(
        el("div.kmg-banner.kmg-banner-info", {}, [
          el("span.kmg-banner-icon", { text: "⏰" }),
          el("span.kmg-banner-body", { text: t("jacht.time_up") }),
        ]),
      );
    }

    append(
      stage,
      statRow([
        { label: t("jacht.stat_found"), value: `${found.size}/${round.targets.size}` },
        { label: t("jacht.stat_wrong"), value: wrong.size },
        { label: t("jacht.stat_points"), value: roundPoints },
      ]),
      el("p", {}, [el("strong", { text: `${t("jacht.rule_was")} ` }), round.ruleLabel]),
      missed.length ? el("p", { text: t("jacht.you_missed", { numbers: missed.join(", ") }) }) : null,
      mistapped.length
        ? el("p", { text: t("jacht.you_mistapped", { numbers: mistapped.join(", ") }) })
        : null,
      el("div.kmg-actions", {}, [
        el("button.kmg-btn.kmg-btn-primary", {
          type: "button",
          text: t("jacht.again_button"),
          onClick: () => startRound(),
        }),
        el("button.kmg-btn.kmg-btn-ghost", {
          type: "button",
          text: t("jacht.menu_button"),
          onClick: () => {
            phase = "idle";
            paint();
          },
        }),
      ]),
    );
  }

  function paint() {
    clear(stage);
    shell.picker.refresh();
    if (phase === "idle") paintIdle();
    else if (phase === "running") paintRunning();
    else paintFinished();
  }

  container.append(shell.root);
  paint();

  return () => {
    stopClock();
    shell.destroy();
  };
}
