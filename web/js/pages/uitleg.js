/**
 * Uitleg Concepten - the "how does this actually work" reference a child can
 * open mid-game. Ported from pages/05_Uitleg_Concepten.py.
 */
import { t, tMd } from "../i18n.js";
import { el, raw } from "../dom.js";
import { expander, pageHeader } from "../ui.js";
import { getGameIllustration } from "../illustrations.js";

// [topic key suffix, emoji] - the order the concepts are met in the games.
const TOPICS = [
  ["tafel", "✖️"],
  ["breuken", "🍕"],
  ["meten", "📏"],
  ["procenten", "💯"],
  ["algebra", "🕵️"],
  ["meetkunde", "📐"],
  ["verhoudingen", "🚗"],
  ["getallen", "🔢"],
  ["logica", "🧠"],
  ["code", "🔐"],
  ["snel", "⚡"],
];

export function render(container) {
  const root = el("section.kmg-uitleg");

  root.append(
    pageHeader("uitleg.title", {
      subtitleKey: "uitleg.subtitle",
      emoji: "📖",
      illustration: getGameIllustration("uitleg"),
    }),
    raw("div.kmg-intro", tMd("uitleg.intro")),
  );

  for (const [key, emoji] of TOPICS) {
    root.append(
      expander(`${emoji}  ${t(`uitleg.topic_${key}`)}`, raw("div.kmg-prose", tMd(`uitleg.body_${key}`))),
    );
  }

  root.append(
    el("div.kmg-banner.kmg-banner-info", {}, [
      el("span.kmg-banner-icon", { text: "💡" }),
      el("span.kmg-banner-body", { text: t("uitleg.footer") }),
    ]),
  );

  container.append(root);
}
