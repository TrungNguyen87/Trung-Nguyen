/**
 * Code Kraker / Code Breaker - Mastermind with digits.
 * Ported from pages/13_Code_Kraker.py.
 *
 * A secret code is generated; after each guess the child is told how many
 * digits are *exactly right* (right digit, right place) and how many are the
 * *right digit in the wrong place*. Nothing else. Cracking it needs pure
 * elimination reasoning - no arithmetic at all - which makes it the game in
 * this app that most directly trains "what must be true given what I know".
 *
 * The one interaction change: the guess is entered by tapping digits into
 * slots rather than working through a column of dropdowns. On a tablet that
 * turns a four-digit guess from four separate select-and-scroll gestures into
 * four taps, which matters when a child gets nine guesses.
 */
import { t } from "../i18n.js";
import { choice, randInt, sample } from "../rng.js";
import { el, clear, raw } from "../dom.js";
import { markdown } from "../markdown.js";
import { addScore, getLevel } from "../state.js";
import { settleAnswer } from "../gameflow.js";
import { expander, gameShell, recordedCaption } from "../ui.js";
import { bigCelebration } from "../fx.js";
import * as sound from "../sound.js";

const GAME_KEY = "code";

// level: [code length, digits allowed 1..N, guesses allowed, repeats permitted]
export const LEVEL_RULES = {
  0: [2, 4, 8, false],
  1: [3, 4, 8, false],
  2: [3, 6, 8, false],
  3: [3, 6, 8, true],
  4: [4, 6, 9, true],
  5: [4, 8, 9, true],
};

/**
 * Mastermind scoring. `exact` = right digit in the right place; `misplaced` =
 * right digit somewhere else. Digits already counted as exact are removed
 * first, so a repeated digit is never counted twice - the classic bug in a
 * naive implementation, and one a child *will* catch because it makes the
 * clues contradict each other.
 */
export function scoreGuess(secret, guess) {
  let exact = 0;
  const leftSecret = [];
  const leftGuess = [];
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) exact += 1;
    else {
      leftSecret.push(secret[i]);
      leftGuess.push(guess[i]);
    }
  }
  let misplaced = 0;
  for (const g of leftGuess) {
    const index = leftSecret.indexOf(g);
    if (index !== -1) {
      leftSecret.splice(index, 1);
      misplaced += 1;
    }
  }
  return { exact, misplaced };
}

export function newSecret(length, maxDigit, allowRepeats) {
  const digits = Array.from({ length: maxDigit }, (_, i) => i + 1);
  if (allowRepeats) return Array.from({ length }, () => choice(digits));
  return sample(digits, length);
}

export function render(container) {
  let length;
  let maxDigit;
  let maxGuesses;
  let allowRepeats;
  let basePoints;

  let secret = [];
  let guesses = []; // [{ guess, exact, misplaced }]
  let draft = [];
  let solved = false;
  let gaveUp = false;
  let warning = null;

  const shell = gameShell({
    gameKey: GAME_KEY,
    emoji: "🔐",
    titleKey: "code.title",
    taglineKey: "code.tagline",
    introKey: "code.intro",
    autoAdvance: false,
    // A change of level changes the code's shape, so start a fresh code.
    onLevelChange: () => startCode(),
  });

  const stage = el("div.kmg-stage");
  shell.slots.extraSlot.append(
    stage,
    expander(t("code.how_to_heading"), raw("div", markdown(t("code.how_to_body")))),
    recordedCaption(),
  );

  function readRules() {
    const level = getLevel(GAME_KEY);
    [length, maxDigit, maxGuesses, allowRepeats] = LEVEL_RULES[level];
    basePoints = 5 * (level + 1);
  }

  function startCode() {
    readRules();
    secret = newSecret(length, maxDigit, allowRepeats);
    guesses = [];
    draft = Array(length).fill(null);
    solved = false;
    gaveUp = false;
    warning = null;
    paint();
  }

  function submitGuess() {
    if (draft.some((d) => d == null)) return;
    const guess = [...draft];

    if (!allowRepeats && new Set(guess).size !== guess.length) {
      // Not a wrong answer, just an impossible one under this level's rules -
      // so it is neither logged nor counted against the guess budget.
      warning = t("code.no_repeats_warning");
      sound.playIncorrect();
      paint();
      return;
    }

    warning = null;
    const { exact, misplaced } = scoreGuess(secret, guess);
    guesses.push({ guess, exact, misplaced });
    const used = guesses.length;
    const level = getLevel(GAME_KEY);
    const logQuestion = t("code.log_question", { length, max_digit: maxDigit });
    const guessText = guess.join(" ");
    const secretText = secret.join(" ");

    if (exact === length) {
      solved = true;
      // Efficiency bonus: cracking it on guess 1 of 8 pays roughly double what
      // cracking it on the last guess does.
      const bonus = Math.max(0, maxGuesses - used);
      const earned = basePoints * 2 + Math.floor((basePoints * bonus) / 2);
      addScore(earned);
      bigCelebration();
      settleAnswer({
        gameKey: GAME_KEY,
        level,
        questionText: logQuestion,
        studentAnswer: guessText,
        correctAnswer: secretText,
        isCorrect: true,
        points: earned,
        score: false, // already added above, with the efficiency bonus
      });
    } else if (used >= maxGuesses) {
      settleAnswer({
        gameKey: GAME_KEY,
        level,
        questionText: logQuestion,
        studentAnswer: guessText,
        correctAnswer: secretText,
        isCorrect: false,
        points: 0,
      });
    } else {
      // Mid-game feedback only: a guess that neither cracks the code nor uses
      // up the budget is not an answered question, so it stays out of the log.
      sound.playTap();
    }

    draft = Array(length).fill(null);
    paint();
  }

  // --- rendering ----------------------------------------------------------

  function historyTable() {
    const table = el("table.kmg-table.kmg-codehistory");
    table.append(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "#" }),
          el("th", { text: t("code.col_guess") }),
          el("th", { text: `🎯 ${t("code.col_exact")}` }),
          el("th", { text: `🔄 ${t("code.col_misplaced")}` }),
        ]),
      ]),
    );
    const body = el("tbody");
    guesses.forEach((row, index) => {
      body.append(
        el("tr", {}, [
          el("td", { text: String(index + 1) }),
          el(
            "td",
            {},
            row.guess.map((digit) => el("span.kmg-codechip", { text: String(digit) })),
          ),
          el("td.kmg-codescore.is-exact", { text: String(row.exact) }),
          el("td.kmg-codescore", { text: String(row.misplaced) }),
        ]),
      );
    });
    table.append(body);
    return el("div", {}, [el("h3", { text: t("code.history_heading") }), table]);
  }

  function guessEditor() {
    const slots = el("div.kmg-codeslots");
    let activeSlot = draft.findIndex((d) => d == null);
    if (activeSlot === -1) activeSlot = 0;

    draft.forEach((digit, index) => {
      slots.append(
        el(`button.kmg-codeslot${index === activeSlot ? ".is-active" : ""}`, {
          type: "button",
          text: digit == null ? "?" : String(digit),
          "aria-label": `${t("code.position")} ${index + 1}`,
          onClick: () => {
            draft[index] = null;
            sound.playTap();
            paint(index);
          },
        }),
      );
    });

    const pad = el("div.kmg-codepad");
    for (let digit = 1; digit <= maxDigit; digit++) {
      pad.append(
        el("button.kmg-padkey.kmg-codekey", {
          type: "button",
          text: String(digit),
          onClick: () => {
            const slot = draft.findIndex((d) => d == null);
            if (slot === -1) return;
            draft[slot] = digit;
            sound.playTap();
            paint();
          },
        }),
      );
    }

    const ready = draft.every((d) => d != null);
    return el("div", {}, [
      el("p.kmg-answer-label", { text: t("code.your_guess") }),
      slots,
      pad,
      warning
        ? el("div.kmg-banner.kmg-banner-bad", {}, [
            el("span.kmg-banner-icon", { text: "⚠️" }),
            el("span.kmg-banner-body", { text: warning }),
          ])
        : null,
      el("div.kmg-actions", {}, [
        el("button.kmg-btn.kmg-btn-primary", {
          type: "button",
          text: t("code.check_button"),
          disabled: !ready,
          onClick: () => submitGuess(),
        }),
        el("button.kmg-btn.kmg-btn-ghost", {
          type: "button",
          text: t("code.give_up_button"),
          onClick: () => {
            gaveUp = true;
            paint();
          },
        }),
      ]),
    ]);
  }

  function roundOver() {
    const codeText = secret.join(" ");
    let banner;
    if (solved) {
      banner = el("div.kmg-banner.kmg-banner-ok", {}, [
        el("span.kmg-banner-icon", { text: "🔓" }),
        el("span.kmg-banner-body", {
          text: t("code.cracked_banner", { code: codeText, guesses: guesses.length }),
        }),
      ]);
    } else if (gaveUp) {
      banner = el("div.kmg-banner.kmg-banner-info", {}, [
        el("span.kmg-banner-icon", { text: "🙈" }),
        el("span.kmg-banner-body", { text: t("code.revealed", { code: codeText }) }),
      ]);
    } else {
      banner = el("div.kmg-banner.kmg-banner-bad", {}, [
        el("span.kmg-banner-icon", { text: "⏳" }),
        el("span.kmg-banner-body", { text: t("code.out_of_guesses", { code: codeText }) }),
      ]);
    }

    return el("div", {}, [
      banner,
      el("button.kmg-btn.kmg-btn-primary.kmg-btn-big", {
        type: "button",
        text: t("code.new_code_button"),
        onClick: () => startCode(),
      }),
    ]);
  }

  function paint() {
    readRules();
    // A level change while a code is in play leaves a secret of the wrong
    // shape behind; regenerate rather than showing an unplayable board.
    if (secret.length !== length || Math.max(...secret) > maxDigit) {
      startCode();
      return;
    }

    shell.picker.refresh();
    const guessesLeft = maxGuesses - guesses.length;

    shell.setQuestion(
      t("code.prompt", { length, max_digit: maxDigit, guesses: guessesLeft }),
      "🔐",
    );

    clear(stage);
    stage.append(
      el("p.kmg-caption", {
        text: allowRepeats ? t("code.repeats_allowed") : t("code.repeats_not_allowed"),
      }),
    );
    if (guesses.length) stage.append(historyTable());

    const playing = !solved && !gaveUp && guessesLeft > 0;
    stage.append(playing ? guessEditor() : roundOver());
  }

  container.append(shell.root);
  startCode();
  return () => shell.destroy();
}
