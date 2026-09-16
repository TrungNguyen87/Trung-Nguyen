/**
 * Breuken Baas - adding, subtracting, simplifying and multiplying fractions.
 * Ported from pages/02_Breuken_Baas.py.
 *
 * The one thing that is not a straight port is the explorer. Streamlit gave
 * it two sliders and redrew a picture on the server after each drag. Here the
 * pizza itself is the control: tapping a slice fills or empties it, and the
 * fraction, percentage and decimal update as you go. That is the difference
 * between reading about a fraction and building one.
 */
import { t } from "../i18n.js";
import { choice, coinFlip, gcd, randInt } from "../rng.js";
import { fractionVisualSvg, pizzaSvg } from "../visuals.js";
import { expander, numberField } from "../ui.js";
import { el, raw, clear } from "../dom.js";
import { typedAnswerGame } from "./common.js";
import * as sound from "../sound.js";

const GAME_KEY = "breuken";

export function generate(level) {
  let den;
  let n1;
  let n2;
  let text;
  let correctNum;
  let correctDen;
  let denEditable = false;
  let visualFracs;

  if (level === 0) {
    den = choice([2, 4]);
    n1 = randInt(1, den - 1);
    n2 = randInt(1, den - n1);
    text = t("breuken.q_add", { n1, n2, d: den });
    [correctNum, correctDen] = [n1 + n2, den];
    visualFracs = [[n1, den], [n2, den]];
  } else if (level === 1) {
    den = choice([4, 6, 8, 10]);
    n1 = randInt(1, den - 1);
    n2 = randInt(1, den - n1);
    text = t("breuken.q_add", { n1, n2, d: den });
    [correctNum, correctDen] = [n1 + n2, den];
    visualFracs = [[n1, den], [n2, den]];
  } else if (level === 2) {
    den = choice([4, 6, 8, 10, 12]);
    if (coinFlip()) {
      n1 = randInt(1, den - 1);
      n2 = randInt(1, den - 1);
      text = t("breuken.q_add", { n1, n2, d: den });
      [correctNum, correctDen] = [n1 + n2, den];
    } else {
      n1 = randInt(2, den - 1);
      n2 = randInt(1, n1);
      text = t("breuken.q_sub", { n1, n2, d: den });
      [correctNum, correctDen] = [n1 - n2, den];
    }
    visualFracs = [[n1, den], [n2, den]];
  } else if (level === 3) {
    const factor = randInt(2, 4);
    const simplifiedDen = choice([2, 3, 4, 5, 6]);
    // Must be coprime with simplifiedDen, otherwise this "fully simplified"
    // fraction (e.g. 2/4) would not actually be in lowest terms, contradicting
    // the question's "simplify as far as possible".
    const candidates = [];
    for (let n = 1; n < simplifiedDen; n++) if (gcd(n, simplifiedDen) === 1) candidates.push(n);
    const simplifiedNum = choice(candidates);
    den = simplifiedDen * factor;
    const num = simplifiedNum * factor;
    text = t("breuken.q_simplify", { n: num, d: den, new_d: simplifiedDen });
    [correctNum, correctDen] = [simplifiedNum, simplifiedDen];
    visualFracs = [[num, den]];
  } else if (level === 4) {
    const d1 = choice([2, 3, 4, 5]);
    const k = choice([2, 3]);
    const d2 = d1 * k;
    n1 = randInt(1, d1 - 1);
    n2 = randInt(1, d2 - 1);
    text = t("breuken.q_diff_denom", { n1, d1, n2, d2 });
    [correctNum, correctDen] = [n1 * k + n2, d2];
    denEditable = true;
    visualFracs = [[n1, d1], [n2, d2]];
  } else {
    den = choice([3, 4, 5, 6]);
    const num = randInt(1, den - 1);
    const k = randInt(2, 4);
    text = t("breuken.q_multiply", { k, n: num, d: den });
    [correctNum, correctDen] = [num * k, den];
    visualFracs = [[num, den]];
  }

  return { text, correctNum, correctDen, denEditable, visualFracs };
}

/**
 * Numerator over denominator, drawn as an actual fraction rather than two
 * unrelated boxes. The denominator is pre-filled and locked unless the
 * question is one where finding it is part of the work.
 */
function fractionAnswer(problem, api) {
  const numField = numberField({ label: t("breuken.numerator_label"), onSubmit: api.submit });

  let denField = null;
  let denNode;
  if (problem.denEditable) {
    denField = numberField({ label: t("breuken.denominator_label"), onSubmit: api.submit });
    denNode = denField.node;
  } else {
    denNode = el("div.kmg-answer", {}, [
      el("label.kmg-answer-label", { text: t("breuken.denominator_label") }),
      el("input.kmg-numinput", {
        type: "text",
        value: String(problem.correctDen),
        disabled: true,
        "aria-label": t("breuken.denominator_label"),
      }),
    ]);
  }

  const node = el("div.kmg-fraction-answer", {}, [
    numField.node,
    el("div.kmg-fraction-line"),
    denNode,
  ]);

  return {
    node,
    focus: numField.focus,
    grade: () => {
      const num = numField.value();
      const den = denField ? denField.value() : problem.correctDen;
      if (num == null || den == null) return null;

      // Accept any fraction *equal in value* to the expected one, not just the
      // literal pair. "5/8 - 1/8" expects 4/8, and a child who does the sum
      // correctly and then simplifies to 1/2 - exactly what we teach them to
      // do - used to be marked wrong. Cross-multiplying avoids float rounding
      // entirely.
      const isCorrect = den > 0 && num * problem.correctDen === problem.correctNum * den;

      // When the expected answer is not in lowest terms, show the simplified
      // form alongside it, so "the answer was 4/8" also teaches "= 1/2" (and
      // makes clear why typing 1/2 is accepted too).
      let display = `${problem.correctNum}/${problem.correctDen}`;
      const divisor = gcd(problem.correctNum, problem.correctDen);
      if (divisor > 1) {
        display += ` (= ${problem.correctNum / divisor}/${problem.correctDen / divisor})`;
      }

      return { isCorrect, studentAnswer: `${num}/${den}`, correctAnswerDisplay: display };
    },
    reveal: (ok) => {
      numField.markResult(ok);
      denField?.markResult(ok);
    },
  };
}

/**
 * The explorer: a pizza you build by tapping. Tap an empty slice to fill it,
 * a filled one to empty it; the +/- keys change how many slices the pizza is
 * cut into.
 */
function explorer() {
  let den = 4;
  let num = 1;

  const canvas = el("div.kmg-explorer-canvas");
  const readout = el("div.kmg-explorer-readout");
  const denLabel = el("span.kmg-explorer-den");

  function paint() {
    clear(canvas);
    const svgHost = raw("div.kmg-visual.kmg-explorer-pizza", pizzaSvg(num, den, 210));
    // The generated SVG lays slices down in order, so slice i is child i of
    // the <svg> after its <style> node - which is what makes each one
    // individually tappable without rewriting the visual library.
    const svg = svgHost.querySelector("svg");
    const slices = [...svg.querySelectorAll("path")];
    slices.forEach((slice, index) => {
      slice.style.cursor = "pointer";
      slice.setAttribute("tabindex", "0");
      slice.setAttribute("role", "button");
      const activate = () => {
        // Tapping slice i means "fill up to and including i", or - if it is
        // already the last filled one - "take it back off again".
        num = num === index + 1 ? index : index + 1;
        sound.playTap();
        paint();
      };
      slice.addEventListener("click", activate);
      slice.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    });
    canvas.append(svgHost);

    const divisor = gcd(num, den) || 1;
    const simplified = `${num / divisor}/${den / divisor}`;
    const decimal = (num / den).toFixed(2);
    const percent = Math.round((100 * num) / den);
    clear(readout);
    readout.append(
      el("strong", { text: `${num}/${den}` }),
      el("span", { text: ` = ${simplified} = ${decimal} = ${percent}%` }),
    );
    denLabel.textContent = String(den);
  }

  const setDen = (next) => {
    den = Math.max(1, Math.min(20, next));
    if (num > den) num = den;
    sound.playTap();
    paint();
  };

  const controls = el("div.kmg-explorer-controls", {}, [
    el("span.kmg-explorer-label", { text: t("breuken.denominator_label") }),
    el("button.kmg-btn.kmg-btn-ghost.kmg-btn-round", {
      type: "button",
      text: "−",
      "aria-label": "-1",
      onClick: () => setDen(den - 1),
    }),
    denLabel,
    el("button.kmg-btn.kmg-btn-ghost.kmg-btn-round", {
      type: "button",
      text: "+",
      "aria-label": "+1",
      onClick: () => setDen(den + 1),
    }),
  ]);

  paint();
  return expander(
    t("common.try_it_heading"),
    el("div", {}, [
      el("p", { text: t("breuken.explore_intro") }),
      controls,
      canvas,
      readout,
    ]),
  );
}

export const render = typedAnswerGame({
  gameKey: GAME_KEY,
  emoji: "👨‍🍳",
  questionEmoji: "🍕",
  okIcon: "🎉",
  badIcon: "🔥",
  tipKey: "breuken.why_tip",
  generate,
  visuals: (problem) => problem.visualFracs.map(([n, d]) => fractionVisualSvg(n, d)),
  answer: fractionAnswer,
  extraTop: () => explorer(),
});
