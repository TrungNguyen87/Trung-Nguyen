/**
 * Session and player state - the port of utils/state.py and utils/profiles.py.
 *
 * The level/streak/badge rules are unchanged from the Streamlit app, so a
 * child's difficulty curve feels identical. What changed is where the data
 * lives: st.session_state (server memory) and logs/player_profiles.json
 * (server disk) become localStorage in the child's own browser.
 *
 * That is a real improvement, not just a port:
 *   - progress survives a reload, a redeploy, and being offline;
 *   - nothing about a child ever leaves their device, which is exactly what
 *     docs/PLATFORM_ROADMAP.md section 6 asks for.
 *
 * Every read and write is wrapped: Safari private mode throws on the first
 * localStorage access, and a maths game must not white-screen because of it.
 */
export const MIN_LEVEL = 0; // level 0 is the extra-gentle warm-up tier
export const MAX_LEVEL = 5;
export const LEVEL_UP_STREAK = 3; // correct answers in a row needed to level up
export const LEVEL_DOWN_STREAK = 2; // wrong answers in a row that drop a level
export const SESSION_GOAL_MINUTES = 45;

// A child can only earn this many *spendable* coins per calendar day (UTC,
// matching the log's UTC timestamps). totalScore, streaks, levels and badges
// are never capped - only the reward-shop currency is, and only the earning
// of it, never spending it. This is what stops one long session from clearing
// the whole shop: the catalog's higher tiers are priced assuming this cap, so
// raising it here is the one knob a parent would need to turn.
export const DAILY_COIN_CAP = 300;

export const GAME_KEYS = [
  "tafel",
  "breuken",
  "meten",
  "procenten",
  "algebra",
  "meetkunde",
  "verhoudingen",
  "getallen",
  // Speed and logic games share the same level/streak/badge machinery, so
  // they count towards "tried every game" like the rest.
  "bliksem",
  "logica",
  "code",
  "jacht",
];

const PROFILES_KEY = "kmg.profiles";
const CURRENT_KEY = "kmg.currentPlayer";
const PREFS_KEY = "kmg.prefs";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage full or blocked: the session keeps working in memory, it just
    // won't be there next time.
    return false;
  }
}

function freshLevels() {
  return Object.fromEntries(GAME_KEYS.map((k) => [k, MIN_LEVEL]));
}

function freshCompletedLevels() {
  return Object.fromEntries(GAME_KEYS.map((k) => [k, new Set()]));
}

function freshGameStreaks() {
  return Object.fromEntries(GAME_KEYS.map((k) => [k, { correct: 0, wrong: 0 }]));
}

function randomId() {
  return Math.random().toString(16).slice(2, 10);
}

// UTC, deliberately: it is what every log timestamp already uses (see
// log.js), so "today" means the same thing everywhere in the app rather than
// drifting between a local-time reward reset and a UTC-time log.
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const listeners = new Set();

/** Subscribe to any state change; returns an unsubscribe function. */
export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitChange() {
  listeners.forEach((fn) => fn(state));
}

const prefs = readJson(PREFS_KEY, {});

export const state = {
  // Session-scoped: these start fresh every time the app is opened, exactly
  // as they did per browser session in Streamlit.
  sessionId: randomId(),
  sessionStart: Date.now(),
  streaks: 0,
  questionsAnswered: 0,
  correctAnswered: 0,
  gameStreaks: freshGameStreaks(),
  // Player-scoped: restored from the saved profile below.
  playerName: "",
  totalScore: 0,
  levels: freshLevels(),
  completedLevels: freshCompletedLevels(),
  badges: [],
  // The reward shop's spendable balance - mirrors totalScore as it is earned,
  // but drops when spent, so totalScore stays a lifetime achievement number
  // while coins are what the shop actually charges.
  coins: 0,
  coinsEarnedToday: 0,
  coinsEarnedDay: todayKey(),
  unlockedRewards: new Set(),
  equippedAvatar: null,
  gamesTried: new Set(),
  // Device preference, not tied to a player.
  soundEnabled: prefs.soundEnabled !== false,
};

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** All saved profiles, keyed by player name ("" is the no-name-yet player). */
export function allProfiles() {
  return readJson(PROFILES_KEY, {});
}

export function profileNames() {
  return Object.keys(allProfiles())
    .filter((n) => n !== "")
    .sort((a, b) => a.localeCompare(b));
}

export function saveCurrentProfile() {
  const profiles = allProfiles();
  profiles[state.playerName] = {
    totalScore: state.totalScore,
    levels: { ...state.levels },
    completedLevels: Object.fromEntries(
      GAME_KEYS.map((k) => [k, [...(state.completedLevels[k] ?? [])].sort((a, b) => a - b)]),
    ),
    badges: [...state.badges],
    coins: state.coins,
    coinsEarnedToday: state.coinsEarnedToday,
    coinsEarnedDay: state.coinsEarnedDay,
    unlockedRewards: [...state.unlockedRewards].sort(),
    equippedAvatar: state.equippedAvatar,
    gamesTried: [...state.gamesTried].sort(),
    updatedAt: new Date().toISOString(),
  };
  writeJson(PROFILES_KEY, profiles);
  try {
    localStorage.setItem(CURRENT_KEY, state.playerName);
  } catch {
    /* see writeJson */
  }
}

export function resetCurrentProfile() {
  applyProfile("");
}

/** Restore a saved profile into the live state. Returns true if one existed. */
export function applyProfile(name) {
  const profile = allProfiles()[name];
  state.playerName = name;
  if (!profile) {
    state.totalScore = 0;
    state.levels = freshLevels();
    state.completedLevels = freshCompletedLevels();
    state.badges = [];
    state.coins = 0;
    state.coinsEarnedToday = 0;
    state.coinsEarnedDay = todayKey();
    state.unlockedRewards = new Set();
    state.equippedAvatar = null;
    state.gamesTried = new Set();
    state.gameStreaks = freshGameStreaks();
    emitChange();
    return false;
  }
  state.totalScore = profile.totalScore || 0;
  state.levels = Object.fromEntries(
    GAME_KEYS.map((k) => [k, profile.levels?.[k] ?? MIN_LEVEL]),
  );
  state.completedLevels = Object.fromEntries(
    GAME_KEYS.map((k) => {
      const saved = new Set(profile.completedLevels?.[k] ?? []);
      // Backwards compatibility: any level strictly below the current level is marked completed
      const current = profile.levels?.[k] ?? MIN_LEVEL;
      for (let l = MIN_LEVEL; l < current; l++) {
        saved.add(l);
      }
      return [k, saved];
    }),
  );
  state.badges = profile.badges || [];
  state.coins = profile.coins || 0;
  state.coinsEarnedToday = profile.coinsEarnedToday || 0;
  state.coinsEarnedDay = profile.coinsEarnedDay || todayKey();
  ensureCoinDayFresh(); // a profile loaded on a later day starts with a clean cap
  state.unlockedRewards = new Set(profile.unlockedRewards || []);
  state.equippedAvatar = profile.equippedAvatar || null;
  state.gamesTried = new Set(profile.gamesTried || []);
  state.gameStreaks = freshGameStreaks();
  emitChange();
  return true;
}

/** Called once at boot: pick up whoever was playing last on this device. */
export function restoreLastPlayer() {
  let name = "";
  try {
    name = localStorage.getItem(CURRENT_KEY) || "";
  } catch {
    /* see readJson */
  }
  return applyProfile(name);
}

export function setPlayerName(name) {
  const trimmed = (name || "").trim().slice(0, 40);
  if (trimmed === state.playerName) return false;
  // Keep whatever the previous player earned before switching over.
  saveCurrentProfile();
  const existed = applyProfile(trimmed);
  saveCurrentProfile();
  return existed;
}

export function setSoundEnabled(enabled) {
  state.soundEnabled = !!enabled;
  writeJson(PREFS_KEY, { ...readJson(PREFS_KEY, {}), soundEnabled: state.soundEnabled });
  emitChange();
}

// ---------------------------------------------------------------------------
// Scoring and adaptive difficulty (unchanged rules from utils/state.py)
// ---------------------------------------------------------------------------

// Rolls state.coinsEarnedToday over the moment the UTC date changes, so a
// profile that was last saved yesterday (or last week) starts today with a
// full cap instead of whatever was left over.
function ensureCoinDayFresh() {
  const today = todayKey();
  if (state.coinsEarnedDay !== today) {
    state.coinsEarnedDay = today;
    state.coinsEarnedToday = 0;
  }
}

/** Spendable coins still earnable today before DAILY_COIN_CAP kicks in. */
export function remainingDailyCoins() {
  ensureCoinDayFresh();
  return Math.max(0, DAILY_COIN_CAP - state.coinsEarnedToday);
}

export function addScore(points = 10) {
  state.totalScore += points;
  state.streaks += 1;
  // totalScore is the lifetime achievement number and is never capped; coins
  // are the reward-shop currency, and only that earning is capped per day -
  // spending coins is unaffected, and levels/badges/streaks read totalScore
  // and the streak counter, never coins, so difficulty and badges keep
  // working exactly as before even on a day the cap is hit.
  ensureCoinDayFresh();
  const grant = Math.min(points, Math.max(0, DAILY_COIN_CAP - state.coinsEarnedToday));
  if (grant > 0) {
    state.coins += grant;
    state.coinsEarnedToday += grant;
  }
  emitChange();
}

/**
 * Spend coins from the reward-shop balance. Returns false (and spends
 * nothing) if the balance is short, so a caller can just check the result
 * instead of comparing state.coins itself.
 */
export function spendCoins(amount) {
  if (!(amount > 0) || state.coins < amount) return false;
  state.coins -= amount;
  emitChange();
  return true;
}

export function resetStreak() {
  state.streaks = 0;
  emitChange();
}

export function getMaxLevel(gameKey = null) {
  if (gameKey === "tafel") return 6;
  return MAX_LEVEL;
}

export function getLevel(gameKey) {
  return state.levels[gameKey] ?? MIN_LEVEL;
}

/** The highest level the child has reached in any single game so far. */
export function highestLevelReached() {
  return Math.max(MIN_LEVEL, ...GAME_KEYS.map((k) => getLevel(k)));
}

/** True once every game - Tafel Monster's own level 6 included - is maxed. */
export function allGamesAtTrueMax() {
  return GAME_KEYS.every((k) => getLevel(k) >= getMaxLevel(k));
}

export function setLevel(gameKey, level) {
  const max = getMaxLevel(gameKey);
  const clamped = Math.max(MIN_LEVEL, Math.min(max, level));
  state.levels[gameKey] = clamped;
  // Starting fresh at the new level: the old streak counters described a
  // difficulty the child is no longer playing.
  state.gameStreaks[gameKey] = { correct: 0, wrong: 0 };
  emitChange();
  return clamped;
}

export function isLevelCompleted(gameKey, level) {
  return state.completedLevels[gameKey]?.has(level) ?? false;
}

export function markLevelCompleted(gameKey, level) {
  if (!state.completedLevels[gameKey]) {
    state.completedLevels[gameKey] = new Set();
  }
  const already = state.completedLevels[gameKey].has(level);
  if (!already) {
    state.completedLevels[gameKey].add(level);
    emitChange();
    saveCurrentProfile();
    return true;
  }
  return false;
}

export function getCompletedLevels(gameKey) {
  return [...(state.completedLevels[gameKey] ?? [])].sort((a, b) => a - b);
}

export function getCompletedLevelsCount(gameKey) {
  return state.completedLevels[gameKey]?.size ?? 0;
}

export function totalCompletedLevelsCount() {
  return GAME_KEYS.reduce((sum, k) => sum + (state.completedLevels[k]?.size ?? 0), 0);
}

export function totalPossibleLevelsCount() {
  return GAME_KEYS.reduce((sum, k) => sum + (getMaxLevel(k) - MIN_LEVEL + 1), 0);
}

export function nextUncompletedLevel(gameKey) {
  const max = getMaxLevel(gameKey);
  for (let l = MIN_LEVEL; l <= max; l++) {
    if (!isLevelCompleted(gameKey, l)) return l;
  }
  return max;
}

export function highestCompletedLevel(gameKey) {
  const completed = getCompletedLevels(gameKey);
  return completed.length ? Math.max(...completed) : null;
}

/**
 * Update the counters after an answer and adapt the level: up after
 * LEVEL_UP_STREAK correct in a row, down after LEVEL_DOWN_STREAK wrong.
 * @returns {{leveledUp: boolean, leveledDown: boolean}}
 */
export function registerAttempt(gameKey, isCorrect) {
  state.questionsAnswered += 1;
  state.gamesTried.add(gameKey);
  const streak = (state.gameStreaks[gameKey] ??= { correct: 0, wrong: 0 });
  let leveledUp = false;
  let leveledDown = false;
  const currentLevel = getLevel(gameKey);
  const max = getMaxLevel(gameKey);

  if (isCorrect) {
    state.correctAnswered += 1;
    streak.correct += 1;
    streak.wrong = 0;
    if (streak.correct >= LEVEL_UP_STREAK) {
      markLevelCompleted(gameKey, currentLevel);
      if (currentLevel < max) {
        setLevel(gameKey, currentLevel + 1);
        leveledUp = true;
      }
    }
  } else {
    streak.wrong += 1;
    streak.correct = 0;
    if (streak.wrong >= LEVEL_DOWN_STREAK && currentLevel > MIN_LEVEL) {
      setLevel(gameKey, currentLevel - 1);
      leveledDown = true;
    }
  }
  emitChange();
  return { leveledUp, leveledDown };
}

/** Count a question without touching the difficulty (used by timed rounds). */
export function countAttemptOnly(gameKey, isCorrect) {
  state.questionsAnswered += 1;
  state.gamesTried.add(gameKey);
  if (isCorrect) state.correctAnswered += 1;
  emitChange();
}

export function sessionElapsedMinutes() {
  return (Date.now() - state.sessionStart) / 60000;
}

export function sessionAccuracy() {
  if (!state.questionsAnswered) return 0;
  return (100 * state.correctAnswered) / state.questionsAnswered;
}

/** Wipe every profile on this device (parent dashboard "danger zone"). */
export function clearAllProfiles() {
  try {
    localStorage.removeItem(PROFILES_KEY);
    localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* see writeJson */
  }
  state.totalScore = 0;
  state.levels = freshLevels();
  state.completedLevels = freshCompletedLevels();
  state.badges = [];
  state.coins = 0;
  state.coinsEarnedToday = 0;
  state.coinsEarnedDay = todayKey();
  state.unlockedRewards = new Set();
  state.equippedAvatar = null;
  state.gamesTried = new Set();
  state.gameStreaks = freshGameStreaks();
  state.streaks = 0;
  state.questionsAnswered = 0;
  state.correctAnswered = 0;
  emitChange();
}
