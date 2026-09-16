/**
 * Bliksemronde / Lightning Round - the app's speed game.
 * Ported from pages/11_Bliksemronde.py.
 *
 * This is the game the platform move helps most. On Streamlit the clock lived
 * in an st.fragment(run_every=1): it stepped once a second, each step was a
 * server round-trip, and the answer buttons had to sit *outside* the fragment
 * because a rerun landing between render and click would swallow the tap.
 *
 * Here the clock is a requestAnimationFrame loop reading a deadline, so it
 * sweeps at the screen's refresh rate, costs nothing, and cannot race the
 * buttons - there is no rerun to race with. A tap is measured against the
 * moment the question was painted, so the "answered in 1.2s" bonus is now
 * actually measuring the child rather than the network.
 */
import { t } from "../i18n.js";
import { choice, randInt, shuffle } from "../rng.js";
import { countdownRingSvg } from "../visuals.js";
import { el, clear, raw, append } from "../dom.js";
import { addScore, getLevel, state } from "../state.js";
import { adaptAfterRound, settleAnswer } from "../gameflow.js";
import { gameShell, recordedCaption, statRow } from "../ui.js";
import { bigCelebration, confetti, floatPoints } from "../fx.js";
import * as sound from "../sound.js";

const GAME_KEY = "bliksem";
const ROUND_SECONDS = 60;
// A run of fast correct answers multiplies the points, capped so a long lucky
// streak cannot dwarf everything else the child does in the app.
const COMBO_STEPS = [1, 1, 2, 2, 3, 3, 4];
const FAST_ANSWER_SECONDS = 3.0;

/**
 * Number ranges per level. Kept deliberately smaller than the equivalent
 * level in Tafel Monster: this is about instant recall, not about doing the
 * hardest sum in the app against a clock.
 */
function operands(level) {
  if (level === 0) return [randInt(1, 5), randInt(1, 5), ["+"]];
  if (level === 1) return [randInt(2, 10), randInt(2, 10), ["+", "-"]];
  if (level === 2) return [randInt(2, 10), randInt(2, 10), ["+", "-", "x"]];
  if (level === 3) return [randInt(3, 12), randInt(3, 12), ["+", "-", "x"]];
  if (level === 4) return [randInt(4, 15), randInt(3, 12), ["x", ":", "+"]];
  return [randInt(6, 20), randInt(3, 15), ["x", ":", "-"]];
}

export function generateProblem(level) {
  let [a, b, ops] = operands(level);
  const op = choice(ops);
  let answer;
  let text;

  if (op === "+") {
    answer = a + b;
    text = `${a} + ${b}`;
  } else if (op === "-") {
    // Keep it non-negative: a speed round is the wrong place to also be
    // thinking about the minus side of zero (that is Getallen Universum).
    [a, b] = [Math.max(a, b), Math.min(a, b)];
    answer = a - b;
    text = `${a} − ${b}`;
  } else if (op === "x") {
    answer = a * b;
    text = `${a} × ${b}`;
  } else {
    answer = a;
    text = `${a * b} : ${b}`;
  }

  // Three distractors that are *plausibly* wrong - near misses and the classic
  // off-by-one-times errors - so the buttons test the fact rather than being
  // answerable by "pick the only sensible-looking number".
  const candidates = new Set([answer]);
  const pool = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10];
  if (op === "x") pool.push(a * (b + 1), a * (b - 1), (a + 1) * b, a + b);
  else if (op === ":") pool.push(answer + b, Math.max(1, answer - b), a * b);

  for (const c of shuffle(pool)) {
    if (candidates.size === 4) break;
    if (c >= 0 && c !== answer) candidates.add(c);
  }
  let filler = 1;
  while (candidates.size < 4) {
    candidates.add(answer + filler * 3);
    filler += 1;
  }

  return { text, answer, options: shuffle([...candidates]) };
}

export function render(container) {
  let phase = "idle"; // idle | running | finished
  let problem = null;
  let deadline = 0;
  let shownAt = 0;
  let rafId = null;
  let lastTickSecond = null;

  let correct = 0;
  let total = 0;
  let combo = 0;
  let roundPoints = 0;
  let times = [];
  let lastResult = null;
  let newRecord = false;

  const shell = gameShell({
    gameKey: GAME_KEY,
    emoji: "⚡",
    titleKey: "bliksem.title",
    taglineKey: "bliksem.tagline",
    introKey: "bliksem.intro",
    autoAdvance: false,
    onLevelChange: () => {
      stopClock();
      phase = "idle";
      paint();
    },
  });

  const stage = el("div.kmg-stage");
  shell.slots.extraSlot.append(stage, recordedCaption());

  const bestKey = `kmg.best.${GAME_KEY}`;
  const readBest = () => {
    try {
      return Number(localStorage.getItem(bestKey)) || 0;
    } catch {
      return 0;
    }
  };
  const writeBest = (value) => {
    try {
      localStorage.setItem(bestKey, String(value));
    } catch {
      /* the record just will not survive a reload */
    }
  };

  // --- clock --------------------------------------------------------------

  const ring = el("div.kmg-ringwrap");

  function stopClock() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tick() {
    const remaining = (deadline - performance.now()) / 1000;
    if (remaining <= 0) {
      stopClock();
      finishRound();
      return;
    }
    ring.innerHTML = countdownRingSvg(remaining, ROUND_SECONDS);
    // A tick per second over the last five, so the clock is audible while the
    // child is looking at the numbers rather than at the ring.
    const second = Math.ceil(remaining);
    if (second <= 5 && second !== lastTickSecond) {
      lastTickSecond = second;
      sound.playTick();
    }
    rafId = requestAnimationFrame(tick);
  }

  // --- round lifecycle ----------------------------------------------------

  function startRound() {
    phase = "running";
    correct = 0;
    total = 0;
    combo = 0;
    roundPoints = 0;
    times = [];
    lastResult = null;
    newRecord = false;
    lastTickSecond = null;
    deadline = performance.now() + ROUND_SECONDS * 1000;
    nextProblem();
    paint();
    stopClock();
    rafId = requestAnimationFrame(tick);
  }

  function nextProblem() {
    problem = generateProblem(getLevel(GAME_KEY));
    shownAt = performance.now();
  }

  function finishRound() {
    stopClock();
    phase = "finished";
    // One level decision for the whole round - see gameflow.adaptAfterRound
    // for why a round is a better signal here than a per-answer streak.
    adaptAfterRound(GAME_KEY, correct, total);
    const best = readBest();
    if (correct > best) {
      writeBest(correct);
      newRecord = true;
    }
    sound.playTimeUp();
    paint();
  }

  function answerWith(option, button) {
    if (phase !== "running") return;
    const elapsed = (performance.now() - shownAt) / 1000;
    const isCorrect = option === problem.answer;
    const level = getLevel(GAME_KEY);
    const basePoints = 2 * (level + 1);

    total += 1;
    times.push(elapsed);

    let gained = 0;
    if (isCorrect) {
      correct += 1;
      combo += 1;
      const multiplier = COMBO_STEPS[Math.min(combo, COMBO_STEPS.length - 1)];
      gained = basePoints * multiplier;
      if (elapsed <= FAST_ANSWER_SECONDS) gained += basePoints; // speed bonus
      roundPoints += gained;
      addScore(gained);
      floatPoints(button, `+${gained}`);
    } else {
      combo = 0;
    }

    lastResult = { isCorrect, answer: problem.answer, elapsed };

    settleAnswer({
      gameKey: GAME_KEY,
      level,
      questionText: `${problem.text} = ?`,
      studentAnswer: option,
      correctAnswer: problem.answer,
      isCorrect,
      points: gained,
      // The level is adapted once at the end of the round, and the points were
      // already awarded above (they include the combo multiplier and the
      // speed bonus).
      adaptLevel: false,
      score: false,
    });

    nextProblem();
    paint();
  }

  // --- rendering ----------------------------------------------------------

  function paintIdle() {
    const best = readBest();
    append(
      stage,
      raw("div.kmg-intro", `<p>${t("bliksem.how_to", { seconds: ROUND_SECONDS })}</p>`),
      best
        ? el("div.kmg-banner.kmg-banner-ok", {}, [
            el("span.kmg-banner-icon", { text: "🏆" }),
            el("span.kmg-banner-body", { text: t("bliksem.your_record", { best }) }),
          ])
        : null,
      el("button.kmg-btn.kmg-btn-primary.kmg-btn-big", {
        type: "button",
        text: t("bliksem.start_button"),
        onClick: () => startRound(),
      }),
    );
  }

  function paintRunning() {
    const multiplier = COMBO_STEPS[Math.min(combo, COMBO_STEPS.length - 1)];

    const header = el("div.kmg-timedhead", {}, [
      ring,
      statRow([
        { label: t("bliksem.stat_correct"), value: correct },
        { label: t("bliksem.stat_asked"), value: total },
        {
          label: t("bliksem.stat_combo"),
          value: `x${multiplier}`,
          hint: combo ? t("bliksem.combo_hint", { n: combo }) : null,
        },
      ]),
    ]);

    const question = el("div.kmg-question.is-in", {}, [
      el("span.kmg-question-emoji", { text: "⚡" }),
      el("span.kmg-question-text", { text: `${problem.text} = ?` }),
    ]);

    let banner = null;
    if (lastResult) {
      banner = el(
        `div.kmg-banner.${lastResult.isCorrect ? "kmg-banner-ok" : "kmg-banner-bad"}.kmg-banner-slim`,
        {},
        [
          el("span.kmg-banner-icon", { text: lastResult.isCorrect ? "⚡" : "💨" }),
          el("span.kmg-banner-body", {
            text: lastResult.isCorrect
              ? t("bliksem.quick_correct", { seconds: lastResult.elapsed.toFixed(1) })
              : t("bliksem.quick_wrong", { answer: lastResult.answer }),
          }),
        ],
      );
    }

    const grid = el("div.kmg-choices", { style: { "--kmg-cols": "2" } });
    problem.options.forEach((option) => {
      const button = el("button.kmg-choice.kmg-choice-fast", {
        type: "button",
        text: String(option),
        onClick: () => answerWith(option, button),
      });
      grid.append(button);
    });

    append(
      stage,
      header,
      question,
      banner,
      grid,
      el("button.kmg-btn.kmg-btn-ghost", {
        type: "button",
        text: t("bliksem.stop_button"),
        onClick: () => finishRound(),
      }),
    );
  }

  function paintFinished() {
    const avg = times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0;
    const accuracy = total ? (100 * correct) / total : 0;

    stage.append(el("h2", { text: t("bliksem.round_over") }));

    if (newRecord) {
      newRecord = false;
      bigCelebration();
      stage.append(
        el("div.kmg-banner.kmg-banner-ok", {}, [
          el("span.kmg-banner-icon", { text: "🏆" }),
          el("span.kmg-banner-body", { text: t("bliksem.new_record", { best: correct }) }),
        ]),
      );
    }

    stage.append(
      statRow([
        { label: t("bliksem.stat_correct"), value: correct },
        { label: t("bliksem.stat_asked"), value: total },
        { label: t("bliksem.stat_accuracy"), value: `${accuracy.toFixed(0)}%` },
        { label: t("bliksem.stat_avg_time"), value: `${avg.toFixed(1)}s` },
      ]),
      el("p", { text: t("bliksem.round_points", { points: roundPoints }) }),
    );

    if (total === 0) {
      stage.append(praise("🤔", t("bliksem.no_answers"), false));
    } else if (accuracy >= 80) {
      stage.append(praise("🌟", t("bliksem.praise_high"), true));
    } else if (accuracy >= 50) {
      stage.append(praise("👍", t("bliksem.praise_mid"), false));
    } else {
      stage.append(praise("💪", t("bliksem.praise_low"), false));
    }

    stage.append(
      el("div.kmg-actions", {}, [
        el("button.kmg-btn.kmg-btn-primary", {
          type: "button",
          text: t("bliksem.again_button"),
          onClick: () => startRound(),
        }),
        el("button.kmg-btn.kmg-btn-ghost", {
          type: "button",
          text: t("bliksem.menu_button"),
          onClick: () => {
            phase = "idle";
            paint();
          },
        }),
      ]),
    );
  }

  function praise(icon, message, celebrate) {
    if (celebrate) confetti({ count: 50 });
    return el(`div.kmg-banner.${celebrate ? "kmg-banner-ok" : "kmg-banner-info"}`, {}, [
      el("span.kmg-banner-icon", { text: icon }),
      el("span.kmg-banner-body", { text: message }),
    ]);
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

  // The router calls this when the child navigates away mid-round: without it
  // the rAF loop would keep running against a detached DOM node.
  return () => {
    stopClock();
    shell.destroy();
  };
}

export { state };
