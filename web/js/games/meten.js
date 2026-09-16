/**
 * Meten is Weten - unit conversion, time intervals and money.
 * Ported from pages/03_Meten_is_Weten.py.
 */
import { getLanguage, t } from "../i18n.js";
import { choice, coinFlip, randInt, range } from "../rng.js";
import { clockSvg, ratioBarSvg, tapeDiagramSvg } from "../visuals.js";
import { formatDecimal, formatEuro, typedAnswerGame } from "./common.js";

const GAME_KEY = "meten";

const CONVERSIONS = [
  ["cm", "mm", 10],
  ["m", "cm", 100],
  ["km", "m", 1000],
  ["kg", "g", 1000],
  ["l", "ml", 1000],
];
const DECIMAL_STEPS = [0.25, 0.5, 0.75, 1.5, 2.5, 3.5, 4.5];

export function generate(level) {
  const lang = getLanguage();
  let answerKind = "int"; // "int" or "euro"
  let visual = null;
  let text;
  let answer;
  let answerLabel;

  if (level === 0) {
    // cm/mm or m/cm only - the smaller factors.
    const [unit1, unit2, factor] = choice(CONVERSIONS.slice(0, 2));
    if (coinFlip()) {
      const val1 = randInt(1, 10);
      const val2 = val1 * factor;
      text = t("meten.q_convert", { v1: val1, u1: unit1, v2: val2, u2: unit2 });
      answer = val2;
    } else {
      const val2 = randInt(1, 10);
      const val1 = val2 * factor;
      text = t("meten.q_convert", { v1: val1, u1: unit2, v2: val2, u2: unit1 });
      answer = val2;
    }
    answerLabel = t("meten.answer_label_generic");
  } else if (level === 1) {
    const [unit1, unit2, factor] = choice(CONVERSIONS);
    if (coinFlip()) {
      const val1 = randInt(1, 20);
      const val2 = val1 * factor;
      text = t("meten.q_convert", { v1: val1, u1: unit1, v2: val2, u2: unit2 });
      answer = val2;
    } else {
      const val2 = randInt(1, 20);
      const val1 = val2 * factor;
      text = t("meten.q_convert", { v1: val1, u1: unit2, v2: val2, u2: unit1 });
      answer = val2;
    }
    answerLabel = t("meten.answer_label_generic");
  } else if (level === 2) {
    // Only offer decimal steps that convert to a *whole* number of the smaller
    // unit: 0.25 cm has to be 2.5 mm, and a whole-number answer box cannot
    // take that.
    const [unit1, unit2, factor] = choice(CONVERSIONS);
    const usable = DECIMAL_STEPS.filter((s) => Number.isInteger(s * factor));
    const val1 = choice(usable);
    const val2 = Math.round(val1 * factor);
    text = t("meten.q_convert", {
      v1: formatDecimal(val1, lang),
      u1: unit1,
      v2: val2,
      u2: unit2,
    });
    answer = val2;
    answerLabel = t("meten.answer_label_generic");
  } else if (level === 3) {
    const [unitBig, unitSmall, factor] = choice(CONVERSIONS);
    const a = randInt(1, 9);
    const b = randInt(1, factor - 1);
    text = t("meten.q_combo", { a, u_big: unitBig, b, u_small: unitSmall });
    answer = a * factor + b;
    answerLabel = t("meten.answer_label_generic");
    visual = { kind: "ratio", parts: [a * factor, b], labels: [`${a} ${unitBig}`, `${b} ${unitSmall}`] };
  } else if (level === 4) {
    const startMinutes = randInt(0, 23 * 60 + 55 - 180);
    const gap = choice([15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120]);
    const endMinutes = startMinutes + gap;
    const pad = (n) => String(n).padStart(2, "0");
    const t1 = `${pad(Math.floor(startMinutes / 60))}:${pad(startMinutes % 60)}`;
    const t2 = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;
    text = t(choice(["meten.q_time_between", "meten.q_time_countdown"]), { t1, t2 });
    answer = gap;
    answerLabel = t("meten.answer_label_minutes");
    visual = { kind: "clock", startMinutes, endMinutes };
  } else {
    answerKind = "euro";
    if (coinFlip()) {
      const price = Math.round(choice(range(4, 200).map((x) => x / 20)) * 100) / 100;
      const notes = [5, 10, 20].filter((n) => n > price);
      const paid = notes.length ? Math.min(...notes) : 20;
      text = t("meten.q_money_change", {
        price: formatEuro(price, lang),
        paid: formatEuro(paid, lang),
      });
      answer = Math.round((paid - price) * 100) / 100;
      visual = { kind: "tape", total: paid, part: price };
    } else {
      const price = choice([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5]);
      const qty = randInt(2, 6);
      text = t("meten.q_money_total", { qty, price: formatEuro(price, lang) });
      answer = Math.round(price * qty * 100) / 100;
      visual = {
        kind: "ratio",
        parts: Array(qty).fill(price),
        labels: Array(qty).fill(`€${formatEuro(price, lang)}`),
      };
    }
    answerLabel = t("meten.answer_label_euro");
  }

  return {
    text,
    answer,
    answerKind,
    answerLabel,
    visual,
    decimal: answerKind === "euro",
    // Money answers are compared with a tolerance rather than by equality:
    // 0.1 + 0.2 is not 0.3 in binary floating point, in any language.
    tolerance: answerKind === "euro" ? 0.005 : null,
    answerDisplay: answerKind === "euro" ? formatEuro(answer, lang) : answer,
  };
}

function visuals(problem) {
  const v = problem.visual;
  if (!v) return [];
  const lang = getLanguage();
  if (v.kind === "clock") {
    return [
      clockSvg(Math.floor(v.startMinutes / 60), v.startMinutes % 60),
      clockSvg(Math.floor(v.endMinutes / 60), v.endMinutes % 60),
    ];
  }
  if (v.kind === "tape") {
    return [
      tapeDiagramSvg(v.total, v.part, {
        totalLabel: `€${formatEuro(v.total, lang)}`,
        partLabel: `€${formatEuro(v.part, lang)}`,
        restLabel: "?",
      }),
    ];
  }
  return [ratioBarSvg(v.parts, { labels: v.labels })];
}

export const render = typedAnswerGame({
  gameKey: GAME_KEY,
  emoji: "🏗️",
  questionEmoji: "🧱",
  okIcon: "👷",
  badIcon: "🚧",
  tipKey: "meten.why_tip",
  generate,
  visuals,
});
