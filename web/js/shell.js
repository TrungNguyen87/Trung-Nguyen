/**
 * The app chrome: the navigation drawer, the score panel and the top bar.
 *
 * The Streamlit sidebar was always-open on desktop and a cramped hamburger on
 * a phone. Here the same information becomes a proper responsive drawer:
 * pinned open on a laptop, swipe/tap-away on a tablet, and never covering the
 * question when it is closed.
 */
import { el, clear, append, $ } from "./dom.js";
import { LANGUAGES, getLanguage, onLanguageChange, setLanguage, t } from "./i18n.js";
import { NAV } from "./nav.js";
import {
  SESSION_GOAL_MINUTES,
  onStateChange,
  sessionAccuracy,
  sessionElapsedMinutes,
  setSoundEnabled,
  state,
} from "./state.js";
import { currentRoute, onRouteChange } from "./router.js";
import { equippedAvatarEmoji } from "./rewards.js";
import * as sound from "./sound.js";

let previousScore = null;

export function buildShell(root) {
  const drawer = el("nav.kmg-drawer", { id: "kmg-drawer", "aria-label": t("nav.home") });
  const scrim = el("div.kmg-scrim", { hidden: true, onClick: () => closeDrawer() });
  const topbar = el("header.kmg-topbar");
  const main = el("main.kmg-main", { id: "kmg-main" });

  // --- top bar (phones and tablets) ---------------------------------------
  const menuButton = el("button.kmg-iconbtn", {
    type: "button",
    "aria-label": t("app.menu"),
    "aria-controls": "kmg-drawer",
    html: "☰",
    onClick: () => toggleDrawer(),
  });
  const topTitle = el("div.kmg-topbar-title");
  const topScore = el("div.kmg-topbar-score");
  topbar.append(menuButton, topTitle, topScore);

  // --- drawer -------------------------------------------------------------
  const brand = el("a.kmg-brand", { href: "#/home" }, [
    el("span.kmg-brand-logo", { text: "🎮" }),
    el("span.kmg-brand-text", {}, [
      el("strong.kmg-brand-title", { text: t("app.title") }),
      el("span.kmg-brand-sub", { text: t("app.icon_caption") }),
    ]),
  ]);

  const playerRow = el("div.kmg-player");
  const scoreBox = el("div.kmg-scorebox");
  const progressBox = el("div.kmg-progress");
  const menu = el("ul.kmg-menu");
  const controls = el("div.kmg-drawer-controls");

  for (const entry of NAV) {
    const link = el("a.kmg-menu-link", { href: `#/${entry.path}`, dataset: { path: entry.path } }, [
      el("span.kmg-menu-icon", { text: entry.icon }),
      el("span.kmg-menu-label", { text: t(entry.key) }),
    ]);
    // On a phone the drawer covers the page, so a tap has to close it too.
    link.addEventListener("click", () => {
      sound.playTap();
      if (window.matchMedia("(max-width: 900px)").matches) closeDrawer();
    });
    menu.append(el("li", {}, [link]));
  }

  // Language toggle
  const langGroup = el("div.kmg-langswitch", { role: "group", "aria-label": t("sidebar.language") });
  for (const [code, label] of Object.entries(LANGUAGES)) {
    langGroup.append(
      el("button.kmg-langbtn", {
        type: "button",
        text: label,
        dataset: { lang: code },
        onClick: () => {
          sound.playTap();
          setLanguage(code);
        },
      }),
    );
  }

  // Sound toggle
  const soundToggle = el("label.kmg-switch", {}, [
    el("input", {
      type: "checkbox",
      checked: state.soundEnabled,
      onChange: (event) => {
        setSoundEnabled(event.target.checked);
        if (event.target.checked) sound.playTap();
      },
    }),
    el("span.kmg-switch-track", {}, [el("span.kmg-switch-thumb")]),
    el("span.kmg-switch-label", { text: t("sidebar.sound_toggle") }),
  ]);

  const parentLink = el("a.kmg-parentlink", { href: "#/dashboard" });

  controls.append(langGroup, soundToggle, parentLink);
  drawer.append(brand, playerRow, scoreBox, progressBox, menu, controls);

  root.append(scrim, drawer, el("div.kmg-content", {}, [topbar, main]));

  // --- painting -----------------------------------------------------------

  function paintPlayer() {
    clear(playerRow);
    if (state.playerName) {
      playerRow.append(
        el("span.kmg-player-avatar", { text: equippedAvatarEmoji() }),
        el("span.kmg-player-name", { text: state.playerName }),
      );
      playerRow.title = t("sidebar.playing_as", { name: state.playerName });
    } else {
      playerRow.append(el("a.kmg-player-empty", { href: "#/home", text: t("sidebar.no_player_name") }));
    }
  }

  function paintScore() {
    const gained = previousScore != null && state.totalScore > previousScore;
    const delta = gained ? state.totalScore - previousScore : 0;
    previousScore = state.totalScore;

    clear(scoreBox);
    append(
      scoreBox,
      el("div.kmg-scorebox-row", {}, [
        el("span.kmg-scorebox-icon", { text: "🌟" }),
        el("span.kmg-scorebox-label", { text: t("sidebar.score") }),
        el("strong.kmg-scorebox-value", { text: String(state.totalScore) }),
      ]),
      el("div.kmg-scorebox-row", {}, [
        el("span.kmg-scorebox-icon", { text: "🪙" }),
        el("span.kmg-scorebox-label", { text: t("sidebar.coins") }),
        el("strong.kmg-scorebox-value.kmg-scorebox-coins", { text: String(state.coins) }),
      ]),
      el("div.kmg-scorebox-row", {}, [
        el(`span.kmg-scorebox-icon${state.streaks >= 3 ? ".is-hot" : ""}`, { text: "🔥" }),
        el("span.kmg-scorebox-label", { text: t("sidebar.streak") }),
        el("strong.kmg-scorebox-value", { text: String(state.streaks) }),
      ]),
      gained ? el("div.kmg-scorebox-delta", { text: `+${delta}` }) : null,
    );

    // The box pops only on a run where the score actually went up - one that
    // bounced on every repaint would stop meaning anything.
    if (gained) {
      scoreBox.classList.remove("is-up");
      void scoreBox.offsetWidth;
      scoreBox.classList.add("is-up");
    }

    clear(topScore);
    topScore.append(
      el("span.kmg-topbar-score-star", { text: "🌟" }),
      el("strong", { text: String(state.totalScore) }),
    );
  }

  function paintProgress() {
    const elapsed = sessionElapsedMinutes();
    const fraction = Math.min(1, elapsed / SESSION_GOAL_MINUTES);
    clear(progressBox);
    progressBox.append(
      el("div.kmg-progress-head", { text: t("sidebar.session_heading") }),
      el("div.kmg-progress-bar", { role: "progressbar", "aria-valuenow": Math.round(fraction * 100) }, [
        el("div.kmg-progress-fill", { style: { width: `${fraction * 100}%` } }),
      ]),
      el("div.kmg-progress-caption", {
        text: `⏱️ ${t("sidebar.session_time")}: ${elapsed.toFixed(0)} / ${SESSION_GOAL_MINUTES} min`,
      }),
      el("div.kmg-progress-stats", {}, [
        el("span", { text: `📝 ${t("sidebar.questions")}: ${state.questionsAnswered}` }),
        el("span", { text: `🎯 ${t("sidebar.accuracy")}: ${sessionAccuracy().toFixed(0)}%` }),
      ]),
    );
  }

  function paintStatic() {
    $(".kmg-brand-title", drawer).textContent = t("app.title");
    $(".kmg-brand-sub", drawer).textContent = t("app.icon_caption");
    menuButton.setAttribute("aria-label", t("app.menu"));
    parentLink.textContent = t("sidebar.parent_link");
    $(".kmg-switch-label", drawer).textContent = t("sidebar.sound_toggle");
    langGroup.setAttribute("aria-label", t("sidebar.language"));
    [...langGroup.children].forEach((button) =>
      button.classList.toggle("is-active", button.dataset.lang === getLanguage()),
    );
    NAV.forEach((entry) => {
      const link = menu.querySelector(`[data-path="${entry.path}"] .kmg-menu-label`);
      if (link) link.textContent = t(entry.key);
    });
  }

  function paintActive(path) {
    const active = path ?? currentRoute();
    menu.querySelectorAll(".kmg-menu-link").forEach((link) => {
      const isActive = link.dataset.path === active;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const entry = NAV.find((e) => e.path === active);
    clear(topTitle);
    if (entry) {
      topTitle.append(
        el("span.kmg-topbar-icon", { text: entry.icon }),
        el("span", { text: t(entry.key) }),
      );
    }
  }

  function toggleDrawer(force) {
    const open = force ?? !document.body.classList.contains("drawer-open");
    document.body.classList.toggle("drawer-open", open);
    scrim.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
  }
  const closeDrawer = () => toggleDrawer(false);

  // Esc closes the drawer - it covers the page on a phone, so there has to be
  // a keyboard way out of it.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  onStateChange(() => {
    paintPlayer();
    paintScore();
    paintProgress();
  });
  onRouteChange((path) => paintActive(path));
  onLanguageChange(() => {
    paintStatic();
    paintPlayer();
    paintScore();
    paintProgress();
    paintActive();
  });

  // The session clock has to move on its own, or "playing time" would only
  // update when a question was answered.
  setInterval(paintProgress, 15000);

  paintStatic();
  paintPlayer();
  paintScore();
  paintProgress();
  paintActive();

  return { main, paintActive };
}
