/**
 * Shared competition problem generator & scoring engine.
 * Used by both client-side multiplayer and the server-authoritative room engine.
 */
import { choice, randInt, shuffle } from "./rng.js";

export const ROUND_TIME_SECONDS = 15;

/** Generate 4 smart multiple-choice options for a given correct answer. */
export function makeChoices(answer, distractors = []) {
  const choices = new Set([answer]);
  for (const d of shuffle(distractors)) {
    if (choices.size >= 4) break;
    if (d !== answer && d !== null && d !== undefined) {
      choices.add(d);
    }
  }
  // Fallbacks if not enough distractors
  const numeric = typeof answer === "number";
  let offset = 1;
  while (choices.size < 4) {
    if (numeric) {
      const alt = offset % 2 === 0 ? answer + offset : Math.max(0, answer - offset);
      if (!choices.has(alt)) choices.add(alt);
      offset++;
    } else {
      choices.add(`?${choices.size}`);
    }
  }
  return shuffle([...choices]);
}

/** Number ranges per level for lightning / speed arithmetic. */
function bliksemOperands(level) {
  if (level === 0) return [randInt(1, 5), randInt(1, 5), ["+"]];
  if (level === 1) return [randInt(2, 10), randInt(2, 10), ["+", "-"]];
  if (level === 2) return [randInt(2, 10), randInt(2, 10), ["+", "-", "x"]];
  if (level === 3) return [randInt(3, 12), randInt(3, 12), ["+", "-", "x"]];
  if (level === 4) return [randInt(4, 15), randInt(3, 12), ["x", ":", "+"]];
  return [randInt(6, 20), randInt(3, 15), ["x", ":", "-"]];
}

/** Generate a lightning round problem. */
export function generateBliksemProblem(level = 2) {
  let [a, b, ops] = bliksemOperands(level);
  const op = choice(ops);
  let answer;
  let text;

  if (op === "+") {
    answer = a + b;
    text = `${a} + ${b}`;
  } else if (op === "-") {
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

  return {
    text,
    answer,
    answerDisplay: String(answer),
    options: shuffle([...candidates]),
  };
}

/** Generate a competition problem based on category and difficulty level. */
export function generateCompetitionProblem(category, level = 2) {
  let cat = category;
  if (cat === "all") {
    cat = choice(["tafels", "breuken", "procenten", "bliksem"]);
  }

  if (cat === "tafels") {
    let a;
    let b;
    if (level === 0) [a, b] = [randInt(1, 5), randInt(2, 5)];
    else if (level <= 2) [a, b] = [randInt(2, 10), randInt(2, 10)];
    else [a, b] = [randInt(3, 12), randInt(3, 12)];

    const answer = a * b;
    const text = `${a} × ${b}`;
    const pool = [
      answer + a,
      Math.max(0, answer - a),
      answer + b,
      Math.max(0, answer - b),
      answer + 2,
      Math.max(0, answer - 2),
      answer + 10,
      Math.max(0, answer - 10),
    ];
    return {
      text,
      answer,
      answerDisplay: String(answer),
      options: makeChoices(answer, pool),
    };
  }

  if (cat === "breuken") {
    const den = choice([2, 3, 4, 5, 6, 8, 10]);
    const num1 = randInt(1, den - 1);
    const num2 = randInt(1, den - num1);
    const sum = num1 + num2;
    const text = `${num1}/${den} + ${num2}/${den}`;
    const answerDisplay = `${sum}/${den}`;
    const pool = [
      `${Math.max(1, sum - 1)}/${den}`,
      `${sum + 1}/${den}`,
      `${sum}/${den * 2}`,
      `${num1 + num2}/${den + den}`,
      `${Math.min(den, sum + 2)}/${den}`,
    ];
    return {
      text,
      answer: answerDisplay,
      answerDisplay,
      options: makeChoices(answerDisplay, pool),
    };
  }

  if (cat === "procenten") {
    const pct = choice([10, 20, 25, 50, 75]);
    const base = choice([20, 40, 50, 60, 80, 100, 200]);
    const answer = (pct * base) / 100;
    const text = `${pct}% van ${base}`;
    const pool = [
      answer + 5,
      Math.max(1, answer - 5),
      answer * 2,
      Math.max(1, answer / 2),
      answer + 10,
      Math.max(1, answer - 10),
    ];
    return {
      text,
      answer,
      answerDisplay: String(answer),
      options: makeChoices(answer, pool),
    };
  }

  // Default / "bliksem" category
  return generateBliksemProblem(level);
}

/**
 * Calculate competition points based on accuracy and response time:
 * - Incorrect: 0 points
 * - Correct: faster = more points, ranging from 100 down to 20
 */
export function calculateCompetitionPoints(isCorrect, responseSeconds, roundDuration = ROUND_TIME_SECONDS) {
  if (!isCorrect) return 0;
  const safeTime = Math.max(0.1, Math.min(roundDuration, responseSeconds));
  const timeFactor = safeTime / roundDuration;
  // Maximum points 100, minimum points for correct answer within time is 20
  const points = Math.round(100 - timeFactor * 80);
  return Math.max(20, Math.min(100, points));
}
