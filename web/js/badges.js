/**
 * Milestone badges - a light "why keep playing" layer on top of the raw
 * score, independent of any one game. Straight port of utils/badges.py:
 * same eight badges, same thresholds, same display order.
 *
 * checkNewBadges() is called once per answered question, after that
 * question's score/level/streak updates have landed, and returns whatever
 * was newly earned so it can be celebrated.
 */
import { GAME_KEYS, MAX_LEVEL, getLevel, state } from "./state.js";

const playedAllGames = () => GAME_KEYS.every((k) => state.gamesTried.has(k));
const anyLevelMaxed = () => GAME_KEYS.some((k) => getLevel(k) >= MAX_LEVEL);
const allLevelsMaxed = () => GAME_KEYS.every((k) => getLevel(k) >= MAX_LEVEL);

// [id, emoji, check] - the order doubles as the display order.
export const BADGE_DEFS = [
  ["q10", "🥉", () => state.questionsAnswered >= 10],
  ["q50", "🥈", () => state.questionsAnswered >= 50],
  ["q100", "🥇", () => state.questionsAnswered >= 100],
  ["streak5", "🔥", () => state.streaks >= 5],
  ["streak10", "🔥🔥", () => state.streaks >= 10],
  ["explorer", "🗺️", playedAllGames],
  ["level5", "⭐", anyLevelMaxed],
  ["mastermind", "👑", allLevelsMaxed],
];

export const BADGE_IDS = BADGE_DEFS.map((b) => b[0]);
export const BADGE_EMOJI = Object.fromEntries(BADGE_DEFS.map((b) => [b[0], b[1]]));

/**
 * Evaluate every badge, update state.badges, and return the
 * [id, emoji] pairs newly earned by this call.
 */
export function checkNewBadges() {
  const earned = new Set(state.badges);
  const newly = [];
  for (const [id, emoji, check] of BADGE_DEFS) {
    if (!earned.has(id) && check()) {
      earned.add(id);
      newly.push([id, emoji]);
    }
  }
  state.badges = BADGE_IDS.filter((id) => earned.has(id));
  return newly;
}
