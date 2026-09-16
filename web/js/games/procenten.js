/**
 * Procenten Puzzel - percentage/fraction/decimal equivalents, percentage of a
 * number, discounts, and reverse percentages.
 * Ported from pages/04_Procenten_Puzzel.py.
 */
import { t } from "../i18n.js";
import { choice, coinFlip, gcd, randInt, shuffle, unique } from "../rng.js";
import { fractionVisualSvg, percentBarSvg } from "../visuals.js";
import { expander } from "../ui.js";
import { el, raw, clear } from "../dom.js";
import { choiceAnswer, numberAnswer, typedAnswerGame } from "./common.js";

const GAME_KEY = "procenten";

const VERY_EASY_EQUIVALENTS = [
  ["1/2", "50%", "0.50"],
  ["1/4", "25%", "0.25"],
];
const EASY_EQUIVALENTS = [
  ["1/2", "50%", "0.50"],
  ["1/4", "25%", "0.25"],
  ["3/4", "75%", "0.75"],
  ["1/10", "10%", "0.10"],
  ["1/5", "20%", "0.20"],
];
const HARD_EQUIVALENTS = [
  ...EASY_EQUIVALENTS,
  ["1/8", "12.5%", "0.125"],
  ["3/8", "37.5%", "0.375"],
  ["2/5", "40%", "0.40"],
  ["3/5", "60%", "0.60"],
  ["4/5", "80%", "0.80"],
];
const PCT_CHOICES = [5, 10, 15, 20, 25, 50, 75];

/** Pick a base number so pct% of it is a whole number. */
function niceBaseFor(pct) {
  const multiple = 100 / gcd(pct, 100);
  return multiple * randInt(1, 10);
}

export function generate(level) {
  if (level === 0 || level === 1 || level === 4) {
    const equivalents =
      level === 0 ? VERY_EASY_EQUIVALENTS : level === 1 ? EASY_EQUIVALENTS : HARD_EQUIVALENTS;
    const [fraction, percentage, decimal] = choice(equivalents);
    // Level 0 sticks to the simplest direction (recognising a fraction as a
    // percentage) instead of also asking for decimal conversions.
    const qType =
      level === 0 ? "frac_to_perc" : choice(["frac_to_perc", "perc_to_dec", "dec_to_frac"]);

    const allFracs = equivalents.map((e) => e[0]);
    const allPercs = equivalents.map((e) => e[1]);
    const allDecs = equivalents.map((e) => e[2]);

    let text;
    let answer;
    let options;
    let visual;

    if (qType === "frac_to_perc") {
      text = t("procenten.q_equivalent_frac_to_perc", { fraction });
      answer = percentage;
      options = allPercs;
      const [fn, fd] = fraction.split("/").map(Number);
      visual = { kind: "frac", n: fn, d: fd };
    } else if (qType === "perc_to_dec") {
      text = t("procenten.q_equivalent_perc_to_dec", { percentage });
      answer = decimal;
      options = allDecs;
      visual = { kind: "pct", value: parseFloat(percentage), label: percentage };
    } else {
      text = t("procenten.q_equivalent_dec_to_frac", { decimal });
      answer = fraction;
      options = allFracs;
      visual = { kind: "pct", value: parseFloat(decimal) * 100, label: decimal };
    }

    return { mode: "choice", text, answer, options: shuffle(unique(options)), visual };
  }

  if (level === 2) {
    const pct = choice(PCT_CHOICES);
    const base = niceBaseFor(pct);
    return {
      mode: "numeric",
      text: t("procenten.q_percent_of", { pct, base }),
      answer: (base * pct) / 100,
      answerLabel: t("procenten.answer_label_number"),
      visual: { kind: "pct", value: pct, label: t("procenten.visual_pct_of", { pct, base }) },
    };
  }

  if (level === 3) {
    const pct = choice(PCT_CHOICES);
    const price = niceBaseFor(pct);
    const discount = (price * pct) / 100;
    const askNewPrice = coinFlip();
    return {
      mode: "numeric",
      text: askNewPrice
        ? t("procenten.q_discount_new_price", { price, pct })
        : t("procenten.q_discount_amount", { price, pct }),
      answer: askNewPrice ? price - discount : discount,
      answerLabel: t("procenten.answer_label_euro"),
      visual: { kind: "pct", value: pct, label: t("procenten.visual_discount", { pct }) },
    };
  }

  // Level 5: reverse percentage.
  const pct = choice(PCT_CHOICES);
  const complement = 100 - pct;
  const multiple = 100 / gcd(complement, 100);
  const original = multiple * randInt(1, 10);
  const newPrice = (original * complement) / 100;
  const saved = original - newPrice;
  return {
    mode: "numeric",
    text: coinFlip()
      ? t("procenten.q_reverse_price", { pct, new_price: newPrice })
      : t("procenten.q_reverse_saved", { pct, amount: saved }),
    answer: original,
    answerLabel: t("procenten.answer_label_euro"),
    visual: { kind: "pct", value: complement, label: t("procenten.visual_pay_percent", { complement }) },
  };
}

function visuals(problem) {
  const v = problem.visual;
  if (!v) return [];
  if (v.kind === "frac") return [fractionVisualSvg(v.n, v.d)];
  return [percentBarSvg(v.value, { label: v.label })];
}

/** The explorer: drag the bar and watch percentage, fraction and decimal move together. */
function explorer() {
  const bar = el("div.kmg-explorer-canvas");
  const slider = el("input.kmg-slider", {
    type: "range",
    min: "0",
    max: "100",
    value: "50",
    step: "1",
    "aria-label": t("procenten.explore_pct_label"),
  });

  function paint() {
    const pct = Number(slider.value);
    const divisor = gcd(pct, 100) || 100;
    const simplified = `${pct / divisor}/${100 / divisor}`;
    const decimal = (pct / 100).toFixed(2);
    clear(bar);
    bar.append(
      raw("div.kmg-visual", percentBarSvg(pct, { label: `${pct}% = ${simplified} = ${decimal}` })),
    );
  }

  slider.addEventListener("input", paint);
  paint();

  return expander(
    t("common.try_it_heading"),
    el("div", {}, [
      el("p", { text: t("procenten.explore_intro") }),
      el("label.kmg-explorer-label", { text: t("procenten.explore_pct_label") }),
      slider,
      bar,
    ]),
  );
}

export const render = typedAnswerGame({
  gameKey: GAME_KEY,
  emoji: "🏴‍☠️",
  questionEmoji: "💎",
  okIcon: "💰",
  badIcon: "☠️",
  tipKey: "procenten.why_tip",
  generate,
  visuals,
  answer: (problem, api) =>
    problem.mode === "choice" ? choiceAnswer(problem, api) : numberAnswer(problem, api),
  extraTop: () => explorer(),
});
