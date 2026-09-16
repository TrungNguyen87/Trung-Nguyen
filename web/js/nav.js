/**
 * The one place the menu is defined.
 *
 * app.py built this list with st.Page(...) so the sidebar could be rebuilt
 * from t() on every rerun and follow the NL/EN toggle. Same idea here: labels
 * are keys, resolved at render time, so switching language relabels the menu
 * without a reload.
 *
 * The route paths match the url_path values app.py used, so a link a parent
 * bookmarked on the Streamlit version still lands on the right game here.
 *
 * `load` is a dynamic import: each game is fetched the first time it is
 * opened, so a child on school wifi downloads one game, not thirteen.
 */
export const NAV = [
  { path: "home", key: "nav.home", icon: "🎮", load: () => import("./pages/home.js") },

  // Arithmetic games, in the order a school year meets them.
  { path: "tafel", key: "nav.tafel", icon: "✖️", game: "tafel", load: () => import("./games/tafel.js") },
  { path: "breuken", key: "nav.breuken", icon: "🍕", game: "breuken", load: () => import("./games/breuken.js") },
  { path: "meten", key: "nav.meten", icon: "📏", game: "meten", load: () => import("./games/meten.js") },
  { path: "procenten", key: "nav.procenten", icon: "💯", game: "procenten", load: () => import("./games/procenten.js") },
  { path: "algebra", key: "nav.algebra", icon: "🕵️", game: "algebra", load: () => import("./games/algebra.js") },
  { path: "meetkunde", key: "nav.meetkunde", icon: "📐", game: "meetkunde", load: () => import("./games/meetkunde.js") },
  { path: "verhoudingen", key: "nav.verhoudingen", icon: "🚗", game: "verhoudingen", load: () => import("./games/verhoudingen.js") },
  { path: "getallen", key: "nav.getallen", icon: "🔢", game: "getallen", load: () => import("./games/getallen.js") },

  // Speed and logic games are grouped after the arithmetic ones, so the menu
  // reads as "practise, then play with what you practised".
  { path: "bliksemronde", key: "nav.bliksem", icon: "⚡", game: "bliksem", load: () => import("./games/bliksem.js") },
  { path: "getallenjacht", key: "nav.jacht", icon: "🎯", game: "jacht", load: () => import("./games/jacht.js") },
  { path: "logica", key: "nav.logica", icon: "🧠", game: "logica", load: () => import("./games/logica.js") },
  { path: "code", key: "nav.code", icon: "🔐", game: "code", load: () => import("./games/code.js") },

  { path: "competitie", key: "nav.competitie", icon: "🏆", load: () => import("./pages/competitie.js") },
  { path: "voortgang", key: "nav.voortgang", icon: "📈", load: () => import("./pages/voortgang.js") },
  { path: "rewards", key: "nav.rewards", icon: "🎁", load: () => import("./pages/rewards.js") },
  { path: "uitleg", key: "nav.uitleg", icon: "📖", load: () => import("./pages/uitleg.js") },
  // Kept last on purpose - the parent-facing page.
  { path: "dashboard", key: "nav.dashboard", icon: "📊", load: () => import("./pages/dashboard.js") },
];

export const DEFAULT_ROUTE = "home";

export function findRoute(path) {
  return NAV.find((entry) => entry.path === path) || null;
}

/** Only the entries that are actual games (used by the home page tiles). */
export const GAME_NAV = NAV.filter((entry) => entry.game);
