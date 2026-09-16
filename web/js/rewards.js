/**
 * The reward shop: what a child can do with the coins they earn.
 *
 * Every correct answer already pays coins alongside the score (see
 * addScore() in state.js, which also caps how many coins can be *earned* per
 * day) - this module is only about spending them: a static catalog of
 * characters and stickers, and the actions that unlock and equip them.
 * Unlocks are permanent and persisted with the rest of the player's profile,
 * exactly like badges and levels.
 *
 * Two things gate the priciest items, on top of the coin cost:
 *   - minLevel: the child must have pushed at least one game to that level,
 *     not just saved up the balance - "a certain level" as well as "more
 *     points".
 *   - requiresMastery (the single ultra item only): every game at its own
 *     true max level, and every other reward in the shop already unlocked.
 *     That is the "only people who can finish everything" item.
 */
import {
  MAX_LEVEL,
  allGamesAtTrueMax,
  emitChange,
  highestLevelReached,
  saveCurrentProfile,
  spendCoins,
  state,
} from "./state.js";

const DEFAULT_AVATAR_ID = "avatar_default";

// Costs are tiered so the first couple of items fall in one sitting and the
// rarest ones take weeks of steady daily play - a plausible "ask a parent to
// be proud of you" milestone rather than something one long session can
// sweep. These numbers are priced against DAILY_COIN_CAP in state.js, not
// against how fast a child can tap "check".
const COMMON = 40;
const UNCOMMON = 120;
const RARE = 320;
const EPIC = 700;
const LEGENDARY = 1500;
const MYTHIC = 3000; // the "special anime-style hero" tier
const ULTRA = 8000; // exactly one item lives here - see requiresMastery

export const TIER_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "ultra"];

// { id, category, tier, emoji, nameKey, cost, minLevel, requiresMastery } -
// cost 0 means always unlocked. category "avatar" items can be equipped
// (shown next to the player's name); category "sticker" items are pure
// collectibles. Existing ids are never renamed or removed, even when their
// cost or level gate changes, so a device that already unlocked something
// never loses it.
export const REWARD_DEFS = [
  { id: "avatar_default", category: "avatar", tier: "common", emoji: "🧑", nameKey: "rewards.avatar_default", cost: 0, minLevel: 0 },

  // --- Common: friendly animals, the first sitting or two -----------------
  { id: "avatar_cat", category: "avatar", tier: "common", emoji: "🐱", nameKey: "rewards.avatar_cat", cost: COMMON, minLevel: 0 },
  { id: "avatar_dog", category: "avatar", tier: "common", emoji: "🐶", nameKey: "rewards.avatar_dog", cost: COMMON, minLevel: 0 },
  { id: "avatar_fox", category: "avatar", tier: "common", emoji: "🦊", nameKey: "rewards.avatar_fox", cost: COMMON, minLevel: 0 },
  { id: "avatar_rabbit", category: "avatar", tier: "common", emoji: "🐰", nameKey: "rewards.avatar_rabbit", cost: COMMON, minLevel: 0 },
  { id: "avatar_koala", category: "avatar", tier: "common", emoji: "🐨", nameKey: "rewards.avatar_koala", cost: COMMON, minLevel: 0 },
  { id: "avatar_turtle", category: "avatar", tier: "common", emoji: "🐢", nameKey: "rewards.avatar_turtle", cost: COMMON, minLevel: 0 },

  // --- Uncommon: a few days of play in -------------------------------------
  { id: "avatar_panda", category: "avatar", tier: "uncommon", emoji: "🐼", nameKey: "rewards.avatar_panda", cost: UNCOMMON, minLevel: 0 },
  { id: "avatar_penguin", category: "avatar", tier: "uncommon", emoji: "🐧", nameKey: "rewards.avatar_penguin", cost: UNCOMMON, minLevel: 0 },
  { id: "avatar_lion", category: "avatar", tier: "uncommon", emoji: "🦁", nameKey: "rewards.avatar_lion", cost: UNCOMMON, minLevel: 0 },
  { id: "avatar_tiger", category: "avatar", tier: "uncommon", emoji: "🐯", nameKey: "rewards.avatar_tiger", cost: UNCOMMON, minLevel: 0 },
  { id: "avatar_owl", category: "avatar", tier: "uncommon", emoji: "🦉", nameKey: "rewards.avatar_owl", cost: UNCOMMON, minLevel: 0 },
  { id: "avatar_elephant", category: "avatar", tier: "uncommon", emoji: "🐘", nameKey: "rewards.avatar_elephant", cost: UNCOMMON, minLevel: 0 },

  // --- Rare: needs level 2 in something, not just coins --------------------
  { id: "avatar_unicorn", category: "avatar", tier: "rare", emoji: "🦄", nameKey: "rewards.avatar_unicorn", cost: RARE, minLevel: 2 },
  { id: "avatar_dragon", category: "avatar", tier: "rare", emoji: "🐲", nameKey: "rewards.avatar_dragon", cost: RARE, minLevel: 2 },
  { id: "avatar_mermaid", category: "avatar", tier: "rare", emoji: "🧜", nameKey: "rewards.avatar_mermaid", cost: RARE, minLevel: 2 },
  { id: "avatar_genie", category: "avatar", tier: "rare", emoji: "🧞", nameKey: "rewards.avatar_genie", cost: RARE, minLevel: 2 },

  // --- Epic: level 3 --------------------------------------------------------
  { id: "avatar_wizard", category: "avatar", tier: "epic", emoji: "🧙", nameKey: "rewards.avatar_wizard", cost: EPIC, minLevel: 3 },
  { id: "avatar_superhero", category: "avatar", tier: "epic", emoji: "🦸", nameKey: "rewards.avatar_superhero", cost: EPIC, minLevel: 3 },
  { id: "avatar_ninja", category: "avatar", tier: "epic", emoji: "🥷", nameKey: "rewards.avatar_ninja", cost: EPIC, minLevel: 3 },

  // --- Legendary: level 4 ----------------------------------------------------
  { id: "avatar_astronaut", category: "avatar", tier: "legendary", emoji: "🚀", nameKey: "rewards.avatar_astronaut", cost: LEGENDARY, minLevel: 4 },
  { id: "avatar_king", category: "avatar", tier: "legendary", emoji: "🤴", nameKey: "rewards.avatar_king", cost: LEGENDARY, minLevel: 4 },

  // --- Mythic: original anime-style heroes, needs a maxed game -------------
  // (Real franchise characters like Luffy are trademarked, so these are
  // original archetypes in the same spirit rather than a copy of one.)
  { id: "avatar_dragon_blade", category: "avatar", tier: "mythic", emoji: "🐉⚔️", nameKey: "rewards.avatar_dragon_blade", cost: MYTHIC, minLevel: MAX_LEVEL },
  { id: "avatar_star_ninja", category: "avatar", tier: "mythic", emoji: "🥷✨", nameKey: "rewards.avatar_star_ninja", cost: MYTHIC, minLevel: MAX_LEVEL },
  { id: "avatar_galaxy_guardian", category: "avatar", tier: "mythic", emoji: "🌌🦸", nameKey: "rewards.avatar_galaxy_guardian", cost: MYTHIC, minLevel: MAX_LEVEL },

  // --- Ultra: the one capstone reward, rendered as a rotating 3D card ------
  { id: "avatar_3d_champion", category: "avatar", tier: "ultra", emoji: "🏆", nameKey: "rewards.avatar_3d_champion", cost: ULTRA, minLevel: MAX_LEVEL, requiresMastery: true, threeD: true },

  // ==========================================================================
  // Stickers - pure collectibles, the same tiers and gates as the characters.
  // ==========================================================================
  { id: "sticker_star", category: "sticker", tier: "common", emoji: "⭐", nameKey: "rewards.sticker_star", cost: COMMON, minLevel: 0 },
  { id: "sticker_rainbow", category: "sticker", tier: "common", emoji: "🌈", nameKey: "rewards.sticker_rainbow", cost: COMMON, minLevel: 0 },
  { id: "sticker_balloon", category: "sticker", tier: "common", emoji: "🎈", nameKey: "rewards.sticker_balloon", cost: COMMON, minLevel: 0 },
  { id: "sticker_heart", category: "sticker", tier: "common", emoji: "❤️", nameKey: "rewards.sticker_heart", cost: COMMON, minLevel: 0 },
  { id: "sticker_sun", category: "sticker", tier: "common", emoji: "☀️", nameKey: "rewards.sticker_sun", cost: COMMON, minLevel: 0 },
  { id: "sticker_cloud", category: "sticker", tier: "common", emoji: "☁️", nameKey: "rewards.sticker_cloud", cost: COMMON, minLevel: 0 },

  { id: "sticker_clover", category: "sticker", tier: "uncommon", emoji: "🍀", nameKey: "rewards.sticker_clover", cost: UNCOMMON, minLevel: 0 },
  { id: "sticker_sparkle", category: "sticker", tier: "uncommon", emoji: "🌟", nameKey: "rewards.sticker_sparkle", cost: UNCOMMON, minLevel: 0 },
  { id: "sticker_fireworks", category: "sticker", tier: "uncommon", emoji: "🎆", nameKey: "rewards.sticker_fireworks", cost: UNCOMMON, minLevel: 0 },
  { id: "sticker_comet", category: "sticker", tier: "uncommon", emoji: "☄️", nameKey: "rewards.sticker_comet", cost: UNCOMMON, minLevel: 0 },
  { id: "sticker_potion", category: "sticker", tier: "uncommon", emoji: "🧪", nameKey: "rewards.sticker_potion", cost: UNCOMMON, minLevel: 0 },
  { id: "sticker_key", category: "sticker", tier: "uncommon", emoji: "🗝️", nameKey: "rewards.sticker_key", cost: UNCOMMON, minLevel: 0 },

  { id: "sticker_trophy", category: "sticker", tier: "rare", emoji: "🏆", nameKey: "rewards.sticker_trophy", cost: RARE, minLevel: 2 },
  { id: "sticker_gem", category: "sticker", tier: "rare", emoji: "💎", nameKey: "rewards.sticker_gem", cost: RARE, minLevel: 2 },
  { id: "sticker_compass", category: "sticker", tier: "rare", emoji: "🧭", nameKey: "rewards.sticker_compass", cost: RARE, minLevel: 2 },
  { id: "sticker_shield", category: "sticker", tier: "rare", emoji: "🛡️", nameKey: "rewards.sticker_shield", cost: RARE, minLevel: 2 },

  { id: "sticker_medal", category: "sticker", tier: "epic", emoji: "🥇", nameKey: "rewards.sticker_medal", cost: EPIC, minLevel: 3 },
  { id: "sticker_flame_badge", category: "sticker", tier: "epic", emoji: "🔥", nameKey: "rewards.sticker_flame_badge", cost: EPIC, minLevel: 3 },
  { id: "sticker_diamond_badge", category: "sticker", tier: "epic", emoji: "💠", nameKey: "rewards.sticker_diamond_badge", cost: EPIC, minLevel: 3 },

  { id: "sticker_crown", category: "sticker", tier: "legendary", emoji: "👑", nameKey: "rewards.sticker_crown", cost: LEGENDARY, minLevel: 4 },
  { id: "sticker_galaxy", category: "sticker", tier: "legendary", emoji: "🌌", nameKey: "rewards.sticker_galaxy", cost: LEGENDARY, minLevel: 4 },

  { id: "sticker_katana_emblem", category: "sticker", tier: "mythic", emoji: "🗡️✨", nameKey: "rewards.sticker_katana_emblem", cost: MYTHIC, minLevel: MAX_LEVEL },
  { id: "sticker_golden_scale", category: "sticker", tier: "mythic", emoji: "🐲✨", nameKey: "rewards.sticker_golden_scale", cost: MYTHIC, minLevel: MAX_LEVEL },
];

export const REWARD_MAP = Object.fromEntries(REWARD_DEFS.map((r) => [r.id, r]));

export function isUnlocked(id) {
  const def = REWARD_MAP[id];
  return !!def && (def.cost === 0 || state.unlockedRewards.has(id));
}

export function canAfford(id) {
  const def = REWARD_MAP[id];
  return !!def && state.coins >= def.cost;
}

/** Has the child reached the level this item asks for? */
export function meetsLevelRequirement(id) {
  const def = REWARD_MAP[id];
  return !!def && highestLevelReached() >= (def.minLevel || 0);
}

/** The ultra item also needs every game at its own true max level. */
export function meetsMasteryRequirement(id) {
  return !REWARD_MAP[id]?.requiresMastery || allGamesAtTrueMax();
}

/** ... and every other reward in the shop already unlocked. */
export function meetsCollectionRequirement(id) {
  if (!REWARD_MAP[id]?.requiresMastery) return true;
  return REWARD_DEFS.every((d) => d.id === id || isUnlocked(d.id));
}

/** Everything that has to be true before a child can spend coins on this. */
export function canUnlock(id) {
  return (
    !!REWARD_MAP[id] &&
    !isUnlocked(id) &&
    meetsLevelRequirement(id) &&
    meetsMasteryRequirement(id) &&
    meetsCollectionRequirement(id) &&
    canAfford(id)
  );
}

/**
 * Why a locked item can't be bought yet, in priority order - the reasons no
 * amount of saved coins fixes come first, so the shop shows the real
 * blocker instead of "too expensive" on something that was never for sale
 * yet anyway.
 * @returns {"mastery"|"level"|"coins"|null} null means already unlocked.
 */
export function lockReason(id) {
  if (isUnlocked(id)) return null;
  if (!meetsMasteryRequirement(id) || !meetsCollectionRequirement(id)) return "mastery";
  if (!meetsLevelRequirement(id)) return "level";
  return "coins";
}

/**
 * Spend coins to unlock a reward. An avatar is equipped immediately - the
 * whole point of spending on a character is seeing it show up right away.
 * @returns {boolean} whether the unlock actually happened.
 */
export function unlockReward(id) {
  if (!canUnlock(id)) return false;
  const def = REWARD_MAP[id];
  if (!spendCoins(def.cost)) return false;
  state.unlockedRewards.add(id);
  if (def.category === "avatar") state.equippedAvatar = id;
  saveCurrentProfile();
  emitChange();
  return true;
}

/** Switch to a previously unlocked avatar. */
export function equipAvatar(id) {
  const def = REWARD_MAP[id];
  if (!def || def.category !== "avatar" || !isUnlocked(id)) return false;
  state.equippedAvatar = id;
  saveCurrentProfile();
  emitChange();
  return true;
}

/** The avatar id currently in effect - always a real, unlocked entry. */
export function equippedAvatarId() {
  return isUnlocked(state.equippedAvatar) ? state.equippedAvatar : DEFAULT_AVATAR_ID;
}

/** The emoji shown next to the player's name (sidebar, etc). */
export function equippedAvatarEmoji() {
  return REWARD_MAP[equippedAvatarId()]?.emoji ?? "🧑";
}
