/**
 * Ouder Dashboard - what a parent sees.
 * Ported from pages/06_Ouder_Dashboard.py, minus pandas.
 *
 * The aggregation the Streamlit page did with groupby is a handful of loops
 * here. Worth being explicit about what changed underneath: the history used
 * to be a CSV on the server that reset on every redeploy. It is now
 * localStorage on the child's own device, so it survives deploys and never
 * leaves the machine - at the cost of being per-device, which is why the CSV
 * export sits prominently on this page rather than at the bottom.
 */
import { t, tMd } from "../i18n.js";
import { el, raw, clear } from "../dom.js";
import { MIN_RETENTION_DAYS, allAttempts, clearHistory, downloadCsv, toCsv, sessionAttempts } from "../log.js";
import { clearAllProfiles, state } from "../state.js";
import { expander, pageHeader, statRow } from "../ui.js";
import { getGameIllustration } from "../illustrations.js";
import { barChartH, chartTable, columnChart } from "../charts.js";

/** Minutes between the first and last attempt of each session, summed. */
function totalMinutes(rows) {
  const bySession = new Map();
  for (const row of rows) {
    const time = Date.parse(row.timestamp);
    if (Number.isNaN(time)) continue;
    const span = bySession.get(row.session_id) ?? { min: time, max: time };
    span.min = Math.min(span.min, time);
    span.max = Math.max(span.max, time);
    bySession.set(row.session_id, span);
  }
  let total = 0;
  for (const { min, max } of bySession.values()) total += (max - min) / 60000;
  return total;
}

function accuracyByGame(rows) {
  const byGame = new Map();
  for (const row of rows) {
    const entry = byGame.get(row.game) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (row.result === "correct") entry.correct += 1;
    byGame.set(row.game, entry);
  }
  return [...byGame.entries()]
    .map(([game, { correct, total }]) => ({
      label: game,
      value: (100 * correct) / total,
      tip: `${game}: ${Math.round((100 * correct) / total)}% (${correct}/${total})`,
    }))
    // Sorted by accuracy so "what is hardest" is the top of the chart, not
    // something the reader has to scan for.
    .sort((a, b) => a.value - b.value);
}

function questionsPerDay(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const day = String(row.timestamp).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    // At most a month on screen; older days stay in the CSV.
    .slice(-31)
    .map(([day, count]) => ({
      label: day.slice(5).replace("-", "/"),
      value: count,
      tip: `${day}: ${count}`,
    }));
}

/**
 * One row per calendar day (newest first): sessions, questions, accuracy,
 * minutes played (summed per-session spans, same method as totalMinutes())
 * and coins/points earned. This is the "activity log" a parent actually
 * wants to skim - the raw per-question table below it is for when a day's
 * summary raises a question the detail can answer.
 */
function dailyActivity(rows) {
  const days = new Map();
  const sessionSpans = new Map(); // "day|session_id" -> {min, max}

  for (const row of rows) {
    const day = String(row.timestamp).slice(0, 10);
    const entry = days.get(day) ?? {
      day,
      sessions: new Set(),
      players: new Set(),
      questions: 0,
      correct: 0,
      points: 0,
    };
    entry.sessions.add(row.session_id);
    if (row.player) entry.players.add(row.player);
    entry.questions += 1;
    if (row.result === "correct") entry.correct += 1;
    entry.points += Number(row.points) || 0;
    days.set(day, entry);

    const time = Date.parse(row.timestamp);
    if (!Number.isNaN(time)) {
      const key = `${day}|${row.session_id}`;
      const span = sessionSpans.get(key) ?? { day, min: time, max: time };
      span.min = Math.min(span.min, time);
      span.max = Math.max(span.max, time);
      sessionSpans.set(key, span);
    }
  }

  const minutesByDay = new Map();
  for (const { day, min, max } of sessionSpans.values()) {
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + (max - min) / 60000);
  }

  return [...days.values()]
    .sort((a, b) => b.day.localeCompare(a.day))
    .map((entry) => ({
      date: entry.day,
      players: [...entry.players].sort((a, b) => a.localeCompare(b)).join(", "),
      sessions: entry.sessions.size,
      questions: entry.questions,
      accuracy: entry.questions ? (100 * entry.correct) / entry.questions : 0,
      minutes: minutesByDay.get(entry.day) ?? 0,
      points: entry.points,
    }));
}

function activityTable(rows, showPlayers) {
  const days = dailyActivity(rows);
  const columns = [
    ["date", t("dash.activity_col_date")],
    ...(showPlayers ? [["players", t("dash.activity_col_players")]] : []),
    ["sessions", t("dash.activity_col_sessions")],
    ["questions", t("dash.activity_col_questions")],
    ["accuracy", t("dash.activity_col_accuracy")],
    ["minutes", t("dash.activity_col_minutes")],
    ["points", t("dash.col_points")],
  ];

  const table = el("table.kmg-table.kmg-activity-table");
  table.append(
    el("thead", {}, [el("tr", {}, columns.map(([, label]) => el("th", { text: label })))]),
    el(
      "tbody",
      {},
      days.map((day) =>
        el(
          "tr",
          {},
          columns.map(([key]) => {
            const value =
              key === "accuracy" ? `${Math.round(day.accuracy)}%` : key === "minutes" ? day.minutes.toFixed(0) : day[key];
            return el("td", { text: String(value) });
          }),
        ),
      ),
    ),
  );
  return el("div.kmg-table-scroll", {}, [table]);
}

export function render(container) {
  const root = el("section.kmg-dash");
  const body = el("div");
  let selectedPlayer = null; // null = all

  const all = allAttempts();
  const players = [...new Set(all.map((r) => r.player).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  root.append(
    pageHeader("dash.title", {
      subtitleKey: "dash.subtitle",
      emoji: "📊",
      illustration: getGameIllustration("dashboard"),
    }),
    raw("div.kmg-intro", tMd("dash.intro")),
  );

  if (!all.length) {
    root.append(
      el("div.kmg-banner.kmg-banner-info", {}, [
        el("span.kmg-banner-icon", { text: "ℹ️" }),
        el("span.kmg-banner-body", { text: t("dash.no_data") }),
      ]),
    );
    container.append(root);
    return;
  }

  // --- filter -------------------------------------------------------------

  const select = el("select.kmg-select", {
    "aria-label": t("dash.filter_child"),
    onChange: (event) => {
      selectedPlayer = event.target.value || null;
      paint();
    },
  });
  select.append(el("option", { value: "", text: t("dash.filter_all") }));
  players.forEach((name) => select.append(el("option", { value: name, text: name })));

  root.append(
    el("div.kmg-filterrow", {}, [
      el("label.kmg-answer-label", { text: t("dash.filter_child") }),
      select,
    ]),
    body,
  );

  // --- body ---------------------------------------------------------------

  function paint() {
    const rows = selectedPlayer ? all.filter((r) => r.player === selectedPlayer) : all;
    const sessions = new Set(rows.map((r) => r.session_id)).size;
    const correct = rows.filter((r) => r.result === "correct").length;
    const accuracy = rows.length ? (100 * correct) / rows.length : 0;

    const gameRows = accuracyByGame(rows);
    const dayRows = questionsPerDay(rows);

    clear(body);
    body.append(
      statRow([
        { label: t("dash.metric_sessions"), value: sessions },
        { label: t("dash.metric_questions"), value: rows.length },
        { label: t("dash.metric_accuracy"), value: `${accuracy.toFixed(0)}%` },
        { label: t("dash.metric_time"), value: totalMinutes(rows).toFixed(0) },
      ]),

      el("h2", { text: t("dash.accuracy_chart_heading") }),
      barChartH(gameRows),
      expander(
        t("dash.show_numbers"),
        chartTable(gameRows, {
          labelHead: t("dash.col_game"),
          valueHead: t("dash.metric_accuracy"),
          format: (v) => `${Math.round(v)}%`,
        }),
      ),

      el("h2", { text: t("dash.progress_chart_heading") }),
      columnChart(dayRows),
      expander(
        t("dash.show_numbers"),
        chartTable(dayRows, {
          labelHead: t("dash.col_time"),
          valueHead: t("dash.metric_questions"),
        }),
      ),

      el("h2", { text: t("dash.activity_heading") }),
      el("p.kmg-caption", { text: t("dash.activity_caption", { days: MIN_RETENTION_DAYS }) }),
      activityTable(rows, players.length > 1),

      el("h2", { text: t("dash.table_heading") }),
      logTable(rows),
      downloads(rows),
      // Said plainly and next to the download button, because it is the one
      // thing about this page a parent has to know: nothing is on a server.
      el("p.kmg-caption", { text: t("dash.storage_note") }),
      dangerZone(),
    );
  }

  /** The most recent attempts. The full history is one click away as CSV. */
  function logTable(rows) {
    const recent = [...rows].reverse().slice(0, 200);
    const columns = [
      ["timestamp", t("dash.col_time")],
      ["player", t("dash.col_player")],
      ["game", t("dash.col_game")],
      ["level", t("dash.col_level")],
      ["question", t("dash.col_question")],
      ["student_answer", t("dash.col_answer")],
      ["correct_answer", t("dash.col_correct_answer")],
      ["result", t("dash.col_result")],
      ["points", t("dash.col_points")],
    ];

    const table = el("table.kmg-table.kmg-logtable");
    table.append(
      el("thead", {}, [el("tr", {}, columns.map(([, label]) => el("th", { text: label })))]),
      el(
        "tbody",
        {},
        recent.map((row) =>
          el(
            "tr",
            { class: row.result === "correct" ? "is-correct" : "is-wrong" },
            columns.map(([key]) =>
              el("td", { text: key === "timestamp" ? row[key].replace("T", " ") : String(row[key] ?? "") }),
            ),
          ),
        ),
      ),
    );

    return el("div", {}, [
      el("div.kmg-table-scroll", {}, [table]),
      rows.length > recent.length
        ? el("p.kmg-caption", { text: t("dash.table_truncated", { shown: recent.length, total: rows.length }) })
        : null,
    ]);
  }

  function downloads(rows) {
    const stamp = new Date().toISOString().slice(0, 10);
    const session = sessionAttempts();
    return el("div.kmg-actions", {}, [
      el("button.kmg-btn.kmg-btn-primary", {
        type: "button",
        text: t("dash.download_full"),
        onClick: () => downloadCsv(`reken_spelletjes_geschiedenis_${stamp}.csv`, toCsv(rows)),
      }),
      el("button.kmg-btn.kmg-btn-ghost", {
        type: "button",
        text: t("dash.download_session"),
        disabled: session.length === 0,
        onClick: () =>
          downloadCsv(`reken_spelletjes_sessie_${state.sessionId}.csv`, toCsv(session)),
      }),
    ]);
  }

  /**
   * Clearing is two deliberate steps and says exactly what disappears - on a
   * shared family tablet this button is one mis-tap away from a term's data,
   * and there is no server-side copy to restore from.
   */
  function dangerZone() {
    const zone = el("div.kmg-danger");
    const confirmRow = el("div", { hidden: true });

    const startButton = el("button.kmg-btn.kmg-btn-warn", {
      type: "button",
      text: t("dash.clear_history_button"),
      onClick: () => {
        confirmRow.hidden = false;
        startButton.hidden = true;
      },
    });

    confirmRow.append(
      el("div.kmg-banner.kmg-banner-bad", {}, [
        el("span.kmg-banner-icon", { text: "⚠️" }),
        el("span.kmg-banner-body", { text: t("dash.clear_history_confirm") }),
      ]),
      el("div.kmg-actions", {}, [
        el("button.kmg-btn.kmg-btn-warn", {
          type: "button",
          text: t("dash.clear_history_confirm_button"),
          onClick: () => {
            clearHistory();
            clearAllProfiles();
            window.location.reload();
          },
        }),
        el("button.kmg-btn.kmg-btn-ghost", {
          type: "button",
          text: t("common.cancel"),
          onClick: () => {
            confirmRow.hidden = true;
            startButton.hidden = false;
          },
        }),
      ]),
    );

    zone.append(el("hr"), startButton, confirmRow);
    return zone;
  }

  paint();
  container.append(root);
}
