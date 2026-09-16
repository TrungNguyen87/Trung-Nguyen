/**
 * Small shared UI vocabulary. Split out from ui.js so gameflow.js can use
 * levelLabel() without importing the whole game shell (which imports
 * gameflow itself).
 */
import { t } from "./i18n.js";
import { MAX_LEVEL, MIN_LEVEL, getMaxLevel } from "./state.js";

export const DIFFICULTY_KEYS = [
  "common.difficulty_warmup",
  "common.difficulty_easy",
  "common.difficulty_medium",
  "common.difficulty_hard",
  "common.difficulty_expert",
  "common.difficulty_master",
  "common.difficulty_monster",
];

export function levelLabel(level) {
  const idx = Math.max(0, Math.min(DIFFICULTY_KEYS.length - 1, level));
  return t(DIFFICULTY_KEYS[idx]);
}

export const LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);

export function getLevels(gameKey = null) {
  const max = gameKey ? getMaxLevel(gameKey) : MAX_LEVEL;
  return Array.from({ length: max - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);
}

/** Format a number the way the selected language writes it. */
export function formatDecimal(value, digits = null) {
  const text = digits == null ? String(Number(value)) : Number(value).toFixed(digits);
  return text;
}
