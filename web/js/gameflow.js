/**
 * "What happens after an answer", in one place - the port of
 * utils/gameflow.py.
 *
 * In the Streamlit app only the four newest games used settle_answer(); the
 * original eight each carried their own inline copy of the same ~40 lines.
 * On this side every game goes through here, so scoring, logging, levelling,
 * badges and the celebration all behave identically no matter which game a
 * child is playing.
 */
import { checkNewBadges } from "./badges.js";
import { logAttempt } from "./log.js";
import { t } from "./i18n.js";
import {
  MAX_LEVEL,
  MIN_LEVEL,
  addScore,
  countAttemptOnly,
  getLevel,
  markLevelCompleted,
  registerAttempt,
  resetStreak,
  saveCurrentProfile,
  setLevel,
  state,
} from "./state.js";
import * as sound from "./sound.js";
import { bigCelebration, confetti, levelUpOverlay, toast } from "./fx.js";
import { levelLabel } from "./ui-bits.js";

/**
 * Record and react to one answered question.
 *
 * @param {object} options
 * @param {string} options.gameKey
 * @param {number} options.level
 * @param {string} options.questionText
 * @param {*} options.studentAnswer
 * @param {*} options.correctAnswer
 * @param {boolean} options.isCorrect
 * @param {number} options.points
 * @param {boolean} [options.adaptLevel=true]  false inside a timed round: a
 *   child answers a dozen questions in 60 seconds, and letting the difficulty
 *   climb three times mid-round would change the game under their feet.
 *   Those games adapt once, at the end, via adaptAfterRound().
 * @param {boolean} [options.score=true]  false for games that award their own
 *   points (a speed bonus, or a deduction game paying out only when the code
 *   is finally cracked).
 * @param {Element} [options.burstFrom]  element to fire the confetti out of.
 * @returns {{leveledUp: boolean, leveledDown: boolean}}
 */
export function settleAnswer({
  gameKey,
  level,
  questionText,
  studentAnswer,
  correctAnswer,
  isCorrect,
  points,
  adaptLevel = true,
  score = true,
  burstFrom = null,
}) {
  logAttempt({
    gameKey,
    gameName: t(`game.${gameKey}.name`),
    level,
    question: questionText,
    studentAnswer,
    correctAnswer,
    isCorrect,
    points,
  });

  let leveledUp = false;
  let leveledDown = false;
  if (adaptLevel) {
    ({ leveledUp, leveledDown } = registerAttempt(gameKey, isCorrect));
  } else {
    // Still count the question and mark the game as tried, so the session
    // stats and the "explorer" badge stay honest - just without moving the
    // difficulty.
    countAttemptOnly(gameKey, isCorrect);
  }

  if (isCorrect) {
    if (score) addScore(points);
    sound.playCorrect(state.streaks);
    if (burstFrom) {
      const rect = burstFrom.getBoundingClientRect();
      confetti({ x: rect.left + rect.width / 2, y: rect.top, count: 34 });
    }
  } else {
    resetStreak();
    sound.playIncorrect();
  }

  if (leveledUp) {
    const newLevel = getLevel(gameKey);
    levelUpOverlay(t("common.level_up", { level: newLevel }), levelLabel(newLevel));
    sound.playLevelUp();
    bigCelebration();
  } else if (leveledDown) {
    toast(t("common.level_down", { level: getLevel(gameKey) }), "💪");
  }

  for (const [badgeId, emoji] of checkNewBadges()) {
    toast(t(`badges.${badgeId}.name`), emoji, 4200);
    sound.playBadge();
    confetti({ count: 40 });
  }

  saveCurrentProfile();
  return { leveledUp, leveledDown };
}

/**
 * Level a timed game up or down once, based on how the whole round went
 * rather than on a streak of individual answers.
 *
 * A round is the natural unit here: 9 of 10 right means "that was too easy"
 * far more reliably than three quick correct answers in a row does, since in
 * a speed game those three can just be three easy draws.
 *
 * @returns {{leveledUp: boolean, leveledDown: boolean}}
 */
export function adaptAfterRound(gameKey, correct, total, { upRatio = 0.8, downRatio = 0.4 } = {}) {
  if (total <= 0) return { leveledUp: false, leveledDown: false };
  const ratio = correct / total;
  const current = getLevel(gameKey);

  if (ratio >= upRatio) {
    markLevelCompleted(gameKey, current);
    if (current < MAX_LEVEL) {
      setLevel(gameKey, current + 1);
      const newLevel = getLevel(gameKey);
      levelUpOverlay(t("common.level_up", { level: newLevel }), levelLabel(newLevel));
      sound.playLevelUp();
      bigCelebration();
      saveCurrentProfile();
      return { leveledUp: true, leveledDown: false };
    }
    saveCurrentProfile();
    return { leveledUp: false, leveledDown: false };
  }
  if (ratio <= downRatio && current > MIN_LEVEL) {
    setLevel(gameKey, current - 1);
    toast(t("common.level_down", { level: getLevel(gameKey) }), "💪");
    saveCurrentProfile();
    return { leveledUp: false, leveledDown: true };
  }
  return { leveledUp: false, leveledDown: false };
}
