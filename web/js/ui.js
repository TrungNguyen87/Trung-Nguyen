/**
 * The shared game shell and the answer widgets every game is built from.
 *
 * This is where most of the interaction improvement over the Streamlit
 * version lives:
 *
 *   - A real on-screen number pad. st.number_input renders a small desktop
 *     spinner; on a tablet it summons the OS keyboard over half the screen,
 *     which is where the visual and the question were. The pad here is
 *     thumb-sized, always visible, and never covers the pizza.
 *   - Answering is one gesture. Type and press the big green check, or just
 *     press Enter. A correct answer auto-advances after a beat, so a child in
 *     flow never has to hunt for "next".
 *   - Multiple-choice questions are big tappable cards, not radio buttons,
 *     and the right one is revealed in place after a wrong pick instead of
 *     only being named in a sentence underneath.
 *   - Everything is instant, because nothing here needs the network.
 */
import { el, clear, nextFrame, raw } from "./dom.js";
import { t, tMd } from "./i18n.js";
import {
  MAX_LEVEL,
  getMaxLevel,
  getLevel,
  setLevel,
  isLevelCompleted,
  nextUncompletedLevel,
  state,
} from "./state.js";
import { LEVELS, getLevels, levelLabel } from "./ui-bits.js";
import { getGameIllustration } from "./illustrations.js";
import * as sound from "./sound.js";

/** How long a correct answer's celebration shows before the next question. */
const AUTO_ADVANCE_MS = 1150;

// ---------------------------------------------------------------------------
// Page scaffolding
// ---------------------------------------------------------------------------

export function pageHeader(titleKey, { subtitleKey = null, emoji = "", illustration = null } = {}) {
  const heroNode = illustration ? raw("div.kmg-page-hero", illustration) : null;
  const textNode = el("div.kmg-page-head-text", {}, [
    el("h1.kmg-page-title", {}, [emoji ? el("span.kmg-page-emoji", { text: emoji }) : null, t(titleKey)]),
    subtitleKey ? el("p.kmg-page-sub", { text: t(subtitleKey) }) : null,
  ]);
  return el("header.kmg-page-head", {}, [heroNode, textNode]);
}

/** A collapsible section - the equivalent of st.expander. */
export function expander(summaryText, contentNode, { open = false } = {}) {
  return el("details.kmg-expander", { open }, [
    el("summary", { text: summaryText }),
    el("div.kmg-expander-body", {}, [contentNode]),
  ]);
}

/**
 * The interactive level picker shown at the top of every game.
 *
 * This is a *manual* override the child can tap directly, on top of the
 * automatic adaptive levelling that already happens after a streak of
 * right/wrong answers - so levelling up is always visible and never only
 * something that happens invisibly in the background.
 */
export function levelPicker(gameKey, onChange) {
  const wrap = el("div.kmg-levelpicker");
  const label = el("div.kmg-levelpicker-label", { text: t("common.choose_level") });
  const row = el("div.kmg-levelrow");
  const badge = el("div.kmg-level-badge");
  const completedNotice = el("div.kmg-level-completed-notice");
  completedNotice.hidden = true;
  const max = getMaxLevel(gameKey);
  const levels = getLevels(gameKey);

  const paint = (animate = false) => {
    const current = getLevel(gameKey);
    const isCompleted = isLevelCompleted(gameKey, current);
    const nextUnfinished = nextUncompletedLevel(gameKey);

    [...row.children].forEach((btn) => {
      const lvl = Number(btn.dataset.level);
      const isCurrent = lvl === current;
      const isDone = isLevelCompleted(gameKey, lvl);
      btn.classList.toggle("is-current", isCurrent);
      btn.classList.toggle("is-completed", isDone);
      btn.setAttribute("aria-pressed", String(isCurrent));
      btn.innerHTML = `${lvl}${isDone ? '<span class="kmg-levelbtn-check" aria-hidden="true">✓</span>' : ""}`;
    });

    badge.textContent = `⭐ ${t("common.level")} ${current}/${max} — ${levelLabel(current)}${isCompleted ? " (" + t("progress.done") + " ✓)" : ""}`;
    // The badge pops once when the level actually changed and then sits
    // still: a badge that bounced on every repaint would stop meaning
    // "you levelled up".
    if (animate) {
      badge.classList.remove("kmg-levelup");
      void badge.offsetWidth; // restart the animation
      badge.classList.add("kmg-levelup");
    }

    if (isCompleted && nextUnfinished !== current) {
      completedNotice.hidden = false;
      clear(completedNotice);
      completedNotice.append(
        el("span.kmg-level-completed-msg", { text: `✓ ${t("common.level_completed_tip")}` }),
        el("button.kmg-btn.kmg-btn-sm.kmg-btn-ghost", {
          type: "button",
          text: t("common.jump_to_next_level", { level: nextUnfinished }),
          onClick: () => {
            setLevel(gameKey, nextUnfinished);
            sound.playTap();
            paint(true);
            onChange?.(nextUnfinished);
          },
        }),
      );
    } else {
      completedNotice.hidden = true;
    }
  };

  for (const level of levels) {
    row.append(
      el("button.kmg-levelbtn", {
        type: "button",
        text: String(level),
        dataset: { level },
        title: levelLabel(level),
        onClick: () => {
          // Tapping the already-active level is a no-op: doing the work would
          // reset the adaptive-difficulty streak counters for no reason.
          if (getLevel(gameKey) === level) return;
          setLevel(gameKey, level);
          sound.playTap();
          paint(true);
          onChange?.(level);
        },
      }),
    );
  }

  wrap.append(label, row, badge, completedNotice);
  wrap.refresh = paint;
  paint();
  return wrap;
}

/**
 * The current question, in an animated card. Each new question slides up and
 * gets a one-off light sweep, so it is obvious at a glance that the question
 * actually changed - "6 x 7?" becoming "6 x 8?" is otherwise easy to miss.
 */
export function questionCard(text, emoji = "") {
  const card = el("div.kmg-question", {}, [
    emoji ? el("span.kmg-question-emoji", { text: emoji }) : null,
    el("span.kmg-question-text", { html: text }),
  ]);
  return card;
}

/** Green pop for a correct answer, red shake for a wrong one. */
export function feedbackBanner(kind, message, { tip = null, icon = null } = {}) {
  const ok = kind === "success";
  const node = el(`div.kmg-banner.${ok ? "kmg-banner-ok" : "kmg-banner-bad"}`, {
    role: "status",
  });
  node.append(
    el("span.kmg-banner-icon", { text: icon ?? (ok ? "🎉" : "💪") }),
    el("span.kmg-banner-body", {}, [
      el("span.kmg-banner-msg", { html: message }),
      tip ? el("span.kmg-banner-tip", { text: tip }) : null,
    ]),
  );
  return node;
}

// ---------------------------------------------------------------------------
// Answer widgets
// ---------------------------------------------------------------------------

// Three columns, laid out the way a calculator and a phone keypad both are:
//   7 8 9
//   4 5 6
//   1 2 3
// then a bottom row carrying 0, backspace and whichever extra key this
// question needs. Children already know this arrangement; a pad that reflows
// the digits into rows of four costs them a hunt on every answer.
const PAD_ROWS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

/**
 * A big number entry with its own on-screen pad.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {boolean} [options.decimal]  show the decimal separator key
 * @param {boolean} [options.negative] show the +/- key
 * @param {Function} [options.onSubmit] called when Enter or the pad's ✓ fires
 */
export function numberField({ label, decimal = false, negative = false, onSubmit } = {}) {
  const input = el("input.kmg-numinput", {
    type: "text",
    // "decimal" rather than "numeric": on iOS the numeric pad has no comma
    // key, which makes a euro answer impossible to type.
    inputmode: decimal ? "decimal" : "numeric",
    autocomplete: "off",
    "aria-label": label,
    placeholder: "?",
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
    }
  });
  // Accept both separators whatever the language: a Dutch child typing 2.5 on
  // a laptop numpad and 2,5 on a tablet means the same thing.
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9,.\-]/g, "");
  });

  const pad = el("div.kmg-pad");
  // pointerdown rather than click: it fires before the input loses focus, so
  // the caret does not jump and a fast child does not lose a keystroke.
  const press = (fn) => (event) => {
    event.preventDefault();
    fn();
    sound.playTap();
    input.focus();
  };

  const digitKey = (key) =>
    el("button.kmg-padkey", {
      type: "button",
      text: key,
      onPointerdown: press(() => {
        input.value += key;
      }),
    });

  for (const row of PAD_ROWS) {
    for (const key of row) pad.append(digitKey(key));
  }

  // The bottom row: any extra key this question needs, then 0, then backspace.
  const extras = [];
  if (decimal) {
    extras.push(
      el("button.kmg-padkey", {
        type: "button",
        text: ",",
        "aria-label": t("common.decimal_key"),
        onPointerdown: press(() => {
          // One separator only, and only after a digit - ",5" is not a number
          // a child means to type.
          if (!/[.,]/.test(input.value) && input.value.replace("-", "") !== "") {
            input.value += ",";
          }
        }),
      }),
    );
  }
  if (negative) {
    extras.push(
      el("button.kmg-padkey", {
        type: "button",
        text: "±",
        "aria-label": t("common.sign_key"),
        onPointerdown: press(() => {
          input.value = input.value.startsWith("-") ? input.value.slice(1) : `-${input.value}`;
        }),
      }),
    );
  }

  const zero = digitKey("0");
  // With no extra key the bottom row would be 0 and backspace in a three-wide
  // grid, leaving a hole; widening 0 fills it and gives the most-used key the
  // biggest target.
  if (!extras.length) zero.classList.add("kmg-padkey-wide");

  pad.append(
    ...extras,
    zero,
    el("button.kmg-padkey.kmg-padkey-del", {
      type: "button",
      text: "⌫",
      "aria-label": t("common.backspace_key"),
      onPointerdown: press(() => {
        input.value = input.value.slice(0, -1);
      }),
    }),
  );

  const node = el("div.kmg-answer", {}, [
    el("label.kmg-answer-label", { text: label }),
    input,
    pad,
  ]);

  return {
    node,
    input,
    focus: () => input.focus({ preventScroll: true }),
    clear: () => {
      input.value = "";
      input.classList.remove("is-wrong", "is-right");
    },
    markResult: (ok) => input.classList.add(ok ? "is-right" : "is-wrong"),
    /** null when nothing usable was typed, so "no answer" never scores. */
    value: () => {
      const raw = input.value.trim().replace(",", ".");
      if (raw === "" || raw === "-" || raw === "." || raw === "-.") return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    },
    setDisabled: (disabled) => {
      input.disabled = disabled;
      [...pad.children].forEach((b) => (b.disabled = disabled));
    },
  };
}

/**
 * Big tappable answer cards. One tap answers - there is no separate check
 * step, because for a multiple-choice question the tap *is* the answer.
 *
 * @param {object} options
 * @param {Array} options.options
 * @param {Function} options.onPick  (value, buttonElement) => void
 * @param {number} [options.columns]
 */
export function choiceGrid({ options, onPick, columns = null }) {
  const cols = columns ?? (options.length <= 2 ? 2 : options.length <= 4 ? 2 : 3);
  const grid = el("div.kmg-choices", { style: { "--kmg-cols": String(cols) } });

  options.forEach((option) => {
    const button = el("button.kmg-choice", {
      type: "button",
      html: String(option),
      onClick: () => onPick(option, button),
    });
    grid.append(button);
  });

  return {
    node: grid,
    buttons: () => [...grid.children],
    /** Freeze the grid and colour the picked/right answers in place. */
    reveal: (picked, correct) => {
      [...grid.children].forEach((button) => {
        button.disabled = true;
        const value = button.textContent;
        if (value === String(correct)) button.classList.add("is-right");
        else if (value === String(picked)) button.classList.add("is-wrong");
      });
    },
  };
}

/** The check / next action bar shared by the typed-answer games. */
export function actionBar({ onCheck, onNext, checkLabel, nextLabel }) {
  const check = el("button.kmg-btn.kmg-btn-primary", {
    type: "button",
    html: checkLabel,
    onClick: onCheck,
  });
  const next = el("button.kmg-btn.kmg-btn-ghost", {
    type: "button",
    html: nextLabel,
    onClick: onNext,
  });
  const node = el("div.kmg-actions", {}, [check, next]);
  return {
    node,
    check,
    next,
    /** After an answer the check button has nothing left to do. */
    setAnswered: (answered) => {
      check.disabled = answered;
      next.classList.toggle("kmg-btn-primary", answered);
      next.classList.toggle("kmg-btn-ghost", !answered);
    },
  };
}

// ---------------------------------------------------------------------------
// The game shell
// ---------------------------------------------------------------------------

/**
 * Builds the standard game page and returns handles to its slots.
 *
 * Games call `shell.newQuestion(...)` and `shell.settle(...)` rather than
 * rebuilding the page themselves, which is what keeps each game file down to
 * its generator plus its own kind of answer widget.
 */
export function gameShell({
  gameKey,
  emoji,
  titleKey,
  taglineKey,
  introKey,
  onLevelChange,
  autoAdvance = true,
}) {
  const root = el("section.kmg-game", { dataset: { game: gameKey } });

  const head = pageHeader(titleKey, { emoji, illustration: getGameIllustration(gameKey) });
  const tagline = taglineKey ? el("p.kmg-tagline", { text: t(taglineKey) }) : null;
  const intro = introKey ? raw("div.kmg-intro", tMd(introKey)) : null;
  const picker = levelPicker(gameKey, onLevelChange);

  const extraTop = el("div.kmg-extra-top");
  const questionSlot = el("div.kmg-question-slot");
  const visualSlot = el("div.kmg-visuals");
  const answerSlot = el("div.kmg-answer-slot");
  const actionSlot = el("div.kmg-action-slot");
  const feedbackSlot = el("div.kmg-feedback-slot");
  const extraSlot = el("div.kmg-extra");

  root.append(
    head,
    ...[tagline, intro].filter(Boolean),
    picker,
    extraTop,
    questionSlot,
    visualSlot,
    answerSlot,
    actionSlot,
    feedbackSlot,
    extraSlot,
  );

  let advanceTimer = null;

  const shell = {
    root,
    picker,
    slots: { extraTop, questionSlot, visualSlot, answerSlot, actionSlot, feedbackSlot, extraSlot },

    setQuestion(text, questionEmoji = emoji) {
      clear(questionSlot);
      const card = questionCard(text, questionEmoji);
      questionSlot.append(card);
      nextFrame(() => card.classList.add("is-in"));
      return card;
    },

    setVisuals(htmlStrings) {
      clear(visualSlot);
      const items = [].concat(htmlStrings).filter(Boolean);
      visualSlot.classList.toggle("is-empty", items.length === 0);
      items.forEach((html) => visualSlot.append(raw("div.kmg-visual", html)));
    },

    setFeedback(kind, message, options) {
      clear(feedbackSlot);
      if (!kind) return;
      feedbackSlot.append(feedbackBanner(kind, message, options));
    },

    clearFeedback() {
      clear(feedbackSlot);
    },

    /** Schedule the next question after a correct answer. */
    scheduleAdvance(fn) {
      if (!autoAdvance) return;
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(fn, AUTO_ADVANCE_MS);
    },

    cancelAdvance() {
      clearTimeout(advanceTimer);
    },

    /** Called by the router when the page is left, so timers do not leak. */
    destroy() {
      clearTimeout(advanceTimer);
    },
  };

  return shell;
}

/** The "🔥 3 in a row!" note under a game. */
export function streakNote() {
  const node = el("div.kmg-streaknote");
  const refresh = () => {
    if (state.streaks >= 3) {
      node.hidden = false;
      node.textContent = t("common.streak_fire", { streak: state.streaks });
      node.classList.remove("is-pop");
      void node.offsetWidth;
      node.classList.add("is-pop");
    } else {
      node.hidden = true;
    }
  };
  refresh();
  node.refresh = refresh;
  return node;
}

/** The small "this session is being recorded" caption every game ends with. */
export function recordedCaption() {
  return el("p.kmg-caption", { text: t("common.session_recorded") });
}

/** A row of stat tiles (used by the timed games and the dashboard). */
export function statRow(stats) {
  return el(
    "div.kmg-stats",
    {},
    stats.map(({ label, value, hint }) =>
      el("div.kmg-stat", {}, [
        el("div.kmg-stat-label", { text: label }),
        el("div.kmg-stat-value", { text: String(value) }),
        hint ? el("div.kmg-stat-hint", { text: hint }) : null,
      ]),
    ),
  );
}
