/**
 * Levelvoortgang / Level Tracking Page.
 *
 * Lets players track their progress across every game and level at a glance.
 * Completed levels are permanently recorded - players never have to redo what
 * they have already accomplished. One tap on any unfinished level jumps directly
 * into that game at that level.
 */
import { el, raw, clear } from "../dom.js";
import { t, tMd } from "../i18n.js";
import { GAME_NAV } from "../nav.js";
import {
  GAME_KEYS,
  getLevel,
  setLevel,
  getMaxLevel,
  isLevelCompleted,
  getCompletedLevels,
  getCompletedLevelsCount,
  totalCompletedLevelsCount,
  totalPossibleLevelsCount,
  nextUncompletedLevel,
  state,
} from "../state.js";
import { levelLabel } from "../ui-bits.js";
import { pageHeader } from "../ui.js";
import { getGameIllustration } from "../illustrations.js";
import { navigate } from "../router.js";
import * as sound from "../sound.js";

export function render(container) {
  const root = el("section.kmg-voortgang");

  const totalDone = totalCompletedLevelsCount();
  const totalPossible = totalPossibleLevelsCount();
  const overallPct = Math.round((100 * totalDone) / totalPossible);

  const header = pageHeader("progress.title", {
    subtitleKey: "progress.subtitle",
    emoji: "📈",
    illustration: getGameIllustration("home"),
  });

  // Overall summary card
  const summaryCard = el("div.kmg-card.kmg-progress-summary", {}, [
    el("div.kmg-progress-summary-top", {}, [
      el("div.kmg-progress-summary-text", {}, [
        el("h2.kmg-progress-summary-heading", {
          text: t("progress.completed_levels_count", { done: totalDone, total: totalPossible }),
        }),
        el("p.kmg-progress-summary-sub", {
          text: t("progress.no_redo_notice"),
        }),
      ]),
      el("div.kmg-progress-summary-badge", {}, [
        el("span.kmg-progress-badge-val", { text: `${overallPct}%` }),
        el("span.kmg-progress-badge-lbl", { text: t("progress.done") }),
      ]),
    ]),
    el("div.kmg-progress-bar.kmg-progress-bar-lg", {}, [
      el("div.kmg-progress-fill", { style: { width: `${overallPct}%` } }),
    ]),
  ]);

  // Grid of all 12 games
  const gameGrid = el("div.kmg-progress-grid");

  for (const entry of GAME_NAV) {
    const gameKey = entry.game;
    const max = getMaxLevel(gameKey);
    const completedCount = getCompletedLevelsCount(gameKey);
    const totalGameLevels = max + 1;
    const gamePct = Math.round((100 * completedCount) / totalGameLevels);
    const nextLevel = nextUncompletedLevel(gameKey);
    const allCompleted = completedCount >= totalGameLevels;

    // Track pills for each level 0..max
    const levelTrack = el("div.kmg-progress-track");
    for (let lvl = 0; lvl <= max; lvl++) {
      const isDone = isLevelCompleted(gameKey, lvl);
      const isNext = !allCompleted && lvl === nextLevel;
      const pill = el("button.kmg-progress-pill", {
        type: "button",
        title: `${t("common.level")} ${lvl}: ${levelLabel(lvl)} ${isDone ? "✓" : ""}`,
        dataset: { level: String(lvl) },
        onClick: () => {
          setLevel(gameKey, lvl);
          sound.playTap();
          navigate(entry.path);
        },
      });
      if (isDone) pill.classList.add("is-done");
      if (isNext) pill.classList.add("is-next");

      pill.append(
        el("span.kmg-pill-num", { text: String(lvl) }),
        el("span.kmg-pill-icon", { text: isDone ? "✓" : isNext ? "▶" : "" }),
      );
      levelTrack.append(pill);
    }

    const actionBtn = el("button.kmg-btn", {
      type: "button",
      className: allCompleted ? "kmg-btn-ghost" : "kmg-btn-primary",
      text: allCompleted
        ? `⭐ ${t("progress.all_done")}`
        : `▶ ${t("progress.continue_btn", { level: nextLevel })}`,
      onClick: () => {
        setLevel(gameKey, nextLevel);
        sound.playTap();
        navigate(entry.path);
      },
    });

    const card = el("div.kmg-card.kmg-progress-gamecard", {}, [
      el("div.kmg-progress-game-head", {}, [
        el("span.kmg-progress-game-icon", { text: entry.icon }),
        el("div.kmg-progress-game-info", {}, [
          el("h3.kmg-progress-game-title", { text: t(`game.${gameKey}.name`) }),
          el("span.kmg-progress-game-meta", {
            text: `${completedCount}/${totalGameLevels} ${t("progress.done").toLowerCase()} (${gamePct}%)`,
          }),
        ]),
      ]),
      el("div.kmg-progress-track-wrapper", {}, [
        el("span.kmg-caption", { text: t("common.choose_level") }),
        levelTrack,
      ]),
      el("div.kmg-progress-game-foot", {}, [actionBtn]),
    ]);

    gameGrid.append(card);
  }

  // Quick navigation row at bottom
  const backRow = el("div.kmg-actions", {}, [
    el("a.kmg-btn.kmg-btn-ghost", {
      href: "#/home",
      text: `🏠 ${t("comp.home_btn")}`,
      onClick: () => sound.playTap(),
    }),
    el("a.kmg-btn.kmg-btn-primary", {
      href: "#/competitie",
      text: `🏆 ${t("nav.competitie")}`,
      onClick: () => sound.playTap(),
    }),
  ]);

  root.append(header, summaryCard, gameGrid, backRow);
  container.append(root);

  return () => {};
}
