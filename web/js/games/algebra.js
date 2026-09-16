/**
 * Het X-Mysterie - solving equations, up to a two-unknown system.
 * Ported from pages/07_Het_X-Mysterie.py.
 */
import { t } from "../i18n.js";
import { choice, coinFlip, randInt, range } from "../rng.js";
import { balanceScaleSvg } from "../visuals.js";
import { numberAnswer, twoFieldAnswer, typedAnswerGame } from "./common.js";

const GAME_KEY = "algebra";

export function generate(level) {
  let twoVar = false;
  let text;
  let answer;
  let visual;

  if (level === 0) {
    // Warm-up: addition only, small numbers - no subtraction yet.
    const a = randInt(1, 5);
    const x = randInt(1, 10);
    const b = a + x;
    text = t("algebra.q_add", { a, b });
    answer = { x };
    visual = [[`x + ${a}`, String(b)]];
  } else if (level === 1) {
    const a = randInt(1, 15);
    if (coinFlip()) {
      const x = randInt(1, 20);
      const b = a + x;
      text = t("algebra.q_add", { a, b });
      answer = { x };
      visual = [[`x + ${a}`, String(b)]];
    } else {
      const x = randInt(a + 1, a + 20);
      const b = x - a;
      text = t("algebra.q_sub", { a, b });
      answer = { x };
      visual = [[`x - ${a}`, String(b)]];
    }
  } else if (level === 2) {
    const a = randInt(2, 9);
    if (coinFlip()) {
      const x = randInt(2, 12);
      const b = a * x;
      text = t("algebra.q_mul", { a, b });
      answer = { x };
      visual = [[`${a} × x`, String(b)]];
    } else {
      const q = randInt(2, 12);
      const x = a * q;
      text = t("algebra.q_div", { a, q });
      answer = { x };
      visual = [[`x : ${a}`, String(q)]];
    }
  } else if (level === 3) {
    const a = randInt(2, 6);
    const x = randInt(1, 10);
    const ax = a * x;
    if (coinFlip()) {
      const b = randInt(1, 15);
      const c = ax + b;
      text = t("algebra.q_two_step_add", { a, b, c });
      visual = [[`${a}x + ${b}`, String(c)]];
    } else {
      const b = randInt(1, Math.max(1, ax));
      const c = ax - b;
      text = t("algebra.q_two_step_sub", { a, b, c });
      visual = [[`${a}x - ${b}`, String(c)]];
    }
    answer = { x };
  } else if (level === 4) {
    const a = randInt(2, 8);
    const x = choice(range(-10, 11).filter((v) => v !== 0));
    const b = randInt(1, 25);
    const ax = a * x;
    if (coinFlip()) {
      const c = ax + b;
      text = t("algebra.q_two_step_add", { a, b, c });
      visual = [[`${a}x + ${b}`, String(c)]];
    } else {
      const c = ax - b;
      text = t("algebra.q_two_step_sub", { a, b, c });
      visual = [[`${a}x - ${b}`, String(c)]];
    }
    answer = { x };
  } else {
    twoVar = true;
    const x = randInt(2, 20);
    const y = randInt(1, x - 1);
    const s = x + y;
    const d = x - y;
    text = t("algebra.q_system", { s, d });
    answer = { x, y };
    visual = [
      ["x + y", String(s)],
      ["x - y", String(d)],
    ];
  }

  return { text, answer, visual, twoVar, negative: level >= 4, answerLabel: t("algebra.x_label") };
}

export const render = typedAnswerGame({
  gameKey: GAME_KEY,
  emoji: "🕵️",
  questionEmoji: "🕵️",
  okIcon: "🕵️",
  badIcon: "🧩",
  tipKey: "algebra.why_tip",
  generate,
  visuals: (problem) => problem.visual.map(([left, right]) => balanceScaleSvg(left, right)),
  answer: (problem, api) => {
    if (!problem.twoVar) {
      // Logged as "x=7" rather than "7", matching what the Streamlit version
      // wrote, so a parent's older CSV export and a new one read alike.
      const widget = numberAnswer(
        { ...problem, answer: problem.answer.x, answerDisplay: `x=${problem.answer.x}` },
        api,
        {},
      );
      const gradeNumber = widget.grade;
      widget.grade = () => {
        const graded = gradeNumber();
        return graded && { ...graded, studentAnswer: `x=${graded.studentAnswer}` };
      };
      return widget;
    }
    return twoFieldAnswer(problem, api, {
      labelA: t("algebra.x_label"),
      labelB: t("algebra.y_label"),
      negative: true,
      gradeFn: (x, y) => ({
        isCorrect: x === problem.answer.x && y === problem.answer.y,
        studentAnswer: `x=${x}, y=${y}`,
        correctAnswerDisplay: `x=${problem.answer.x}, y=${problem.answer.y}`,
      }),
    });
  },
});
