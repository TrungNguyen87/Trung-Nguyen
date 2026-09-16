/**
 * Beloningswinkel / Reward Shop - what a child's coins are actually for.
 *
 * Two collections, "characters" (equip one to show next to your name in the
 * sidebar) and "stickers" (pure collectibles), both unlocked with the coins
 * every correct answer already pays out (see addScore() in state.js - which
 * also caps how many coins can be *earned* per day, shown here as a small
 * progress strip under the balance). The whole page doubles as the
 * "collection to show a parent": the intro line says so, and every locked
 * card stays visible - dimmed, with either its price or the real reason it
 * is still locked - rather than being hidden, so the *size* of the
 * collection is always in view, not just what's already been unlocked.
 */
import { t, tMd } from "../i18n.js";
import { el, raw, clear } from "../dom.js";
import { DAILY_COIN_CAP, remainingDailyCoins, state } from "../state.js";
import {
  REWARD_DEFS,
  canAfford,
  equipAvatar,
  equippedAvatarId,
  isUnlocked,
  lockReason,
  unlockReward,
} from "../rewards.js";
import { pageHeader } from "../ui.js";
import { getGameIllustration } from "../illustrations.js";
import { bigCelebration, confetti, toast } from "../fx.js";
import * as sound from "../sound.js";

const CATEGORIES = [
  { key: "avatar", headingKey: "rewards.characters_heading" },
  { key: "sticker", headingKey: "rewards.stickers_heading" },
];

export function render(container) {
  const root = el("section.kmg-rewards");
  const balance = el("div.kmg-reward-balance");
  const dailyCap = el("div.kmg-reward-daily");
  const sections = new Map(CATEGORIES.map(({ key }) => [key, el("div")]));

  function paintBalance() {
    clear(balance);
    balance.append(
      el("span.kmg-reward-balance-icon", { text: "🪙" }),
      el("div", {}, [
        el("div.kmg-reward-balance-value", { text: String(state.coins) }),
        el("div.kmg-reward-balance-label", { text: t("rewards.balance_label") }),
      ]),
    );
  }

  function paintDailyCap() {
    clear(dailyCap);
    const remaining = remainingDailyCoins();
    const earned = DAILY_COIN_CAP - remaining;
    const pct = Math.max(0, Math.min(100, Math.round((earned / DAILY_COIN_CAP) * 100)));
    dailyCap.append(
      el("div.kmg-reward-daily-row", {}, [
        el("span.kmg-reward-daily-label", { text: t("rewards.daily_cap_heading") }),
        el("span.kmg-reward-daily-value", {
          text: t("rewards.daily_cap_status", { earned, cap: DAILY_COIN_CAP }),
        }),
      ]),
      el("div.kmg-reward-bar", {}, [el("span.kmg-reward-bar-fill", { style: { width: `${pct}%` } })]),
      el("p.kmg-caption", {
        text: remaining === 0 ? t("rewards.daily_cap_full") : t("rewards.daily_cap_note", { cap: DAILY_COIN_CAP }),
      }),
    );
  }

  function refreshAll() {
    paintBalance();
    paintDailyCap();
    for (const { key, headingKey } of CATEGORIES) {
      const host = sections.get(key);
      clear(host);
      host.append(section(key, headingKey));
    }
  }

  function section(category, headingKey) {
    const defs = REWARD_DEFS.filter((d) => d.category === category);
    const unlockedCount = defs.filter((d) => isUnlocked(d.id)).length;
    return el("div", {}, [
      el("div.kmg-reward-section-head", {}, [
        el("h2", { text: t(headingKey) }),
        el("span.kmg-reward-progress-count", {
          text: t("rewards.progress_summary", { unlocked: unlockedCount, total: defs.length }),
        }),
      ]),
      el(
        "div.kmg-reward-grid",
        {},
        defs.map((def) => rewardCard(def)),
      ),
    ]);
  }

  /** The one ultra item gets a rotating 3D cube instead of a flat emoji. */
  function cubeFigure(def) {
    return el("div.kmg-reward-cube", {}, [
      el("div.kmg-reward-cube-inner", {}, [
        el("div.kmg-cube-face.kmg-cube-front", { text: def.emoji }),
        el("div.kmg-cube-face.kmg-cube-back", { text: def.emoji }),
        el("div.kmg-cube-face.kmg-cube-right"),
        el("div.kmg-cube-face.kmg-cube-left"),
        el("div.kmg-cube-face.kmg-cube-top"),
        el("div.kmg-cube-face.kmg-cube-bottom"),
      ]),
    ]);
  }

  function rewardCard(def) {
    const unlocked = isUnlocked(def.id);
    const equipped = def.category === "avatar" && equippedAvatarId() === def.id;
    const reason = unlocked ? null : lockReason(def.id);
    const card = el(
      `div.kmg-reward-card${unlocked ? ".is-unlocked" : ".is-locked"}${equipped ? ".is-equipped" : ""}${def.threeD ? ".is-3d" : ""}`,
    );

    card.append(el(`span.kmg-reward-tier.kmg-tier-${def.tier}`, { text: t(`rewards.tier_${def.tier}`) }));

    if (def.threeD) {
      card.append(cubeFigure(def), el("span.kmg-reward-name", { text: t(def.nameKey) }));
      if (unlocked) card.append(el("p.kmg-reward-3d-caption", { text: t("rewards.ultra_caption") }));
    } else {
      card.append(
        el("span.kmg-reward-emoji", { text: def.emoji }),
        el("span.kmg-reward-name", { text: t(def.nameKey) }),
      );
    }

    if (unlocked && def.category === "avatar") {
      card.append(
        equipped
          ? el("span.kmg-reward-tag", { text: t("rewards.equipped_label") })
          : el("button.kmg-btn.kmg-btn-ghost.kmg-reward-btn", {
              type: "button",
              text: t("rewards.equip_button"),
              onClick: () => {
                equipAvatar(def.id);
                sound.playTap();
                refreshAll();
              },
            }),
      );
    } else if (unlocked) {
      card.append(el("span.kmg-reward-tag", { text: t("rewards.unlocked_label") }));
    } else if (reason === "mastery") {
      card.append(el("p.kmg-reward-lockmsg", { text: `🔒 ${t("rewards.lock_reason_mastery")}` }));
    } else if (reason === "level") {
      card.append(
        el("p.kmg-reward-lockmsg", { text: `🔒 ${t("rewards.lock_reason_level", { level: def.minLevel })}` }),
      );
    } else {
      const affordable = canAfford(def.id);
      const pct = Math.max(0, Math.min(100, Math.round((state.coins / def.cost) * 100)));
      card.append(
        el("div.kmg-reward-bar", {}, [el("span.kmg-reward-bar-fill", { style: { width: `${pct}%` } })]),
        el("span.kmg-reward-cost", {
          text: affordable ? `${def.cost} 🪙` : t("rewards.locked_need", { amount: def.cost - state.coins }),
        }),
        el("button.kmg-btn.kmg-btn-primary.kmg-reward-btn", {
          type: "button",
          disabled: !affordable,
          text: t("rewards.unlock_button", { cost: def.cost }),
          onClick: (event) => {
            if (!unlockReward(def.id)) return;
            sound.playBadge();
            const rect = event.currentTarget.getBoundingClientRect();
            const isUltra = def.tier === "ultra";
            confetti({ x: rect.left + rect.width / 2, y: rect.top, count: isUltra ? 140 : 45 });
            if (isUltra) bigCelebration();
            toast(t("rewards.unlocked_toast", { name: t(def.nameKey) }), def.emoji, 4000);
            refreshAll();
          },
        }),
      );
    }
    return card;
  }

  root.append(
    pageHeader("rewards.title", {
      subtitleKey: "rewards.subtitle",
      emoji: "🎁",
      illustration: getGameIllustration("rewards"),
    }),
    raw("div.kmg-intro", tMd("rewards.intro")),
    balance,
    dailyCap,
    ...sections.values(),
  );

  refreshAll();
  container.append(root);
}
