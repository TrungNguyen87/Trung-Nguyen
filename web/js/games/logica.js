/**
 * Logica Lab - reasoning rather than calculating.
 * Ported from pages/12_Logica_Lab.py.
 *
 * Everything else in the app asks "can you work this out?". This one asks
 * "can you work out *what the rule is*?" - number and shape sequences,
 * odd-one-out, if/then statements, a small who-has-what deduction grid, magic
 * squares and balance puzzles where symbols stand in for values.
 *
 * The arithmetic stays deliberately easy (groep 6/7 can all do it); the
 * difficulty is entirely in spotting the pattern, which is the point.
 */
import { t } from "../i18n.js";
import { choice, randInt, sample, shuffle, unique } from "../rng.js";
import { numberLineSvg, ratioBarSvg } from "../visuals.js";
import { el, raw } from "../dom.js";
import { markdown } from "../markdown.js";
import { getLevel } from "../state.js";
import { settleAnswer } from "../gameflow.js";
import {
  actionBar,
  gameShell,
  numberField,
  recordedCaption,
  streakNote,
} from "../ui.js";

const GAME_KEY = "logica";

const SHAPES = ["🔺", "🟦", "🟢", "⭐", "🟣", "🟠"];
const NAME_KEYS = ["logica.name_a", "logica.name_b", "logica.name_c", "logica.name_d"];
const THING_KEYS = ["logica.thing_a", "logica.thing_b", "logica.thing_c", "logica.thing_d"];

/**
 * A number sequence with a hidden rule; the child gives the next term.
 * `kinds` limits which rules can appear, which is how the levels differ.
 */
function sequenceProblem(kinds) {
  const kind = choice(kinds);
  let seq;
  let rule;

  if (kind === "add") {
    const start = randInt(1, 12);
    const step = randInt(2, 9);
    seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
    rule = t("logica.rule_add", { step });
  } else if (kind === "sub") {
    const step = randInt(2, 9);
    const start = step * randInt(6, 12);
    seq = [0, 1, 2, 3, 4].map((i) => start - i * step);
    rule = t("logica.rule_sub", { step });
  } else if (kind === "mul") {
    const start = randInt(1, 4);
    const factor = choice([2, 3]);
    seq = [0, 1, 2, 3, 4].map((i) => start * factor ** i);
    rule = t("logica.rule_mul", { factor });
  } else if (kind === "alternate") {
    // Two interleaved rules: +a on the odd positions, +b on the even ones.
    // The classic "why doesn't one difference work?" sequence.
    const a = randInt(2, 7);
    let b = randInt(2, 7);
    while (a === b) b = randInt(2, 7);
    seq = [randInt(1, 9)];
    for (let i = 0; i < 4; i++) seq.push(seq[seq.length - 1] + (i % 2 === 0 ? a : b));
    rule = t("logica.rule_alternate", { a, b });
  } else if (kind === "square") {
    const start = randInt(1, 5);
    seq = [0, 1, 2, 3, 4].map((i) => (start + i) ** 2);
    rule = t("logica.rule_square");
  } else {
    const x = randInt(1, 5);
    const y = randInt(2, 7);
    seq = [x, y];
    for (let i = 0; i < 3; i++) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
    rule = t("logica.rule_fib");
  }

  const shown = seq.slice(0, 4);
  return {
    kind: "number",
    text: t("logica.q_sequence", { seq: shown.join(", ") }),
    answer: seq[4],
    explain: rule,
    visual: { kind: "numberline", seq: shown },
  };
}

/** Four items, three share a property. Pick the one that does not. */
function oddOneOutProblem(hard) {
  const evens = [];
  for (let n = 2; n < 40; n += 2) evens.push(n);
  const odds = [];
  for (let n = 1; n < 40; n += 2) odds.push(n);

  let group;
  let odd;
  let why;

  if (!hard) {
    const family = choice(["even", "odd", "table"]);
    if (family === "even") {
      group = sample(evens, 3);
      odd = choice(odds);
      why = t("logica.why_even");
    } else if (family === "odd") {
      group = sample(odds, 3);
      odd = choice(evens);
      why = t("logica.why_odd");
    } else {
      const table = choice([3, 4, 5]);
      const multiples = [];
      for (let k = 2; k <= 12; k++) multiples.push(table * k);
      group = sample(multiples, 3);
      const nonMultiples = [];
      for (let n = 5; n < 60; n++) if (n % table !== 0) nonMultiples.push(n);
      odd = choice(nonMultiples);
      why = t("logica.why_table", { table });
    }
  } else {
    const family = choice(["square", "prime", "tenfold"]);
    if (family === "square") {
      const squares = [];
      for (let n = 2; n <= 10; n++) squares.push(n * n);
      group = sample(squares, 3);
      const allSquares = new Set();
      for (let n = 1; n <= 11; n++) allSquares.add(n * n);
      const nonSquares = [];
      for (let n = 4; n < 100; n++) if (!allSquares.has(n)) nonSquares.push(n);
      odd = choice(nonSquares);
      why = t("logica.why_square");
    } else if (family === "prime") {
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
      group = sample(primes, 3);
      const nonPrimes = [];
      for (let n = 4; n < 40; n++) if (!primes.includes(n)) nonPrimes.push(n);
      odd = choice(nonPrimes);
      why = t("logica.why_prime");
    } else {
      const tens = [];
      for (let k = 2; k <= 11; k++) tens.push(10 * k);
      group = sample(tens, 3);
      const nonTens = [];
      for (let n = 11; n < 99; n++) if (n % 10 !== 0) nonTens.push(n);
      odd = choice(nonTens);
      why = t("logica.why_tenfold");
    }
  }

  return {
    kind: "choice",
    text: t("logica.q_odd_one_out"),
    answer: String(odd),
    options: shuffle([...group, odd].map(String)),
    explain: why,
    visual: null,
  };
}

/**
 * A repeating shape pattern - the same "find the rule" skill as the number
 * sequences, but readable before you can read.
 */
function patternProblem() {
  const period = choice([2, 3, 3, 4]);
  const palette = sample(SHAPES, period);
  const seq = Array.from({ length: 7 }, (_, i) => palette[i % period]);
  const shown = seq.slice(0, 6);
  const answer = seq[6];

  const options = unique([...palette, ...sample(SHAPES, 2)]).slice(0, 4);
  if (!options.includes(answer)) options[0] = answer;

  return {
    kind: "choice",
    text: t("logica.q_pattern", { pattern: shown.join(" ") }),
    answer,
    options: shuffle(options),
    explain: t("logica.why_pattern", { period }),
    visual: null,
  };
}

/**
 * If/then reasoning: a rule, a fact, and a conclusion to judge. Half of the
 * generated conclusions are deliberately invalid, so "yes" is not a winning
 * strategy.
 */
function statementProblem() {
  const group = t(choice(["logica.group_a", "logica.group_b", "logica.group_c"]));
  const prop = t(choice(["logica.prop_a", "logica.prop_b", "logica.prop_c"]));
  const name = t(choice(NAME_KEYS));
  const valid = choice([true, false]);

  // Valid:   All A are B; X is an A -> X is a B.
  // Invalid: All A are B; X is a B  -> X is an A. The converse, which does
  //          not follow - the most common reasoning slip at this age.
  return {
    kind: "choice",
    text: valid
      ? t("logica.q_syllogism_valid", { group, prop, name })
      : t("logica.q_syllogism_invalid", { group, prop, name }),
    answer: valid ? t("logica.answer_yes") : t("logica.answer_no"),
    options: [t("logica.answer_yes"), t("logica.answer_no")],
    explain: valid ? t("logica.why_syllogism_valid") : t("logica.why_syllogism_invalid"),
    visual: null,
  };
}

/**
 * A small who-has-what grid. Three children, three objects, two clues that
 * between them pin the assignment down exactly.
 */
function deductionProblem() {
  const names = sample(NAME_KEYS, 3).map((k) => t(k));
  const things = sample(THING_KEYS, 3).map((k) => t(k));
  const assignment = shuffle([...things]);
  const mapping = Object.fromEntries(names.map((n, i) => [n, assignment[i]]));

  const asked = choice(names);
  const others = names.filter((n) => n !== asked);

  // Two clues that between them pin the answer down exactly:
  //   1. the asked child does NOT have `notThing`
  //   2. one of the other two children DOES have their thing
  // notThing is not the asked child's and not the named child's, so it must
  // be the third child's - which leaves the asked child exactly one option.
  // (The mapping is a bijection, so at least one of the two others always
  // differs from notThing and `find` never comes back empty.)
  const notThing = choice(things.filter((th) => th !== mapping[asked]));
  const fixedChild = others.find((n) => mapping[n] !== notThing);

  const clues = shuffle([
    t("logica.clue_not", { name: asked, thing: notThing }),
    t("logica.clue_has", { name: fixedChild, thing: mapping[fixedChild] }),
  ]);

  return {
    kind: "choice",
    text: t("logica.q_deduction", {
      clues: clues.map((c) => `- ${c}`).join("\n"),
      name: asked,
    }),
    answer: mapping[asked],
    options: shuffle(things),
    explain: t("logica.why_deduction"),
    visual: null,
    isMarkdown: true,
  };
}

/**
 * Symbol algebra without the letters: a = 3 b, b = 2 c, so a = ? c. The same
 * substitution reasoning as solving an equation, one step earlier.
 */
function balanceProblem() {
  const [symA, symB, symC] = sample(["🔺", "🟦", "🟢", "⭐", "🟣"], 3);
  const k1 = randInt(2, 4);
  const k2 = randInt(2, 4);
  return {
    kind: "number",
    text: t("logica.q_balance", { a: symA, k1, b: symB, k2, c: symC }),
    answer: k1 * k2,
    explain: t("logica.why_balance", { k1, k2, total: k1 * k2 }),
    visual: { kind: "ratio", parts: Array(k1).fill(1), labels: Array(k1).fill(symB) },
  };
}

/**
 * A 3x3 magic square with one cell blanked out. Every row, column and diagonal
 * has the same total, so the missing cell is fully determined.
 */
function magicSquareProblem() {
  const base = [
    [8, 1, 6],
    [3, 5, 7],
    [4, 9, 2],
  ]; // the classic 3x3, total 15
  const mult = choice([1, 2, 3]);
  const add = choice([0, 1, 2, 5, 10]);
  const grid = base.map((row) => row.map((v) => v * mult + add));
  const total = grid[0].reduce((s, v) => s + v, 0);
  const ri = randInt(0, 2);
  const ci = randInt(0, 2);

  return {
    kind: "number",
    text: t("logica.q_magic", { total }),
    answer: grid[ri][ci],
    explain: t("logica.why_magic", { total }),
    visual: null,
    grid: { values: grid, blankRow: ri, blankCol: ci },
  };
}

export function generate(level) {
  const pools = [
    [() => sequenceProblem(["add"]), patternProblem],
    [() => sequenceProblem(["add", "sub"]), patternProblem, () => oddOneOutProblem(false)],
    [() => sequenceProblem(["add", "sub", "mul"]), () => oddOneOutProblem(false), statementProblem],
    [
      () => sequenceProblem(["mul", "alternate"]),
      () => oddOneOutProblem(true),
      statementProblem,
      balanceProblem,
    ],
    [
      () => sequenceProblem(["alternate", "square"]),
      () => oddOneOutProblem(true),
      deductionProblem,
      balanceProblem,
    ],
    [
      () => sequenceProblem(["square", "fib", "alternate"]),
      deductionProblem,
      magicSquareProblem,
      balanceProblem,
    ],
  ];
  return choice(pools[level])();
}

/** The magic square, drawn as a real grid with the blank cell highlighted. */
function magicGrid(spec) {
  const table = el("table.kmg-magic");
  spec.values.forEach((row, r) => {
    const tr = el("tr");
    row.forEach((value, c) => {
      const isBlank = r === spec.blankRow && c === spec.blankCol;
      tr.append(el(`td${isBlank ? ".is-blank" : ""}`, { text: isBlank ? "?" : String(value) }));
    });
    table.append(tr);
  });
  return table;
}

function visualsFor(problem) {
  const v = problem.visual;
  if (!v) return [];
  if (v.kind === "numberline") {
    const seq = v.seq;
    const lo = Math.min(...seq) - Math.max(1, Math.floor((Math.max(...seq) - Math.min(...seq)) / 4));
    const hi = Math.max(...seq) + Math.max(1, Math.floor((Math.max(...seq) - Math.min(...seq)) / 2));
    return [numberLineSvg(lo, hi, seq.map((value) => [value, String(value)]))];
  }
  return [ratioBarSvg(v.parts, { labels: v.labels })];
}

export function render(container) {
  let problem = null;
  let widget = null;
  let answered = false;

  const shell = gameShell({
    gameKey: GAME_KEY,
    emoji: "🧠",
    titleKey: "logica.title",
    taglineKey: "logica.tagline",
    introKey: "logica.intro",
    onLevelChange: () => newQuestion(),
  });

  const bar = actionBar({
    checkLabel: t("logica.check_button"),
    nextLabel: t("logica.next_button"),
    onCheck: () => check(),
    onNext: () => newQuestion(),
  });
  const streak = streakNote();
  shell.slots.actionSlot.append(bar.node);
  shell.slots.extraSlot.append(streak, recordedCaption());

  function buildAnswer() {
    if (problem.kind === "number") {
      const field = numberField({ label: t("common.your_answer"), onSubmit: () => check() });
      return {
        node: field.node,
        focus: field.focus,
        read: () => field.value(),
        reveal: (ok) => field.markResult(ok),
      };
    }

    const grid = el("div.kmg-choices", {
      style: { "--kmg-cols": String(problem.options.length <= 4 ? 2 : 3) },
    });
    let picked = null;
    problem.options.forEach((option) => {
      const button = el("button.kmg-choice", {
        type: "button",
        text: String(option),
        onClick: () => {
          if (picked !== null) return;
          picked = option;
          check();
        },
      });
      grid.append(button);
    });
    return {
      node: el("div", {}, [el("p.kmg-answer-label", { text: t("common.choose_answer") }), grid]),
      read: () => picked,
      reveal: () => {
        [...grid.children].forEach((button) => {
          button.disabled = true;
          if (button.textContent === String(problem.answer)) button.classList.add("is-right");
          else if (button.textContent === String(picked)) button.classList.add("is-wrong");
        });
      },
    };
  }

  function newQuestion() {
    shell.cancelAdvance();
    answered = false;
    problem = generate(getLevel(GAME_KEY));

    // The deduction question's clue list is markdown; everything else is
    // plain text and must not be re-interpreted as markup.
    shell.setQuestion(problem.isMarkdown ? markdown(problem.text) : escapeText(problem.text), "🧠");
    shell.setVisuals(visualsFor(problem));
    shell.clearFeedback();

    widget = buildAnswer();
    const answerNodes = problem.grid ? [magicGrid(problem.grid), widget.node] : [widget.node];
    shell.slots.answerSlot.replaceChildren(...answerNodes);
    bar.setAnswered(false);
    widget.focus?.();
  }

  function check() {
    if (answered) return;
    const value = widget.read();
    if (value == null) return;

    const isCorrect = value === problem.answer;
    answered = true;
    bar.setAnswered(true);
    widget.reveal(isCorrect);

    const level = getLevel(GAME_KEY);
    const points = 5 * (level + 1);
    settleAnswer({
      gameKey: GAME_KEY,
      level,
      questionText: problem.text,
      studentAnswer: value,
      correctAnswer: problem.answer,
      isCorrect,
      points,
      burstFrom: isCorrect ? bar.check : null,
    });

    if (isCorrect) {
      shell.setFeedback("success", t("logica.correct", { points, explain: problem.explain }), {
        icon: "🧠",
      });
      shell.scheduleAdvance(() => newQuestion());
    } else {
      shell.setFeedback(
        "error",
        `${t("logica.incorrect")} ${t("common.correct_answer_was", { answer: problem.answer })} ${problem.explain}`,
        { icon: "🔍", tip: t("logica.why_tip") },
      );
    }
    streak.refresh();
    shell.picker.refresh();
  }

  container.append(shell.root);
  newQuestion();
  return () => shell.destroy();
}

function escapeText(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
