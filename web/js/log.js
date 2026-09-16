/**
 * Attempt logging for the parent dashboard - the port of utils/gamelog.py.
 *
 * In the Streamlit app every answered question went to st.session_state.log
 * plus a CSV on the server's disk, with the caveat (documented there) that
 * the on-disk history vanished on redeploy.
 *
 * Here the history lives in the browser's localStorage instead, which means:
 *   - it survives redeploys, because deploying no longer touches it;
 *   - it survives a page refresh, for the same reason;
 *   - it never leaves the child's device;
 *   - it is per device and per browser, which is the honest tradeoff and the
 *     reason the dashboard keeps a prominent CSV export.
 * At least MIN_RETENTION_DAYS days of it are always kept (see trimToBudget
 * below), not just "usually" - that is the guarantee the parent dashboard's
 * activity log is built on.
 *
 * The row shape is byte-for-byte the one gamelog.py writes, so a CSV exported
 * from the Streamlit version and one exported from here open the same way.
 */
import { state } from "./state.js";
import { t } from "./i18n.js";

const LOG_KEY = "kmg.attempts";
// Roughly a school year of daily play at 60 questions a day. Old rows are
// dropped from the front rather than letting localStorage hit its quota and
// start throwing mid-lesson.
export const MAX_ROWS = 12000;
// However big MAX_ROWS is, a row from the last MIN_RETENTION_DAYS days is
// never dropped just for being over that budget - only rows older than the
// window are. That turns "roughly a school year, usually" into an actual
// guarantee a parent can rely on: at least this many days of results and
// activity survive no matter how much a child plays in any single day, and a
// refresh never loses any of it either, because it is all in localStorage.
export const MIN_RETENTION_DAYS = 14;

export const FIELDNAMES = [
  "timestamp",
  "session_id",
  "player",
  "game",
  "level",
  "question",
  "student_answer",
  "correct_answer",
  "result",
  "points",
];

let rows = load();

function load() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Trim `list` towards `budget` rows, but only by dropping rows older than
 * MIN_RETENTION_DAYS, oldest first. Rows inside the retention window are
 * never dropped this way, even if that means staying over budget - the
 * window is a guarantee, budget is just a soft target above it.
 */
// Exported for the retention test in tests/web/test_logic.mjs, which needs
// to inject rows with specific ages - logAttempt always stamps "now".
export function trimToBudget(list, budget) {
  if (list.length <= budget) return list;
  const cutoff = Date.now() - MIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  // Bad/missing timestamps count as "recent" - safer to keep a little too
  // much than to silently drop something a parent might still want to see.
  const firstRecentIndex = list.findIndex((row) => {
    const time = Date.parse(row.timestamp);
    return Number.isNaN(time) || time >= cutoff;
  });
  const recentStart = firstRecentIndex === -1 ? list.length : firstRecentIndex;
  const recentCount = list.length - recentStart;
  const oldRowsToKeep = Math.max(0, Math.min(recentStart, budget - recentCount));
  return list.slice(recentStart - oldRowsToKeep);
}

function persist() {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(rows));
  } catch {
    // Quota exceeded: drop towards three-quarters of the current size,
    // preferring rows older than the guaranteed retention window, and try
    // once more so play continues rather than the log silently breaking. If
    // even the retention window alone is too big for the quota, fall back to
    // an unconditional drop - storage really is that full, and continuing to
    // log something is still better than logging nothing.
    const trimmed = trimToBudget(rows, Math.floor(rows.length * 0.75));
    rows = trimmed.length < rows.length ? trimmed : rows.slice(Math.floor(rows.length / 4));
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(rows));
    } catch {
      /* give up on persistence; the in-memory log still works this session */
    }
  }
}

/** Record one answered question. */
export function logAttempt({
  gameKey,
  gameName,
  level,
  question,
  studentAnswer,
  correctAnswer,
  isCorrect,
  points,
}) {
  const entry = {
    timestamp: new Date().toISOString().slice(0, 19),
    session_id: state.sessionId,
    player: state.playerName || t("dash.player_unknown"),
    game: gameName,
    level,
    question,
    student_answer: studentAnswer == null ? "" : String(studentAnswer),
    correct_answer: String(correctAnswer),
    // "fout" (not "wrong") on purpose: it is what gamelog.py wrote, and a
    // parent may have CSV exports from both versions side by side.
    result: isCorrect ? "correct" : "fout",
    points: isCorrect ? points : 0,
    game_key: gameKey,
  };
  rows.push(entry);
  rows = trimToBudget(rows, MAX_ROWS);
  persist();
  return entry;
}

/** Every attempt ever recorded on this device, oldest first. */
export function allAttempts() {
  return rows;
}

/** Just this browser session's attempts. */
export function sessionAttempts() {
  return rows.filter((r) => r.session_id === state.sessionId);
}

export function clearHistory() {
  rows = [];
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* nothing to do - the in-memory log is already empty */
  }
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(entries) {
  const lines = [FIELDNAMES.join(",")];
  for (const entry of entries) {
    lines.push(FIELDNAMES.map((f) => csvCell(entry[f])).join(","));
  }
  return lines.join("\n");
}

/** Hand the browser a CSV file to save. */
export function downloadCsv(filename, csv) {
  // The BOM is what makes Excel open a UTF-8 CSV with the accented Dutch
  // question text intact instead of as mojibake.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
