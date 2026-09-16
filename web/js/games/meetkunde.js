/**
 * Meetkunde Meesters - perimeter, area, compound shapes, volume and angles.
 * Ported from pages/08_Meetkunde_Meesters.py.
 */
import { t } from "../i18n.js";
import { choice, coinFlip, randInt, range } from "../rng.js";
import { cuboidSvg, rectangleSvg, triangleSvg } from "../visuals.js";
import { typedAnswerGame } from "./common.js";

const GAME_KEY = "meetkunde";
const UNIT = "cm";

export function generate(level) {
  let text;
  let answer;
  let unitSuffix;
  let visual;
  let angles = null;

  if (level === 0 || level === 1) {
    const hi = level === 0 ? 6 : 12;
    const w = randInt(2, hi);
    const h = randInt(2, hi);
    if (coinFlip()) {
      text = t("meetkunde.q_perimeter", { w, h, unit: UNIT });
      answer = 2 * (w + h);
      unitSuffix = UNIT;
    } else {
      text = t("meetkunde.q_area_rect", { w, h, unit: UNIT });
      answer = w * h;
      unitSuffix = `${UNIT}²`;
    }
    visual = { kind: "rect", w, h };
  } else if (level === 2) {
    // An even height keeps base x height / 2 a whole number.
    const heightVal = choice(range(2, 13, 2));
    const base = randInt(2, 15);
    text = t("meetkunde.q_area_triangle", { base, height: heightVal, unit: UNIT });
    answer = (base * heightVal) / 2;
    unitSuffix = `${UNIT}²`;
    visual = { kind: "triangle", base, height: heightVal };
  } else if (level === 3) {
    const h = randInt(2, 10);
    const w1 = randInt(2, 10);
    const w2 = randInt(2, 10);
    text = t("meetkunde.q_area_compound", { w1, w2, h, unit: UNIT });
    answer = (w1 + w2) * h;
    unitSuffix = `${UNIT}²`;
    visual = { kind: "compound", w1, w2, h };
  } else if (level === 4) {
    const l = randInt(2, 10);
    const w = randInt(2, 10);
    const h = randInt(2, 10);
    text = t("meetkunde.q_volume", { l, w, h, unit: UNIT });
    answer = l * w * h;
    unitSuffix = `${UNIT}³`;
    visual = { kind: "cuboid", l, w, h };
  } else {
    const shape = choice(["triangle", "quadrilateral"]);
    const total = shape === "triangle" ? 180 : 360;
    const n = shape === "triangle" ? 3 : 4;

    // Pick the missing angle FIRST, then split what is left over the given
    // angles. Sampling the given angles and hoping the remainder is sensible
    // can leave a triangle asking for a negative third angle.
    const missing = randInt(20, 100);
    let remaining = total - missing;
    const given = [];
    for (let i = 0; i < n - 1; i++) {
      const slotsLeft = n - 1 - i;
      if (slotsLeft === 1) {
        given.push(remaining);
      } else {
        // Leave at least 20 degrees for each angle still to come.
        const lo = Math.max(20, remaining - 140 * (slotsLeft - 1));
        const hi = Math.min(140, remaining - 20 * (slotsLeft - 1));
        const pick = randInt(lo, Math.max(lo, hi));
        given.push(pick);
        remaining -= pick;
      }
    }

    text = t("meetkunde.q_angle", {
      shape: t(`meetkunde.shape_${shape}`),
      total,
      given: given.join(" + "),
    });
    answer = missing;
    unitSuffix = "°";
    // Kept on the problem so the angle sum can be checked without parsing it
    // back out of translated text.
    angles = { shape, total, given };
    visual = shape === "triangle" ? { kind: "triangle", base: 12, height: 8 } : { kind: "rect", w: 10, h: 8 };
  }

  return {
    text,
    answer,
    unitSuffix,
    visual,
    angles,
    answerLabel: unitSuffix === "°" ? t("meetkunde.answer_label_deg") : t("meetkunde.answer_label"),
  };
}

function visuals(problem) {
  const v = problem.visual;
  if (v.kind === "rect") return [rectangleSvg(v.w, v.h, { unit: UNIT })];
  if (v.kind === "triangle") return [triangleSvg(v.base, v.height, { unit: UNIT })];
  if (v.kind === "cuboid") return [cuboidSvg(v.l, v.w, v.h, { unit: UNIT })];
  // A compound shape is shown as its two rectangles side by side, which is
  // exactly the decomposition the question is asking the child to make.
  return [rectangleSvg(v.w1, v.h, { unit: UNIT }), rectangleSvg(v.w2, v.h, { unit: UNIT })];
}

export const render = typedAnswerGame({
  gameKey: GAME_KEY,
  emoji: "📐",
  questionEmoji: "📐",
  okIcon: "🏛️",
  badIcon: "🧱",
  tipKey: "meetkunde.why_tip",
  generate,
  visuals,
});
