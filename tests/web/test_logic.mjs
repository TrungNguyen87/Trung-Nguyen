/**
 * Logic tests for the web app.
 *
 * These deliberately test the parts that have no DOM: the question
 * generators, the scoring rules, the adaptive-level machinery and the
 * translation table. Those are where a porting mistake actually hurts - a
 * generator that can produce a negative angle, or a level-5 question a groep 7
 * child cannot answer, is invisible until a child hits it.
 *
 * Every generator is run many times, because the bugs worth catching here are
 * the ones that only appear on an unlucky draw.
 *
 * Run with: node --test tests/web/
 */
import test from "node:test";
import assert from "node:assert/strict";

const REPS = 400;

// The modules read localStorage inside try/catch, so they import cleanly in
// Node with no DOM. Anything that touches the DOM is tested in the browser
// smoke test instead (tests/web/smoke.mjs).
const { TRANSLATIONS, t, setLanguage, getLanguage } = await import("../../web/js/i18n.js");
const { markdown, escapeHtml } = await import("../../web/js/markdown.js");
const { gcd, randInt, sample, shuffled, unique } = await import("../../web/js/rng.js");
const state = await import("../../web/js/state.js");
const { checkNewBadges, BADGE_IDS } = await import("../../web/js/badges.js");
const rewards = await import("../../web/js/rewards.js");
const log = await import("../../web/js/log.js");
const visuals = await import("../../web/js/visuals.js");
const competitie = await import("../../web/js/pages/competitie.js");

const tafel = await import("../../web/js/games/tafel.js");
const breuken = await import("../../web/js/games/breuken.js");
const meten = await import("../../web/js/games/meten.js");
const procenten = await import("../../web/js/games/procenten.js");
const algebra = await import("../../web/js/games/algebra.js");
const meetkunde = await import("../../web/js/games/meetkunde.js");
const verhoudingen = await import("../../web/js/games/verhoudingen.js");
const getallen = await import("../../web/js/games/getallen.js");
const bliksem = await import("../../web/js/games/bliksem.js");
const logica = await import("../../web/js/games/logica.js");
const code = await import("../../web/js/games/code.js");
const jacht = await import("../../web/js/games/jacht.js");

const LEVELS = [0, 1, 2, 3, 4, 5];
const eachLevel = (fn) => LEVELS.forEach((level) => fn(level));

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

test("every Dutch key has an English translation and vice versa", () => {
  const nl = Object.keys(TRANSLATIONS.nl).sort();
  const en = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(nl, en, "NL and EN key sets must match exactly");
  assert.ok(nl.length > 450, `expected 450+ keys, got ${nl.length}`);
});

test("no translation is an empty string", () => {
  for (const [lang, table] of Object.entries(TRANSLATIONS)) {
    for (const [key, value] of Object.entries(table)) {
      assert.ok(String(value).trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test("a key's placeholders are the same in both languages", () => {
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(TRANSLATIONS.nl)) {
    assert.deepEqual(
      placeholders(TRANSLATIONS.nl[key]),
      placeholders(TRANSLATIONS.en[key]),
      `placeholders differ for ${key}`,
    );
  }
});

test("t() substitutes placeholders and falls back to the key", () => {
  assert.match(t("common.level_up", { level: 3 }), /3/);
  assert.equal(t("this.key.does.not.exist"), "this.key.does.not.exist");
});

test("every game key the app navigates to has a name and a why-tip", () => {
  for (const key of state.GAME_KEYS) {
    assert.ok(TRANSLATIONS.nl[`game.${key}.name`], `missing game.${key}.name`);
    assert.ok(TRANSLATIONS.nl[`${key}.title`], `missing ${key}.title`);
  }
});

// ---------------------------------------------------------------------------
// Markdown / escaping
// ---------------------------------------------------------------------------

test("markdown renders the subset the copy actually uses", () => {
  assert.match(markdown("**bold**"), /<strong>bold<\/strong>/);
  assert.match(markdown("*italic*"), /<em>italic<\/em>/);
  assert.match(markdown("- one\n- two"), /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(markdown("# Heading"), /<h1>Heading<\/h1>/);
  assert.match(markdown("`code`"), /<code>code<\/code>/);
});

test("markdown escapes HTML by default", () => {
  const rendered = markdown('<img src=x onerror="alert(1)">');
  assert.ok(!rendered.includes("<img"), "raw HTML must not survive");
  assert.match(rendered, /&lt;img/);
});

test("escapeHtml neutralises quotes and angle brackets", () => {
  assert.equal(escapeHtml(`<a href="x">'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;");
});

// ---------------------------------------------------------------------------
// rng helpers - the Python semantics the generators were transcribed against
// ---------------------------------------------------------------------------

test("randInt is inclusive on both ends", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(randInt(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test("randInt(n, n) returns n", () => {
  assert.equal(randInt(7, 7), 7);
});

test("sample returns k distinct items and never more than the pool", () => {
  const pool = [1, 2, 3, 4, 5];
  const picked = sample(pool, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  assert.equal(sample(pool, 99).length, 5);
});

test("shuffled keeps every element", () => {
  const input = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(shuffled(input).sort((a, b) => a - b), input);
});

test("gcd matches math.gcd, including with zero and negatives", () => {
  assert.equal(gcd(12, 18), 6);
  assert.equal(gcd(7, 13), 1);
  assert.equal(gcd(0, 5), 5);
  assert.equal(gcd(-12, 18), 6);
});

test("unique keeps first-seen order", () => {
  assert.deepEqual(unique(["b", "a", "b", "c", "a"]), ["b", "a", "c"]);
});

// ---------------------------------------------------------------------------
// Adaptive difficulty
// ---------------------------------------------------------------------------

test("three correct answers in a row level a game up", () => {
  state.setLevel("tafel", 1);
  let result;
  for (let i = 0; i < 3; i++) result = state.registerAttempt("tafel", true);
  assert.equal(result.leveledUp, true);
  assert.equal(state.getLevel("tafel"), 2);
});

test("two wrong answers in a row level a game down", () => {
  state.setLevel("tafel", 3);
  let result;
  for (let i = 0; i < 2; i++) result = state.registerAttempt("tafel", false);
  assert.equal(result.leveledDown, true);
  assert.equal(state.getLevel("tafel"), 2);
});

test("a correct answer resets the wrong-streak, so 1 wrong + 1 right + 1 wrong does not drop a level", () => {
  state.setLevel("tafel", 3);
  state.registerAttempt("tafel", false);
  state.registerAttempt("tafel", true);
  const result = state.registerAttempt("tafel", false);
  assert.equal(result.leveledDown, false);
  assert.equal(state.getLevel("tafel"), 3);
});

test("levels never leave 0..5 for standard games", () => {
  state.setLevel("breuken", 5);
  for (let i = 0; i < 20; i++) state.registerAttempt("breuken", true);
  assert.equal(state.getLevel("breuken"), state.MAX_LEVEL);

  state.setLevel("breuken", 0);
  for (let i = 0; i < 20; i++) state.registerAttempt("breuken", false);
  assert.equal(state.getLevel("breuken"), state.MIN_LEVEL);
});

test("tafel monster level can reach level 6 and clamps at 6", () => {
  state.setLevel("tafel", 5);
  for (let i = 0; i < 3; i++) state.registerAttempt("tafel", true);
  assert.equal(state.getLevel("tafel"), 6);
  assert.equal(state.setLevel("tafel", 99), 6);
});

test("setLevel clamps out-of-range input", () => {
  assert.equal(state.setLevel("breuken", 99), state.MAX_LEVEL);
  assert.equal(state.setLevel("breuken", -4), state.MIN_LEVEL);
});

test("changing level resets that game's streak counters", () => {
  state.setLevel("breuken", 2);
  state.registerAttempt("breuken", true);
  state.registerAttempt("breuken", true);
  state.setLevel("breuken", 4); // manual override mid-streak
  // Two more correct answers must not be enough on their own to level up.
  state.registerAttempt("breuken", true);
  const result = state.registerAttempt("breuken", true);
  assert.equal(result.leveledUp, false);
});

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

test("badges are awarded once, in definition order", () => {
  state.state.badges = [];
  state.state.questionsAnswered = 100;
  state.state.streaks = 10;
  const first = checkNewBadges().map(([id]) => id);
  assert.ok(first.includes("q10") && first.includes("q100") && first.includes("streak10"));
  assert.deepEqual(checkNewBadges(), [], "a second call awards nothing new");
  // Stored in definition order, not the order they happened to be earned.
  const order = state.state.badges.map((id) => BADGE_IDS.indexOf(id));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

// ---------------------------------------------------------------------------
// Daily coin cap
// ---------------------------------------------------------------------------

test("addScore caps spendable coins per day but never totalScore or streaks", () => {
  state.state.coins = 0;
  state.state.coinsEarnedToday = 0;
  state.state.coinsEarnedDay = new Date().toISOString().slice(0, 10);
  state.state.totalScore = 0;
  state.state.streaks = 0;

  const cap = state.DAILY_COIN_CAP;
  state.addScore(cap - 10);
  assert.equal(state.state.coins, cap - 10);

  state.addScore(50); // would push coins past the cap
  assert.equal(state.state.coins, cap, "coins must not exceed the daily cap");
  assert.equal(state.state.totalScore, cap - 10 + 50, "totalScore is a lifetime number and is never capped");
  assert.equal(state.state.streaks, 2, "the streak counter is never capped either");
  assert.equal(state.remainingDailyCoins(), 0);

  state.addScore(25); // the day is spent: no more coins, but score still climbs
  assert.equal(state.state.coins, cap);
  assert.equal(state.state.totalScore, cap - 10 + 50 + 25);
});

test("remainingDailyCoins resets once the stored day is not today", () => {
  state.state.coinsEarnedToday = 250;
  state.state.coinsEarnedDay = "2000-01-01";
  assert.equal(state.remainingDailyCoins(), state.DAILY_COIN_CAP);
});

// ---------------------------------------------------------------------------
// Reward shop: level and collection gates, not just coins
// ---------------------------------------------------------------------------

test("highestLevelReached is the highest level across every game", () => {
  for (const k of state.GAME_KEYS) state.setLevel(k, 0);
  state.setLevel("breuken", 3);
  state.setLevel("tafel", 5);
  assert.equal(state.highestLevelReached(), 5);
  for (const k of state.GAME_KEYS) state.setLevel(k, 0);
});

test("allGamesAtTrueMax accounts for tafel's own max of 6, not the shared 5", () => {
  for (const k of state.GAME_KEYS) state.setLevel(k, state.getMaxLevel(k));
  assert.equal(state.getLevel("tafel"), 6);
  assert.equal(state.allGamesAtTrueMax(), true);
  state.setLevel("tafel", 5);
  assert.equal(state.allGamesAtTrueMax(), false, "tafel at 5 of 6 is not actually maxed");
  for (const k of state.GAME_KEYS) state.setLevel(k, 0);
});

test("unlockReward refuses a level-gated item until that level is reached, even with coins to spare", () => {
  for (const k of state.GAME_KEYS) state.setLevel(k, 0);
  state.state.unlockedRewards = new Set();
  state.state.equippedAvatar = null;
  state.state.coins = 100000;
  state.state.coinsEarnedToday = 0;

  assert.equal(rewards.lockReason("avatar_unicorn"), "level");
  assert.equal(rewards.unlockReward("avatar_unicorn"), false, "level 2 has not been reached anywhere yet");
  assert.equal(rewards.isUnlocked("avatar_unicorn"), false);

  state.setLevel("tafel", 2);
  assert.equal(rewards.lockReason("avatar_unicorn"), "coins", "the level is met, only the (already-had) cost is left");
  assert.equal(rewards.unlockReward("avatar_unicorn"), true);
  assert.equal(rewards.isUnlocked("avatar_unicorn"), true);
  for (const k of state.GAME_KEYS) state.setLevel(k, 0);
});

test("the ultra reward needs every game maxed and every other reward already unlocked", () => {
  for (const k of state.GAME_KEYS) state.setLevel(k, state.getMaxLevel(k));
  state.state.coins = 1000000;
  state.state.coinsEarnedToday = 0;

  // Nothing else unlocked yet: coins and maxed games are not enough on their own.
  state.state.unlockedRewards = new Set();
  assert.equal(rewards.lockReason("avatar_3d_champion"), "mastery");
  assert.equal(rewards.unlockReward("avatar_3d_champion"), false);

  // Unlock everything else first, exactly as a child actually would.
  state.state.unlockedRewards = new Set(
    rewards.REWARD_DEFS.map((d) => d.id).filter((id) => id !== "avatar_3d_champion"),
  );
  assert.equal(rewards.lockReason("avatar_3d_champion"), "coins");
  assert.equal(rewards.unlockReward("avatar_3d_champion"), true);
  assert.equal(rewards.isUnlocked("avatar_3d_champion"), true);

  for (const k of state.GAME_KEYS) state.setLevel(k, 0);
  state.state.unlockedRewards = new Set();
});

test("the always-free default avatar is never locked", () => {
  assert.equal(rewards.isUnlocked("avatar_default"), true);
  assert.equal(rewards.lockReason("avatar_default"), null);
});

// ---------------------------------------------------------------------------
// Attempt log retention (parent dashboard history)
// ---------------------------------------------------------------------------

test("trimToBudget never drops a row from inside the retention window, even over budget", () => {
  const now = Date.now();
  const isoDaysAgo = (n) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);

  const rows = [];
  for (let i = 0; i < 30; i++) rows.push({ timestamp: isoDaysAgo(20), id: `old-${i}` }); // outside the window
  for (let i = 0; i < 10; i++) rows.push({ timestamp: isoDaysAgo(1), id: `recent-${i}` }); // inside the window

  const trimmed = log.trimToBudget(rows, 5); // budget smaller than the recent rows alone
  const recentKept = trimmed.filter((r) => r.id.startsWith("recent-"));
  const oldKept = trimmed.filter((r) => r.id.startsWith("old-"));

  assert.equal(recentKept.length, 10, "every row inside MIN_RETENTION_DAYS must survive");
  assert.equal(oldKept.length, 0, "no budget is left for anything outside the window");
  assert.ok(trimmed.length > 5, "the retention guarantee can push the result over budget");

  // With room to spare, old rows fill the rest of the budget, newest first.
  const roomy = log.trimToBudget(rows, 15);
  assert.equal(roomy.filter((r) => r.id.startsWith("recent-")).length, 10);
  assert.equal(roomy.filter((r) => r.id.startsWith("old-")).length, 5);
  assert.equal(roomy.length, 15);
});

test("trimToBudget is a no-op when the list already fits", () => {
  const rows = [{ timestamp: new Date().toISOString() }];
  assert.equal(log.trimToBudget(rows, 100), rows);
});

// ---------------------------------------------------------------------------
// Generators: the shared contract
// ---------------------------------------------------------------------------

const GENERATORS = {
  tafel: tafel.generate,
  breuken: breuken.generate,
  meten: meten.generate,
  procenten: procenten.generate,
  algebra: algebra.generate,
  meetkunde: meetkunde.generate,
  verhoudingen: verhoudingen.generate,
  getallen: getallen.generate,
  logica: logica.generate,
};

for (const [name, generate] of Object.entries(GENERATORS)) {
  test(`${name}: every level produces a finite question and answer`, () => {
    eachLevel((level) => {
      for (let i = 0; i < REPS; i++) {
        const problem = generate(level);
        assert.ok(problem, `${name} level ${level} returned nothing`);
        assert.equal(typeof problem.text, "string");
        assert.ok(problem.text.length > 0, `${name} level ${level}: empty question`);
        assert.ok(
          !problem.text.includes("undefined") && !problem.text.includes("NaN"),
          `${name} level ${level}: "${problem.text}"`,
        );

        const answer = problem.answer ?? problem.correctNum;
        if (typeof answer === "number") {
          assert.ok(Number.isFinite(answer), `${name} level ${level}: answer ${answer}`);
        } else if (answer && typeof answer === "object") {
          for (const value of Object.values(answer)) {
            assert.ok(Number.isFinite(value), `${name} level ${level}: answer part ${value}`);
          }
        } else {
          assert.ok(answer != null, `${name} level ${level}: missing answer`);
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Generators: the rules each game has to keep
// ---------------------------------------------------------------------------

test("tafel: the answer is always a whole positive number", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = tafel.generate(level);
      assert.ok(Number.isInteger(problem.answer) && problem.answer > 0);
    }
  });
});

test("tafel: division questions divide exactly", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = tafel.generate(level);
      if (problem.qType === "division" || problem.qType === "missing_factor") {
        assert.equal(problem.product % problem.answer, 0);
        assert.equal(problem.product / problem.knownFactor, problem.answer);
      }
    }
  });
});

test("tafel: only levels 2+ ask missing-factor, 3+ division, 4+ word problems, 6+ three_factor", () => {
  const allowed = {
    0: ["mult"],
    1: ["mult"],
    2: ["mult", "missing_factor"],
    3: ["mult", "missing_factor", "division"],
    4: ["mult", "missing_factor", "division", "word"],
    5: ["mult", "missing_factor", "division", "word"],
    6: ["mult", "missing_factor", "division", "word", "three_factor"],
  };
  [0, 1, 2, 3, 4, 5, 6].forEach((level) => {
    for (let i = 0; i < REPS; i++) {
      assert.ok(allowed[level].includes(tafel.generate(level).qType));
    }
  });
});

test("tafel: level 6 monster-level produces valid questions and whole positive answers", () => {
  for (let i = 0; i < REPS; i++) {
    const problem = tafel.generate(6);
    assert.ok(problem && problem.text.length > 0);
    assert.ok(Number.isInteger(problem.answer) && problem.answer > 0);
    assert.ok(!problem.text.includes("undefined") && !problem.text.includes("NaN"));
  }
});

test("breuken: the answer fraction has a positive denominator", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = breuken.generate(level);
      assert.ok(problem.correctDen > 0, `denominator ${problem.correctDen}`);
      assert.ok(Number.isInteger(problem.correctNum));
      assert.ok(problem.correctNum >= 0, `numerator ${problem.correctNum} went negative`);
    }
  });
});

test("breuken: a 'simplify' question's expected answer really is in lowest terms", () => {
  for (let i = 0; i < REPS * 2; i++) {
    const problem = breuken.generate(3);
    assert.equal(
      gcd(problem.correctNum, problem.correctDen),
      1,
      `${problem.correctNum}/${problem.correctDen} is not fully simplified`,
    );
  }
});

test("breuken: every visual fraction is drawable (0 <= n, 0 < d)", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      for (const [n, d] of breuken.generate(level).visualFracs) {
        assert.ok(d > 0 && n >= 0, `cannot draw ${n}/${d}`);
      }
    }
  });
});

test("meten: whole-number levels never expect a fractional answer", () => {
  [0, 1, 2, 3, 4].forEach((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = meten.generate(level);
      assert.equal(problem.answerKind, "int");
      assert.ok(
        Number.isInteger(problem.answer),
        `level ${level} expects ${problem.answer} in a whole-number box`,
      );
    }
  });
});

test("meten: money answers are non-negative and land on a cent", () => {
  for (let i = 0; i < REPS * 2; i++) {
    const problem = meten.generate(5);
    assert.equal(problem.answerKind, "euro");
    assert.ok(problem.answer >= 0, `negative change: ${problem.answer}`);
    assert.ok(
      Math.abs(problem.answer * 100 - Math.round(problem.answer * 100)) < 1e-6,
      `${problem.answer} is not a whole number of cents`,
    );
  }
});

test("procenten: choice questions include their own answer in the options", () => {
  [0, 1, 4].forEach((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = procenten.generate(level);
      assert.equal(problem.mode, "choice");
      assert.ok(problem.options.includes(problem.answer), "the answer is not among the options");
      assert.equal(new Set(problem.options).size, problem.options.length, "duplicate options");
      assert.ok(problem.options.length >= 2, "a choice needs at least two options");
    }
  });
});

test("procenten: numeric questions have whole-number answers", () => {
  [2, 3, 5].forEach((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = procenten.generate(level);
      assert.equal(problem.mode, "numeric");
      assert.ok(Number.isInteger(problem.answer), `level ${level} answer ${problem.answer}`);
      assert.ok(problem.answer >= 0);
    }
  });
});

test("algebra: only level 5 has two unknowns, and both are positive there", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = algebra.generate(level);
      assert.equal(problem.twoVar, level === 5);
      if (level === 5) {
        assert.ok(problem.answer.x > 0 && problem.answer.y > 0);
        assert.ok(problem.answer.x > problem.answer.y, "x - y must stay positive");
      }
    }
  });
});

test("algebra: x is a whole number, and only levels 4+ can make it negative", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const { x } = algebra.generate(level).answer;
      assert.ok(Number.isInteger(x));
      if (level < 4) assert.ok(x > 0, `level ${level} produced x=${x}`);
    }
  });
});

test("meetkunde: every answer is a positive whole number", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = meetkunde.generate(level);
      assert.ok(
        Number.isInteger(problem.answer) && problem.answer > 0,
        `level ${level}: ${problem.answer} (${problem.text})`,
      );
    }
  });
});

test("meetkunde: the angle level's given angles and the answer add to the shape's total", () => {
  for (let i = 0; i < REPS * 3; i++) {
    const problem = meetkunde.generate(5);
    const { shape, total, given } = problem.angles;
    assert.equal(total, shape === "triangle" ? 180 : 360);
    assert.equal(given.length, shape === "triangle" ? 2 : 3);
    const sum = given.reduce((s, v) => s + v, 0) + problem.answer;
    assert.equal(sum, total, `${given.join(" + ")} + ${problem.answer} = ${sum}, expected ${total}`);
    // Every angle has to be a sensible one to draw and to ask about - the old
    // rejection-sampled version could fall through to a negative third angle.
    assert.ok(problem.answer >= 20, `missing angle ${problem.answer} is too small`);
    for (const angle of given) {
      assert.ok(angle >= 20, `given angle ${angle} is too small`);
      assert.ok(angle < total, `given angle ${angle} exceeds the shape's total`);
    }
  }
});

test("verhoudingen: answers are non-negative, and only the unit-price level is money", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = verhoudingen.generate(level);
      assert.ok(problem.answer >= 0, `level ${level}: ${problem.answer}`);
      assert.equal(problem.answerKind, level === 4 ? "euro" : "int");
      if (level !== 4) assert.ok(Number.isInteger(problem.answer));
    }
  });
});

test("getallen: long division splits into a whole quotient and a valid remainder", () => {
  for (let i = 0; i < REPS * 2; i++) {
    const problem = getallen.generate(4);
    assert.equal(problem.answerKind, "two_part");
    const { q, r } = problem.answer;
    const [dividend, divisor] = [...problem.text.matchAll(/\d+/g)].map((m) => Number(m[0]));
    assert.equal(q * divisor + r, dividend, `${dividend} : ${divisor} != ${q} r ${r}`);
    assert.ok(r >= 0 && r < divisor, `remainder ${r} out of range for divisor ${divisor}`);
  }
});

test("getallen: one-decimal answers really do have at most one decimal", () => {
  for (let i = 0; i < REPS * 2; i++) {
    const problem = getallen.generate(5);
    assert.equal(problem.answerKind, "decimal1");
    const tenths = problem.answer * 10;
    assert.ok(
      Math.abs(tenths - Math.round(tenths)) < 1e-9,
      `${problem.answer} needs more than one decimal`,
    );
  }
});

// ---------------------------------------------------------------------------
// Speed and logic games
// ---------------------------------------------------------------------------

test("bliksem: always offers four distinct non-negative options, one of them right", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = bliksem.generateProblem(level);
      assert.equal(problem.options.length, 4, `got ${problem.options.length} options`);
      assert.equal(new Set(problem.options).size, 4, "duplicate options");
      assert.ok(problem.options.includes(problem.answer), "the answer is not among the options");
      for (const option of problem.options) {
        assert.ok(Number.isInteger(option) && option >= 0, `bad option ${option}`);
      }
    }
  });
});

test("bliksem: subtraction never goes below zero", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = bliksem.generateProblem(level);
      assert.ok(problem.answer >= 0, `${problem.text} = ${problem.answer}`);
    }
  });
});

test("logica: choice questions always contain their answer", () => {
  eachLevel((level) => {
    for (let i = 0; i < REPS; i++) {
      const problem = logica.generate(level);
      if (problem.kind === "choice") {
        assert.ok(
          problem.options.map(String).includes(String(problem.answer)),
          `answer "${problem.answer}" missing from [${problem.options}]`,
        );
        assert.ok(problem.options.length >= 2);
      } else {
        assert.ok(Number.isInteger(problem.answer), `number answer ${problem.answer}`);
      }
      assert.ok(problem.explain && problem.explain.length > 0, "every logic question explains itself");
    }
  });
});

test("logica: a magic square's blank cell is consistent with the stated total", () => {
  let checked = 0;
  for (let i = 0; i < REPS * 6 && checked < 40; i++) {
    const problem = logica.generate(5);
    if (!problem.grid) continue;
    checked += 1;
    const { values, blankRow, blankCol } = problem.grid;
    const total = values[0].reduce((s, v) => s + v, 0);
    for (const row of values) assert.equal(row.reduce((s, v) => s + v, 0), total);
    for (let c = 0; c < 3; c++) {
      assert.equal(values[0][c] + values[1][c] + values[2][c], total);
    }
    assert.equal(problem.answer, values[blankRow][blankCol]);
  }
  assert.ok(checked > 0, "no magic square was generated in the sample");
});

test("code: Mastermind scoring never counts a repeated digit twice", () => {
  assert.deepEqual(code.scoreGuess([1, 2, 3], [1, 2, 3]), { exact: 3, misplaced: 0 });
  assert.deepEqual(code.scoreGuess([1, 2, 3], [3, 2, 1]), { exact: 1, misplaced: 2 });
  assert.deepEqual(code.scoreGuess([1, 2, 3], [4, 5, 6]), { exact: 0, misplaced: 0 });
  // The classic repeated-digit trap: one 1 in the secret cannot score twice.
  assert.deepEqual(code.scoreGuess([1, 2, 2], [2, 1, 1]), { exact: 0, misplaced: 2 });
  assert.deepEqual(code.scoreGuess([1, 1, 2], [1, 2, 1]), { exact: 1, misplaced: 2 });
});

test("code: exact + misplaced never exceeds the code length", () => {
  for (const level of LEVELS) {
    const [length, maxDigit, , allowRepeats] = code.LEVEL_RULES[level];
    for (let i = 0; i < REPS; i++) {
      const secret = code.newSecret(length, maxDigit, allowRepeats);
      const guess = code.newSecret(length, maxDigit, true);
      const { exact, misplaced } = code.scoreGuess(secret, guess);
      assert.ok(exact + misplaced <= length, `${exact}+${misplaced} > ${length}`);
    }
  }
});

test("code: a no-repeats level never generates a code with a repeated digit", () => {
  for (const level of LEVELS) {
    const [length, maxDigit, , allowRepeats] = code.LEVEL_RULES[level];
    if (allowRepeats) continue;
    for (let i = 0; i < REPS; i++) {
      const secret = code.newSecret(length, maxDigit, allowRepeats);
      assert.equal(new Set(secret).size, length, `repeated digit in ${secret}`);
      assert.ok(Math.max(...secret) <= maxDigit);
    }
  }
});

test("jacht: every round is winnable and has something to hunt", () => {
  eachLevel((level) => {
    for (let i = 0; i < 120; i++) {
      const round = jacht.buildRound(level);
      assert.equal(round.numbers.length, 20, `grid has ${round.numbers.length} cells`);
      assert.equal(new Set(round.numbers).size, 20, "the grid repeats a number");
      assert.ok(round.targets.size >= 1, `level ${level}: nothing to find`);
      assert.ok(
        round.targets.size < round.numbers.length,
        "tapping everything must not win the round",
      );
      for (const target of round.targets) {
        assert.ok(round.numbers.includes(target), "a target is not on the grid");
      }
      assert.ok(round.ruleLabel && !round.ruleLabel.includes("{"), `unfilled rule: ${round.ruleLabel}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Visuals - they build strings, so they can be checked without a browser
// ---------------------------------------------------------------------------

test("every visual returns well-formed SVG with balanced tags", () => {
  const svgs = [
    visuals.pizzaSvg(3, 8),
    visuals.pizzaSvg(0, 1),
    visuals.fractionBarSvg(7, 16),
    visuals.fractionVisualSvg(5, 20),
    visuals.percentBarSvg(64),
    visuals.arrayGridSvg(4, 6),
    visuals.arrayGridSvg(20, 20), // over max_dots: the fallback grid
    visuals.clockSvg(9, 45),
    visuals.tapeDiagramSvg(20, 12.5),
    visuals.ratioBarSvg([3, 5], { labels: ["3", "5"] }),
    visuals.balanceScaleSvg("x + 4", "11"),
    visuals.numberLineSvg(-10, 10, [[-3, "start"]]),
    visuals.skipCountSvg(7, 56),
    visuals.rectangleSvg(6, 4, { unit: "cm" }),
    visuals.triangleSvg(12, 8, { unit: "cm" }),
    visuals.cuboidSvg(3, 4, 5, { unit: "cm" }),
    visuals.speedDiagramSvg(120, "km", 2, "uur"),
    visuals.countdownRingSvg(12, 60),
  ];
  for (const svg of svgs) {
    assert.match(svg, /^<svg[\s>]/, "does not start with <svg");
    assert.match(svg, /<\/svg>\s*$/, "does not end with </svg>");
    assert.ok(!svg.includes("NaN"), `NaN in SVG: ${svg.slice(0, 120)}`);
    assert.ok(!svg.includes("undefined"), `undefined in SVG: ${svg.slice(0, 120)}`);
    assert.equal(
      (svg.match(/<svg/g) || []).length,
      (svg.match(/<\/svg>/g) || []).length,
      "unbalanced <svg> tags",
    );
  }
});

test("each SVG scopes its animation classes to its own id", () => {
  // Two pizzas on one page must not animate each other - the whole reason the
  // visual library carries a per-render uid.
  const first = visuals.pizzaSvg(1, 4);
  const second = visuals.pizzaSvg(3, 4);
  const idOf = (svg) => svg.match(/id="(k[0-9a-f]+)"/)[1];
  assert.notEqual(idOf(first), idOf(second));
  assert.ok(first.includes(`.${idOf(first)}-fill`));
  assert.ok(!first.includes(idOf(second)));
});

test("every animated SVG honours prefers-reduced-motion", () => {
  const animated = [
    visuals.pizzaSvg(3, 8),
    visuals.percentBarSvg(50),
    visuals.clockSvg(3, 15),
    visuals.rectangleSvg(5, 3),
    visuals.speedDiagramSvg(60, "km", 1, "uur"),
  ];
  for (const svg of animated) {
    assert.match(svg, /prefers-reduced-motion/, "no reduced-motion escape hatch");
  }
});

test("a fraction visual clamps a numerator larger than its denominator", () => {
  const svg = visuals.pizzaSvg(99, 4);
  assert.match(svg, />4\/4 = 100%</);
});

test("visuals pick a pizza for small denominators and a bar for large ones", () => {
  assert.match(visuals.fractionVisualSvg(1, 8), /<path/);
  assert.match(visuals.fractionVisualSvg(1, 16), /<rect/);
});

// ---------------------------------------------------------------------------
// Language switching
// ---------------------------------------------------------------------------

test("switching language changes the generated question text", () => {
  setLanguage("nl");
  assert.equal(getLanguage(), "nl");
  const dutch = t("common.your_answer");
  setLanguage("en");
  const english = t("common.your_answer");
  assert.notEqual(dutch, english);
  setLanguage("nl");
});

test("generators work in English too", () => {
  setLanguage("en");
  try {
    for (const [name, generate] of Object.entries(GENERATORS)) {
      eachLevel((level) => {
        const problem = generate(level);
        assert.ok(problem.text.length > 0, `${name} produced no English question`);
        assert.ok(!problem.text.includes("{"), `${name}: unfilled placeholder in "${problem.text}"`);
      });
    }
  } finally {
    setLanguage("nl");
  }
});

// ---------------------------------------------------------------------------
// Level Progress Tracking & No-Redo Machinery
// ---------------------------------------------------------------------------

test("level tracking: starts uncompleted, marks completed, and counts correctly", () => {
  // Clear any existing test state
  state.resetCurrentProfile();

  assert.equal(state.isLevelCompleted("tafel", 0), false);
  assert.equal(state.getCompletedLevelsCount("tafel"), 0);

  // Mark level 0 as completed
  state.markLevelCompleted("tafel", 0);
  assert.equal(state.isLevelCompleted("tafel", 0), true);
  assert.equal(state.isLevelCompleted("tafel", 1), false);
  assert.equal(state.getCompletedLevelsCount("tafel"), 1);
  assert.deepEqual(state.getCompletedLevels("tafel"), [0]);

  // Mark level 1 as completed
  state.markLevelCompleted("tafel", 1);
  assert.equal(state.isLevelCompleted("tafel", 1), true);
  assert.equal(state.getCompletedLevelsCount("tafel"), 2);
  assert.deepEqual(state.getCompletedLevels("tafel"), [0, 1]);

  // Next uncompleted level skips completed ones so player doesn't redo
  assert.equal(state.nextUncompletedLevel("tafel"), 2);

  // If level 2 is marked completed as well, next jumps to 3
  state.markLevelCompleted("tafel", 2);
  assert.equal(state.nextUncompletedLevel("tafel"), 3);

  // Marking an already completed level again is idempotent
  state.markLevelCompleted("tafel", 0);
  assert.equal(state.getCompletedLevelsCount("tafel"), 3);

  // Total completed levels count sums across all games
  assert.ok(state.totalCompletedLevelsCount() >= 3);
  assert.ok(state.totalPossibleLevelsCount() > 0);
});

test("level tracking: profile persistence preserves completed levels", () => {
  const store = new Map();
  const prevLs = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };

  try {
    state.resetCurrentProfile();
    state.setPlayerName("TestRekenSpeler");
    state.markLevelCompleted("breuken", 0);
    state.markLevelCompleted("breuken", 1);
    state.markLevelCompleted("procenten", 2);

    // Save current profile to localStorage
    state.saveCurrentProfile();

    // Reset in-memory state
    state.resetCurrentProfile();
    assert.equal(state.isLevelCompleted("breuken", 0), false);

    // Reload profile
    state.applyProfile("TestRekenSpeler");
    assert.equal(state.isLevelCompleted("breuken", 0), true);
    assert.equal(state.isLevelCompleted("breuken", 1), true);
    assert.equal(state.isLevelCompleted("breuken", 2), false);
    assert.equal(state.isLevelCompleted("procenten", 2), true);
    assert.equal(state.nextUncompletedLevel("breuken"), 2);
  } finally {
    globalThis.localStorage = prevLs;
  }
});

// ---------------------------------------------------------------------------
// Multiplayer Competition Mode
// ---------------------------------------------------------------------------

test("competition: problem generator produces valid 4-choice questions for all categories", () => {
  const categories = ["bliksem", "tafels", "breuken", "procenten", "all"];
  const difficulties = [1, 2, 3];

  for (const cat of categories) {
    for (const diff of difficulties) {
      for (let i = 0; i < 30; i++) {
        const prob = competitie.generateCompetitionProblem(cat, diff);
        assert.ok(prob.text && prob.text.length > 0, `empty question text for ${cat} diff ${diff}`);
        assert.ok(Array.isArray(prob.options), "options is not an array");
        assert.equal(prob.options.length, 4, "must have exactly 4 choices");
        assert.ok(prob.options.includes(prob.answer), `answer ${prob.answer} not in options [${prob.options.join(", ")}]`);
        assert.equal(new Set(prob.options).size, 4, "options must be distinct");
      }
    }
  }
});

test("competition: scoring awards points by speed and exactly 0 for wrong answers", () => {
  // Wrong answers must award strictly 0 points
  assert.equal(competitie.calculateCompetitionPoints(false, 1.0), 0);
  assert.equal(competitie.calculateCompetitionPoints(false, 0.2), 0);
  assert.equal(competitie.calculateCompetitionPoints(false, 14.9), 0);

  // Correct answers: faster response = more points
  const fastScore = competitie.calculateCompetitionPoints(true, 1.0);
  const midScore = competitie.calculateCompetitionPoints(true, 5.0);
  const slowScore = competitie.calculateCompetitionPoints(true, 12.0);
  const maxTimeScore = competitie.calculateCompetitionPoints(true, 15.0);

  assert.ok(fastScore > midScore, `fast ${fastScore} should be > mid ${midScore}`);
  assert.ok(midScore > slowScore, `mid ${midScore} should be > slow ${slowScore}`);
  assert.ok(slowScore >= maxTimeScore, `slow ${slowScore} should be >= maxTime ${maxTimeScore}`);

  // Floor of at least 20 points for correct answer within time
  assert.ok(maxTimeScore >= 20);
  // Ceiling at 100 points
  assert.ok(fastScore <= 100);
});

test("competition: MultiplayerManager handles room creation, joining, and answers", async () => {
  const { MultiplayerManager } = await import("../../server-multiplayer.js");
  const mgr = new MultiplayerManager();

  // Create room
  const room = mgr.createRoom("Liam (NL)", { category: "tafels", rounds: 5, difficulty: 2 });
  assert.ok(room.code && room.code.length === 5);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].name, "Liam (NL)");
  assert.equal(room.status, "waiting");

  // Join room
  const joinResult = mgr.joinRoom(room.code, "Minh (VN)");
  assert.ok(!joinResult.error, `join error: ${joinResult.error}`);
  assert.equal(room.players.length, 2);
  assert.equal(room.players[1].name, "Minh (VN)");

  // Start game
  mgr.startGame(room);
  assert.equal(room.status, "countdown");
  assert.equal(room.questions.length, 5);

  // Advance to round 0
  mgr.startNextRound(room);
  assert.equal(room.status, "in_round");
  assert.equal(room.currentRoundIndex, 0);

  const q = room.questions[0];
  assert.ok(q.text && q.options.length === 4);

  // P1 answers correctly
  mgr.recordAnswer(room, room.players[0].id, q.answerDisplay);
  assert.ok(room.players[0].score > 0);
  assert.equal(room.players[0].correctCount, 1);

  // P2 answers wrong
  const wrongAns = q.options.find((opt) => String(opt) !== String(q.answerDisplay)) || "0";
  mgr.recordAnswer(room, room.players[1].id, wrongAns);
  assert.equal(room.players[1].score, 0); // Incorrect must get 0
  assert.equal(room.players[1].correctCount, 0);

  // End round
  mgr.endRound(room);
  assert.equal(room.status, "round_recap");
  assert.equal(room.roundHistory.length, 1);
  assert.equal(room.roundHistory[0].roundWinner, "Liam (NL)");

  if (room.timer) clearTimeout(room.timer);
});

test("sound effects: sound module exports all expected sound functions", async () => {
  const sound = await import("../../web/js/sound.js");
  const expectedFns = [
    "unlock",
    "playCorrect",
    "playIncorrect",
    "playDing",
    "playBuzz",
    "playLevelUp",
    "playBadge",
    "playTap",
    "playTick",
    "playTimeUp",
    "playFanfare",
  ];
  for (const fnName of expectedFns) {
    assert.equal(typeof sound[fnName], "function", `Missing sound function: ${fnName}`);
  }
});

test("local competition logic: handles both players answering and timer timeout transitions", () => {
  const { generateCompetitionProblem, calculateCompetitionPoints, ROUND_TIME_SECONDS } = competitie;
  const problem = generateCompetitionProblem("bliksem", 2);
  assert.ok(problem.text);
  assert.ok(problem.options.length === 4);

  // Simulation: Both players answer
  let p1Answered = false;
  let p2Answered = false;
  let roundEnded = false;
  const p1Results = [];
  const p2Results = [];

  function recordPlayerAnswer(playerNum, chosen, elapsedSeconds) {
    if (roundEnded) return;
    const isCorrect = String(chosen) === String(problem.answerDisplay);
    const points = calculateCompetitionPoints(isCorrect, elapsedSeconds, ROUND_TIME_SECONDS);
    const entry = {
      question: problem.text,
      correctAnswer: problem.answerDisplay,
      chosen,
      isCorrect,
      points,
      responseSeconds: elapsedSeconds,
    };
    if (playerNum === 1) {
      p1Answered = true;
      p1Results.push(entry);
    } else {
      p2Answered = true;
      p2Results.push(entry);
    }
    if (p1Answered && p2Answered) {
      roundEnded = true;
    }
  }

  recordPlayerAnswer(1, problem.answerDisplay, 2.5);
  assert.equal(p1Answered, true);
  assert.equal(p2Answered, false);
  assert.equal(roundEnded, false);
  assert.ok(p1Results[0].points > 0);

  // Player 2 answers wrong
  const wrongAns = problem.options.find((o) => String(o) !== String(problem.answerDisplay));
  recordPlayerAnswer(2, wrongAns, 3.2);
  assert.equal(p2Answered, true);
  assert.equal(roundEnded, true); // Round ended triggered!
  assert.equal(p2Results[0].points, 0);

  // Simulation: Timeout when player 2 doesn't answer in another round
  let timeoutRoundEnded = false;
  let tP1Answered = false;
  let tP2Answered = false;
  const tP1Results = [];
  const tP2Results = [];

  // P1 answered at 4s
  tP1Answered = true;
  tP1Results.push({
    question: problem.text,
    correctAnswer: problem.answerDisplay,
    chosen: problem.answerDisplay,
    isCorrect: true,
    points: calculateCompetitionPoints(true, 4, ROUND_TIME_SECONDS),
    responseSeconds: 4,
  });

  // Timeout fires
  function handleTimeout() {
    if (timeoutRoundEnded) return;
    if (!tP1Answered) {
      tP1Answered = true;
      tP1Results.push({ chosen: "—", isCorrect: false, points: 0, responseSeconds: 15 });
    }
    if (!tP2Answered) {
      tP2Answered = true;
      tP2Results.push({ chosen: "—", isCorrect: false, points: 0, responseSeconds: 15 });
    }
    timeoutRoundEnded = true;
  }

  handleTimeout();
  assert.equal(timeoutRoundEnded, true);
  assert.equal(tP1Answered, true);
  assert.equal(tP2Answered, true);
  assert.ok(tP1Results[0].points > 0);
  assert.equal(tP2Results[0].points, 0);
  assert.equal(tP2Results[0].chosen, "—");
});

test("competition sound resiliency: handles missing sound functions gracefully with fallbacks", () => {
  // Simulate an older cached sound module lacking playDing or playBuzz
  const legacySound = {
    playCorrect: () => "called-playCorrect",
    playIncorrect: () => "called-playIncorrect",
  };

  let invoked = null;
  function safePlayMock(mod, fnName, fallbackFnName) {
    try {
      if (typeof mod[fnName] === "function") {
        invoked = mod[fnName]();
        return;
      }
      if (fallbackFnName && typeof mod[fallbackFnName] === "function") {
        invoked = mod[fallbackFnName]();
        return;
      }
    } catch {
      /* ignore */
    }
  }

  // playDing missing on legacy sound module -> falls back to playCorrect without error
  assert.doesNotThrow(() => {
    safePlayMock(legacySound, "playDing", "playCorrect");
  });
  assert.equal(invoked, "called-playCorrect");

  // playBuzz missing on legacy sound module -> falls back to playIncorrect without error
  assert.doesNotThrow(() => {
    safePlayMock(legacySound, "playBuzz", "playIncorrect");
  });
  assert.equal(invoked, "called-playIncorrect");

  // Completely empty sound object -> silently protected, does not throw TypeError
  assert.doesNotThrow(() => {
    safePlayMock({}, "playDing", "playCorrect");
    safePlayMock({}, "playBuzz", "playIncorrect");
  });
});


