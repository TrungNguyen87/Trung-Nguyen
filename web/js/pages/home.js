/**
 * Home - who is playing, what there is to play, and how far they have got.
 * Ported from pages/00_Home.py.
 *
 * The Streamlit version listed the games as a markdown bullet list. Here they
 * are tappable tiles carrying each game's own level, which turns the home
 * page from a table of contents into the thing a child actually navigates
 * with - and makes "which ones have I not tried yet" answerable at a glance.
 */
import { t, tMd } from "../i18n.js";
import { el, raw, clear } from "../dom.js";
import { GAME_NAV } from "../nav.js";
import {
  GAME_KEYS,
  MAX_LEVEL,
  getMaxLevel,
  getLevel,
  setLevel,
  isLevelCompleted,
  getCompletedLevelsCount,
  totalCompletedLevelsCount,
  totalPossibleLevelsCount,
  nextUncompletedLevel,
  profileNames,
  setPlayerName,
  state,
} from "../state.js";
import { BADGE_DEFS, BADGE_EMOJI } from "../badges.js";
import { levelLabel } from "../ui-bits.js";
import { pageHeader } from "../ui.js";
import { getGameIllustration } from "../illustrations.js";
import { confetti } from "../fx.js";
import * as sound from "../sound.js";

export function render(container) {
  const root = el("section.kmg-home");
  const nameNotice = el("div.kmg-namenotice");
  const tiles = el("div.kmg-tiles");
  const badgeRow = el("div.kmg-badgerow");

  // --- who is playing -----------------------------------------------------

  const input = el("input.kmg-textinput", {
    type: "text",
    value: state.playerName,
    maxlength: "40",
    placeholder: t("dash.player_name_placeholder"),
    "aria-label": t("dash.player_name_label"),
    autocomplete: "off",
    // A datalist rather than a dropdown: a returning child picks their name
    // in one tap, a new one just types.
    list: "kmg-known-players",
  });

  const known = profileNames();
  const datalist = el(
    "datalist",
    { id: "kmg-known-players" },
    known.map((name) => el("option", { value: name })),
  );

  function commitName() {
    const existed = setPlayerName(input.value);
    paintNotice(existed);
    paintTiles();
    paintBadges();
  }

  input.addEventListener("change", commitName);
  input.addEventListener("blur", commitName);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });

  function paintNotice(justLoaded) {
    clear(nameNotice);
    if (!state.playerName) return;
    const message = justLoaded
      ? t("home.profile_loaded", { name: state.playerName, score: state.totalScore })
      : t("home.player_saved", { name: state.playerName });
    nameNotice.append(
      el("div.kmg-banner.kmg-banner-ok", {}, [
        el("span.kmg-banner-icon", { text: justLoaded ? "🔄" : "✅" }),
        el("span.kmg-banner-body", { text: message }),
      ]),
    );
  }

  // --- game tiles ---------------------------------------------------------

  function paintTiles() {
    clear(tiles);
    for (const entry of GAME_NAV) {
      const level = getLevel(entry.game);
      const max = getMaxLevel(entry.game);
      const tried = state.gamesTried.has(entry.game);
      const completedCount = getCompletedLevelsCount(entry.game);
      const nextLevel = nextUncompletedLevel(entry.game);
      const isDone = isLevelCompleted(entry.game, level);

      const tile = el("a.kmg-tile", {
        href: `#/${entry.path}`,
        onClick: () => {
          // If the player's current level is already completed, jump forward to the next uncompleted level
          if (isDone && nextLevel !== level) {
            setLevel(entry.game, nextLevel);
          }
          sound.playTap();
        },
      });
      tile.append(
        el("span.kmg-tile-icon", { text: entry.icon }),
        el("span.kmg-tile-body", {}, [
          el("span.kmg-tile-name", { text: t(`game.${entry.game}.name`) }),
          el("span.kmg-tile-meta", {
            text: `${t("common.level")} ${level}/${max} · ${completedCount}/${max + 1} ${t("progress.done").toLowerCase()} ✓`,
          }),
        ]),
        // A filled bar per game, so "how far am I in each" is one glance.
        el("span.kmg-tile-bar", {}, [
          el("span.kmg-tile-fill", { style: { width: `${(completedCount / (max + 1)) * 100}%` } }),
        ]),
        tried ? null : el("span.kmg-tile-new", { text: t("home.tile_new") }),
      );
      tiles.append(tile);
    }
  }

  // --- badges -------------------------------------------------------------

  function paintBadges() {
    clear(badgeRow);
    const earned = new Set(state.badges);
    if (!earned.size) {
      badgeRow.append(el("p.kmg-caption", { text: t("home.badges_none") }));
      return;
    }
    // Every badge is shown, the unearned ones greyed out, so a child can see
    // what there is left to win rather than only what they already have.
    for (const [id] of BADGE_DEFS) {
      const has = earned.has(id);
      badgeRow.append(
        el(`span.kmg-badge${has ? ".is-earned" : ""}`, { title: t(`badges.${id}.name`) }, [
          el("span.kmg-badge-emoji", { text: BADGE_EMOJI[id] }),
          el("span.kmg-badge-name", { text: t(`badges.${id}.name`) }),
        ]),
      );
    }
  }

  // --- assembly -----------------------------------------------------------

  const totalDone = totalCompletedLevelsCount();
  const totalPossible = totalPossibleLevelsCount();
  const overallPct = Math.round((100 * totalDone) / totalPossible);

  root.append(
    pageHeader("home.title", {
      subtitleKey: "home.subtitle",
      emoji: "🎮",
      illustration: getGameIllustration("home"),
    }),

    el("div.kmg-card.kmg-namecard", {}, [
      el("label.kmg-answer-label", { for: "", text: t("dash.player_name_label") }),
      input,
      datalist,
      nameNotice,
    ]),

    // Multiplayer Competition Feature Card
    el("div.kmg-card.kmg-comp-home-banner", {}, [
      el("div.kmg-comp-home-content", {}, [
        el("div.kmg-comp-home-icon", { text: "🏆" }),
        el("div.kmg-comp-home-text", {}, [
          el("h3.kmg-comp-home-title", { text: t("home.competitie_card_title") }),
          el("p.kmg-comp-home-desc", { text: t("home.competitie_card_desc") }),
        ]),
      ]),
      el("a.kmg-btn.kmg-btn-primary.kmg-comp-home-btn", {
        href: "#/competitie",
        text: t("home.competitie_card_btn"),
        onClick: () => sound.playTap(),
      }),
    ]),

    raw("div.kmg-intro", tMd("home.intro")),

    el("div.kmg-overall", {}, [
      el("div.kmg-overall-head", {}, [
        el("strong", { text: `${t("home.level_overview")} (${totalDone}/${totalPossible} behaald)` }),
        el("div.kmg-overall-actions", {}, [
          el("a.kmg-btn.kmg-btn-sm.kmg-btn-ghost", {
            href: "#/voortgang",
            text: t("home.level_progress_btn"),
            onClick: () => sound.playTap(),
          }),
          el("span.kmg-overall-pct", { text: `${overallPct}%` }),
        ]),
      ]),
      el("div.kmg-progress-bar", {}, [
        el("div.kmg-progress-fill", { style: { width: `${overallPct}%` } }),
      ]),
    ]),

    el("h2", { text: t("home.games_heading") }),
    tiles,

    el("h2", { text: t("home.badges_heading") }),
    badgeRow,

    el("h2", { text: t("home.about_heading") }),
    raw("div.kmg-intro", tMd("home.about_text")),

    // Extra links that were separate sidebar pages in the Streamlit app.
    el("div.kmg-homelinks", {}, [
      el("a.kmg-btn.kmg-btn-ghost", {
        href: "#/competitie",
        text: `🏆 ${t("nav.competitie")}`,
        onClick: () => sound.playTap(),
      }),
      el("a.kmg-btn.kmg-btn-ghost", {
        href: "#/voortgang",
        text: `📈 ${t("nav.voortgang")}`,
        onClick: () => sound.playTap(),
      }),
      el("a.kmg-btn.kmg-btn-ghost", {
        href: "#/rewards",
        text: `🎁 ${t("nav.rewards")} (${state.coins} 🪙)`,
        onClick: () => sound.playTap(),
      }),
      el("a.kmg-btn.kmg-btn-ghost", {
        href: "#/uitleg",
        text: `📖 ${t("nav.uitleg")}`,
        onClick: () => sound.playTap(),
      }),
      el("a.kmg-btn.kmg-btn-ghost", {
        href: "#/dashboard",
        text: `📊 ${t("nav.dashboard")}`,
        onClick: () => sound.playTap(),
      }),
    ]),
  );

  // First visit of a session with nothing played yet: a start button that
  // does something worth tapping.
  if (state.totalScore === 0 && state.questionsAnswered === 0) {
    root.append(
      el("div.kmg-startrow", {}, [
        el("button.kmg-btn.kmg-btn-primary.kmg-btn-big", {
          type: "button",
          text: t("home.start_button"),
          onClick: (event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            confetti({ x: rect.left + rect.width / 2, y: rect.top, count: 70 });
            sound.playFanfare();
            window.location.hash = "#/tafel";
          },
        }),
      ]),
    );
  }

  paintNotice(false);
  paintTiles();
  paintBadges();
  container.append(root);
}
