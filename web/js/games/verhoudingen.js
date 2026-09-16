/**
 * Verhoudingen & Snelheid - ratios, map scale, speed/distance/time, unit
 * prices and multi-step travel problems.
 * Ported from pages/09_Verhoudingen_en_Snelheid.py.
 */
import { getLanguage, t } from "../i18n.js";
import { choice, gcd, randInt, range } from "../rng.js";
import { ratioBarSvg, speedDiagramSvg } from "../visuals.js";
import { formatEuro, typedAnswerGame } from "./common.js";

const GAME_KEY = "verhoudingen";

export function generate(level) {
  const lang = getLanguage();
  let answerKind = "int";
  let visual = null;
  let text;
  let answer;
  let answerLabel;

  if (level === 0 || level === 1) {
    // A ratio only simplifies cleanly if the two parts are coprime to start
    // with, so redraw until they are.
    const [lo, hi] = level === 0 ? [1, 3] : [2, 6];
    let p = randInt(lo, hi);
    let q = randInt(lo, hi);
    while (gcd(p, q) !== 1) {
      p = randInt(lo, hi);
      q = randInt(lo, hi);
    }
    const factor = level === 0 ? randInt(2, 3) : randInt(2, 6);
    const a = p * factor;
    const b = q * factor;
    text = t("verhoudingen.q_simplify", { a, b, q });
    answer = p;
    answerLabel = t("verhoudingen.answer_label_number");
    visual = ratioBarSvg([a, b], { labels: [String(a), String(b)] });
  } else if (level === 2) {
    const scale = choice([100, 200, 500, 1000, 2000]);
    const mapCm = randInt(2, 20);
    text = t("verhoudingen.q_scale", { scale, map_cm: mapCm });
    answer = Math.floor((mapCm * scale) / 100);
    answerLabel = t("verhoudingen.answer_label_meter");
  } else if (level === 3) {
    const speed = choice(range(20, 121, 10));
    const time = randInt(1, 6);
    const distance = speed * time;
    const subtype = choice(["find_speed", "find_distance", "find_time"]);
    if (subtype === "find_speed") {
      text = t("verhoudingen.q_speed_find_speed", { distance, time });
      answer = speed;
      answerLabel = t("verhoudingen.answer_label_kmh");
      visual = speedDiagramSvg(distance, "km", time, t("units.hour"));
    } else if (subtype === "find_distance") {
      text = t("verhoudingen.q_speed_find_distance", { time, speed });
      answer = distance;
      answerLabel = t("verhoudingen.answer_label_km");
      visual = speedDiagramSvg(speed, t("units.kmh"), time, t("units.hour"));
    } else {
      text = t("verhoudingen.q_speed_find_time", { distance, speed });
      answer = time;
      answerLabel = t("verhoudingen.answer_label_hour");
      visual = speedDiagramSvg(distance, "km", speed, t("units.kmh"));
    }
  } else if (level === 4) {
    answerKind = "euro";
    const pricePerUnit = choice([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]);
    const qty = randInt(3, 12);
    const totalPrice = Math.round(pricePerUnit * qty * 100) / 100;
    text = t("verhoudingen.q_unit_price", { qty, total_price: formatEuro(totalPrice, lang) });
    answer = pricePerUnit;
    answerLabel = t("verhoudingen.answer_label_euro");
    visual = ratioBarSvg(Array(qty).fill(1), { labels: Array(qty).fill("?") });
  } else {
    const speed = choice(range(20, 121, 4));
    const time = randInt(1, 4);
    // 15/30/45 only: an "extra" of 0 produced questions reading "... in 3
    // hours and 0 minutes", which is both clumsy and not the multi-step
    // problem this level is meant to be asking.
    const extraMin = choice([15, 30, 45]);
    const distance = Math.floor((speed * (time * 60 + extraMin)) / 60);
    text = t("verhoudingen.q_multi_step", { speed, time, extra_min: extraMin });
    answer = distance;
    answerLabel = t("verhoudingen.answer_label_km");
    visual = speedDiagramSvg(
      `${speed} ${t("units.kmh")}`,
      "",
      `${time}${t("units.hour_abbr")} ${extraMin}${t("units.min_abbr")}`,
      "",
    );
  }

  return {
    text,
    answer,
    answerKind,
    answerLabel,
    visual,
    decimal: answerKind === "euro",
    tolerance: answerKind === "euro" ? 0.005 : null,
    answerDisplay: answerKind === "euro" ? formatEuro(answer, lang) : answer,
  };
}

export const render = typedAnswerGame({
  gameKey: GAME_KEY,
  emoji: "🚗",
  questionEmoji: "🚗",
  okIcon: "🏁",
  badIcon: "🚧",
  tipKey: "verhoudingen.why_tip",
  generate,
  visuals: (problem) => (problem.visual ? [problem.visual] : []),
});
