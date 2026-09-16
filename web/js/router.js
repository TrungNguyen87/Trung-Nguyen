/**
 * A hash router.
 *
 * Hash routing rather than the History API on purpose: GitHub Pages serves
 * static files, so /tafel would be a 404 on a hard refresh. With "#/tafel"
 * every URL in the app is a real, refreshable, bookmarkable, shareable link
 * on any static host - which is the whole reason this front-end can live
 * somewhere free.
 *
 * Each page module exports `render(container)` and may return a cleanup
 * function; the router calls it on the way out so a timed game's clock stops
 * when a child navigates away mid-round.
 */
import { DEFAULT_ROUTE, findRoute } from "./nav.js";
import { clear, nextFrame } from "./dom.js";
import { t } from "./i18n.js";

let container = null;
let cleanup = null;
let currentPath = null;
let renderSeq = 0;
const listeners = new Set();

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentRoute() {
  return currentPath;
}

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  return hash.split("?")[0] || DEFAULT_ROUTE;
}

export function navigate(path, { replace = false } = {}) {
  const target = `#/${path}`;
  if (window.location.hash === target) {
    render();
    return;
  }
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

async function render() {
  const seq = ++renderSeq;
  const path = parseHash();
  const route = findRoute(path);

  if (!route) {
    navigate(DEFAULT_ROUTE, { replace: true });
    return;
  }

  // Let the outgoing page stop its timers and listeners before its DOM goes.
  try {
    cleanup?.();
  } catch (error) {
    console.error("[router] cleanup failed", error);
  }
  cleanup = null;
  currentPath = path;

  document.title = `${t(route.key)} · ${t("app.title")}`;
  listeners.forEach((fn) => fn(path, route));

  let module;
  try {
    module = await route.load();
  } catch (error) {
    if (seq !== renderSeq) return;
    console.error("[router] failed to load", path, error);
    clear(container);
    container.innerHTML =
      `<div class="kmg-banner kmg-banner-bad"><span class="kmg-banner-icon">⚠️</span>` +
      `<span class="kmg-banner-body"><span class="kmg-banner-msg">${t("app.load_error")}</span></span></div>`;
    container.querySelector(".kmg-banner-body").append(
      Object.assign(document.createElement("button"), {
        className: "kmg-btn kmg-btn-primary",
        textContent: t("app.reload"),
        onclick: () => window.location.reload(),
      }),
    );
    return;
  }

  // Abort if a newer route navigation has started while this module was loading.
  if (seq !== renderSeq || currentPath !== path) return;

  // Clear immediately before rendering so concurrent loads never double-render
  clear(container);
  container.scrollTop = 0;
  window.scrollTo({ top: 0 });

  container.classList.remove("is-in");
  cleanup = module.render(container) || null;
  nextFrame(() => container.classList.add("is-in"));
}

export function startRouter(target) {
  container = target;
  window.addEventListener("hashchange", render);
  if (!window.location.hash) {
    navigate(DEFAULT_ROUTE, { replace: true });
  } else {
    render();
  }
}

/** Re-render the current page - used when the language changes. */
export function refresh() {
  render();
}
