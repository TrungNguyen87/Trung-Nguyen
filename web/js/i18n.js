/**
 * Translation layer, ported 1:1 from utils/i18n.py.
 *
 * The strings themselves live in the generated i18n-data.js, which is built
 * from utils/i18n.py by tools/gen_i18n.py - so the Dutch and English copy
 * cannot drift between the two front-ends while both exist.
 *
 * Two lookups, deliberately:
 *   t(key, vars)   -> plain text, for textContent / attributes.
 *   tMd(key, vars) -> the same string run through the mini markdown renderer
 *                     in markdown.js, for innerHTML.
 * tMd escapes every interpolated value before substituting it, so a player
 * name typed as "<img onerror=...>" is text, never markup.
 */
import { TRANSLATIONS } from "./i18n-data.js";
import { markdown, escapeHtml } from "./markdown.js";

export const DEFAULT_LANGUAGE = "nl";
export const LANGUAGES = { nl: "🇳🇱 Nederlands", en: "🇬🇧 English" };

const STORAGE_KEY = "kmg.language";
const listeners = new Set();

let current = DEFAULT_LANGUAGE;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LANGUAGES[saved]) current = saved;
} catch {
  // Private mode / storage blocked: fall back to the default language.
}

export function getLanguage() {
  return current;
}

export function setLanguage(lang) {
  if (!LANGUAGES[lang] || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* not fatal - the choice just won't survive a reload */
  }
  // Guarded so the module can be imported and exercised outside a browser
  // (tests/web/test_logic.mjs runs the generators under plain Node).
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}

/** Subscribe to language changes; returns an unsubscribe function. */
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/** Raw translated text with {placeholders} filled in. */
export function t(key, vars) {
  const table = TRANSLATIONS[current] || {};
  // Fall back to Dutch, then to the key itself, so a missing translation
  // shows up as a visible key instead of breaking the page.
  const text = table[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key;
  return interpolate(text, vars);
}

/** Translated text rendered as markdown, with values escaped first. */
export function tMd(key, vars) {
  let safeVars;
  if (vars) {
    safeVars = {};
    for (const [k, v] of Object.entries(vars)) safeVars[k] = escapeHtml(String(v));
  }
  const table = TRANSLATIONS[current] || {};
  const text = table[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key;
  return markdown(interpolate(text, safeVars), { escape: false });
}

/** True when `key` exists in the current language (used by the tests). */
export function hasKey(key) {
  return Object.prototype.hasOwnProperty.call(TRANSLATIONS[current] || {}, key);
}

export { TRANSLATIONS };
