/**
 * The question -> answer -> feedback -> next loop, shared by the eight
 * arithmetic games.
 *
 * In the Streamlit app each of those eight pages carried its own copy of this
 * loop (roughly 40 near-identical lines per page, as utils/gameflow.py notes).
 * Having one copy means a change to how answering *feels* - the auto-advance,
 * the confetti aimed at the button, the answer field turning green - lands in
 * every game at once instead of eight times.
 *
 * A game supplies three things and nothing else:
 *   generate(level)          -> the problem object
 *   visuals(problem)         -> SVG strings to show under the question
 *   answer(problem, api)     -> the answer widget and how to grade it
 */
import { el } from "../dom.js";
import { t } from "../i18n.js";
import { getLevel, state } from "../state.js";
import { settleAnswer } from "../gameflow.js";
import {
  actionBar,
  gameShell,
  numberField,
  recordedCaption,
  streakNote,
} from "../ui.js";

/**
 * @param {object} config
 * @param {string} config.gameKey
 * @param {string} config.emoji           header emoji
 * @param {string} config.questionEmoji   emoji on the question card
 * @param {string} config.okIcon          feedback banner icon, correct
 * @param {string} config.badIcon         feedback banner icon, wrong
 * @param {string} config.tipKey          "why" tip shown after a wrong answer
 * @param {Function} config.generate      (level) => problem
 * @param {Function} [config.visuals]     (problem) => string[] of SVG
 * @param {Function} [config.answer]      (problem, api) => answer widget
 * @param {Function} [config.extraTop]    (rerender) => node above the question
 * @param {Function} [config.points]      (level) => number
 */
export function typedAnswerGame(config) {
  const {
    gameKey,
    emoji,
    questionEmoji = emoji,
    okIcon = "🎉",
    badIcon = "💪",
    tipKey,
    generate,
    visuals = () => [],
    answer: buildAnswer = defaultAnswer,
    extraTop = null,
    points = (level) => 5 * (level + 1),
  } = config;

  return function render(container) {
    let problem = null;
    let widget = null;
    let answered = false;

    const shell = gameShell({
      gameKey,
      emoji,
      titleKey: `${gameKey === "algebra" ? "algebra" : gameKey}.title`,
      taglineKey: `${gameKey}.tagline`,
      introKey: `${gameKey}.intro`,
      // Changing level changes the whole question set, so start a fresh one.
      onLevelChange: () => newQuestion(),
    });

    const bar = actionBar({
      checkLabel: t(`${gameKey}.check_button`),
      nextLabel: t(`${gameKey}.next_button`),
      onCheck: () => check(),
      onNext: () => newQuestion(),
    });
    const streak = streakNote();

    shell.slots.actionSlot.append(bar.node);
    shell.slots.extraSlot.append(streak, recordedCaption());

    if (extraTop) shell.slots.extraTop.append(extraTop(() => newQuestion()));

    function newQuestion() {
      shell.cancelAdvance();
      answered = false;
      const level = getLevel(gameKey);
      problem = generate(level);

      shell.setQuestion(problem.text, questionEmoji);
      shell.setVisuals(visuals(problem));
      shell.clearFeedback();

      widget = buildAnswer(problem, { submit: () => check() });
      shell.slots.answerSlot.replaceChildren(widget.node);
      bar.setAnswered(false);
      // Not on the very first render: focusing an input on a phone pops the
      // OS keyboard over the game before the child has even read the question.
      widget.focus?.();
    }

    function check() {
      if (answered) return;
      const level = getLevel(gameKey);
      const graded = widget.grade();
      // grade() returns null when nothing usable was entered - an empty box
      // must never be scored as a wrong answer.
      if (!graded) return;

      const { isCorrect, studentAnswer, correctAnswerDisplay } = graded;
      answered = true;
      bar.setAnswered(true);
      widget.reveal?.(isCorrect, correctAnswerDisplay);

      const earned = points(level);
      settleAnswer({
        gameKey,
        level,
        questionText: problem.text,
        studentAnswer,
        correctAnswer: correctAnswerDisplay,
        isCorrect,
        points: earned,
        burstFrom: isCorrect ? bar.check : null,
      });

      if (isCorrect) {
        shell.setFeedback("success", t(`${gameKey}.correct`, { points: earned }), {
          icon: okIcon,
        });
        // Straight on to the next question while the child is in flow. A
        // wrong answer does not auto-advance: that is the one moment they
        // need time to read what the answer should have been.
        shell.scheduleAdvance(() => newQuestion());
      } else {
        shell.setFeedback(
          "error",
          `${t(`${gameKey}.incorrect`)} ${t("common.correct_answer_was", { answer: correctAnswerDisplay })}`,
          { icon: badIcon, tip: tipKey ? t(tipKey) : null },
        );
      }
      streak.refresh();
      shell.picker.refresh();
    }

    container.append(shell.root);
    newQuestion();

    return () => shell.destroy();
  };
}

/**
 * One number field, graded against problem.answer.
 *
 * The problem object can steer it:
 *   answerLabel  - label above the field (default "your answer")
 *   decimal      - show the decimal separator key
 *   negative     - show the +/- key
 *   tolerance    - accept anything within +/- this of the answer (money,
 *                  one-decimal answers), instead of exact equality
 *   answerDisplay- what to show as "the answer was ...", when the raw number
 *                  is not how a child would write it
 *
 * @param {Node} [options.before] extra content placed above the field.
 */
export function numberAnswer(problem, api, options = {}) {
  const field = numberField({
    label: problem.answerLabel || t("common.your_answer"),
    decimal: problem.decimal === true,
    negative: problem.negative === true,
    onSubmit: api.submit,
  });
  const node = options.before ? el("div", {}, [options.before, field.node]) : field.node;
  return {
    node,
    focus: field.focus,
    grade: () => {
      const value = field.value();
      if (value == null) return null;
      const isCorrect = problem.tolerance
        ? Math.abs(value - problem.answer) < problem.tolerance
        : value === problem.answer;
      return {
        isCorrect,
        studentAnswer: value,
        correctAnswerDisplay: problem.answerDisplay ?? problem.answer,
      };
    },
    reveal: (ok) => field.markResult(ok),
  };
}

const defaultAnswer = (problem, api) => numberAnswer(problem, api);

/**
 * A multiple-choice widget where the tap *is* the answer - there is no
 * separate check step, because for a choice question the pick is the
 * decision.
 */
export function choiceAnswer(problem, api, { columns = null } = {}) {
  const grid = el("div.kmg-choices", {
    style: { "--kmg-cols": String(columns ?? (problem.options.length <= 4 ? 2 : 3)) },
  });
  let picked = null;

  problem.options.forEach((option) => {
    const button = el("button.kmg-choice", {
      type: "button",
      text: String(option),
      onClick: () => {
        if (picked !== null) return;
        picked = option;
        api.submit();
      },
    });
    grid.append(button);
  });

  return {
    node: el("div", {}, [el("p.kmg-answer-label", { text: t("common.choose_answer") }), grid]),
    grade: () => {
      if (picked === null) return null;
      return {
        isCorrect: picked === problem.answer,
        studentAnswer: picked,
        correctAnswerDisplay: problem.answer,
      };
    },
    reveal: (ok, correct) => {
      [...grid.children].forEach((button) => {
        button.disabled = true;
        if (button.textContent === String(correct)) button.classList.add("is-right");
        else if (button.textContent === String(picked)) button.classList.add("is-wrong");
      });
    },
  };
}

/** Two number fields side by side (x and y, quotient and remainder, ...). */
export function twoFieldAnswer(problem, api, { labelA, labelB, gradeFn, negative = false }) {
  const a = numberField({ label: labelA, negative, onSubmit: api.submit });
  const b = numberField({ label: labelB, negative, onSubmit: api.submit });
  const node = el("div.kmg-two-fields", {}, [a.node, b.node]);
  return {
    node,
    focus: a.focus,
    grade: () => {
      const va = a.value();
      const vb = b.value();
      if (va == null || vb == null) return null;
      return gradeFn(va, vb);
    },
    reveal: (ok) => {
      a.markResult(ok);
      b.markResult(ok);
    },
  };
}

/** Format money with the selected language's decimal separator. */
export function formatEuro(value, language) {
  const text = Number(value).toFixed(2);
  return language === "nl" ? text.replace(".", ",") : text;
}

/** Format a plain decimal with no trailing zeros, in the right separator. */
export function formatDecimal(value, language) {
  const text = String(Number(Number(value).toPrecision(12)));
  return language === "nl" ? text.replace(".", ",") : text;
}

/** One decimal place, in the right separator (Getallen Universum). */
export function formatNum1(value, language) {
  const text = Number(value).toFixed(1);
  return language === "nl" ? text.replace(".", ",") : text;
}

/** The sign-prefixed form negative-number questions read better with. */
export function fmtSigned(value) {
  return value < 0 ? `(${value})` : String(value);
}

export { state };
