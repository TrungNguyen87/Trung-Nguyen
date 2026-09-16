/**
 * Tafel Monster - multiplication, missing factors, division and word problems.
 * Ported from pages/01_Tafel_Monster.py; the level curve and the question mix
 * are unchanged.
 */
import { t } from "../i18n.js";
import { choice, coinFlip, randInt } from "../rng.js";
import { arrayGridSvg, skipCountSvg } from "../visuals.js";
import { expander } from "../ui.js";
import { el, raw } from "../dom.js";
import { numberAnswer, typedAnswerGame } from "./common.js";

const GAME_KEY = "tafel";
const WORD_TEMPLATES = ["tafel.word_boxes", "tafel.word_rows", "tafel.word_moons"];

export function generate(level) {
  let a;
  let b;
  if (level === 0) [a, b] = [randInt(1, 3), randInt(1, 5)];
  else if (level === 1) [a, b] = [randInt(1, 5), randInt(2, 10)];
  else if (level === 2) [a, b] = [randInt(2, 10), randInt(2, 10)];
  else if (level === 3) [a, b] = [randInt(2, 12), randInt(2, 12)];
  else if (level === 4) [a, b] = [randInt(11, 20), randInt(2, 9)];
  else if (level === 5) [a, b] = [randInt(11, 20), randInt(11, 20)];
  else {
    // Level 6+: Monster-level!
    // Challenging multi-digit arithmetic for champions: [12..35] × [12..25]
    [a, b] = coinFlip() ? [randInt(12, 35), randInt(12, 25)] : [randInt(20, 50), randInt(11, 20)];
  }

  const product = a * b;

  const typeChoices = ["mult"];
  if (level >= 2) typeChoices.push("missing_factor");
  if (level >= 3) typeChoices.push("division");
  if (level >= 4) typeChoices.push("word");
  if (level >= 6) typeChoices.push("three_factor");
  const qType = choice(typeChoices);

  let text;
  let answer;
  // Set for missing_factor/division: the one factor still given in the
  // question, which is what the skip-counting hint is allowed to show.
  let knownFactor = null;

  if (qType === "three_factor") {
    // 3-factor multiplication (e.g. 4 × 7 × 25 = 700 or 5 × 16 × 2 = 160)
    const f1 = choice([2, 4, 5, 8]);
    const f2 = randInt(6, 25);
    const f3 = choice([2, 5, 10, 20, 25]);
    const threeProduct = f1 * f2 * f3;
    text = t("tafel.q_three_factor", { a: f1, b: f2, c: f3 });
    answer = threeProduct;
    return {
      text,
      answer,
      a: f1,
      b: f2,
      c: f3,
      product: threeProduct,
      qType,
      knownFactor: f1,
    };
  }

  if (qType === "mult") {
    text = t("tafel.q_mult", { a, b });
    answer = product;
  } else if (qType === "missing_factor") {
    if (coinFlip()) {
      text = t("tafel.q_missing_b", { a, product });
      answer = b;
      knownFactor = a;
    } else {
      text = t("tafel.q_missing_a", { b, product });
      answer = a;
      knownFactor = b;
    }
  } else if (qType === "division") {
    text = t("tafel.q_division", { product, a });
    answer = b;
    knownFactor = a;
  } else {
    const templates = level >= 6 ? [...WORD_TEMPLATES, "tafel.word_monster"] : WORD_TEMPLATES;
    text = t(choice(templates), { a, b });
    answer = product;
  }

  return { text, answer, a, b, product, qType, knownFactor };
}

/**
 * The visual hint, kept honest: for a missing-factor or division question an
 * accurate a x b grid would let a child read the answer straight off by
 * counting a side - that is the answer, not a hint. Those get a skip-counting
 * number line for the *known* factor instead, so the child still has to count
 * the hops to the target themselves.
 */
function hintNode(problem) {
  const body = el("div");
  if (problem.qType === "three_factor") {
    body.append(
      el("p", {
        text: t("tafel.hint_three_factor", {
          a: problem.a,
          b: problem.b,
          c: problem.c,
          ab: problem.a * problem.b,
        }),
      }),
      raw("div.kmg-visual", arrayGridSvg(Math.min(problem.a, 12), Math.min(problem.b, 12))),
    );
  } else if (problem.qType === "missing_factor" || problem.qType === "division") {
    body.append(
      el("p", { text: t("common.skip_count_hint", { step: problem.knownFactor }) }),
      raw("div.kmg-visual", skipCountSvg(problem.knownFactor, problem.product)),
    );
  } else {
    body.append(raw("div.kmg-visual", arrayGridSvg(problem.a, problem.b)));
  }
  return expander(t("common.show_visual_hint"), body);
}

export const render = typedAnswerGame({
  gameKey: GAME_KEY,
  emoji: "🚀",
  questionEmoji: "👾",
  okIcon: "👽",
  badIcon: "🛸",
  tipKey: "tafel.why_tip",
  generate,
  answer: (problem, api) => numberAnswer(problem, api, { before: hintNode(problem) }),
});
