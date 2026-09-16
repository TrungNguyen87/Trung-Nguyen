/**
 * The two dashboard charts, as inline SVG.
 *
 * The Streamlit dashboard used st.bar_chart, which meant pandas and Altair in
 * the payload. These are hand-drawn SVG instead: no dependency, no build, and
 * they look the same offline.
 *
 * Both charts plot a single measure, so both use one hue rather than a
 * categorical palette - more-is-darker is not needed when there is nothing to
 * tell apart, and a rainbow of game colours would imply a distinction that is
 * not in the data. The two hues below were checked against the light and dark
 * chart surfaces (contrast >= 3:1, inside the mode's lightness band) rather
 * than picked by eye.
 *
 * Mark specs: bars capped at 24px with the band's leftover left as air, a 4px
 * rounded data-end with the baseline end square, a 2px surface gap between
 * touching columns, and hairline recessive gridlines.
 */
import { el } from "./dom.js";

const BAR_LIGHT = "#1976d2";
const BAR_DARK = "#3f8fdd";
const MAX_BAR = 24;
const GAP = 2;

const isDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const barColor = () => (isDark() ? BAR_DARK : BAR_LIGHT);
const gridColor = () => (isDark() ? "#4a3a34" : "#ece0d6");
const inkSoft = () => (isDark() ? "#c9b4a9" : "#6d5347");
const ink = () => (isDark() ? "#f8ece5" : "#3e2723");

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A bar whose data-end is rounded and whose baseline end is square.
 * Drawn as a path rather than a <rect rx> so only two corners are rounded.
 */
function barPath(x, y, w, h, r, direction) {
  const radius = Math.max(0, Math.min(r, direction === "right" ? w : h, direction === "right" ? h / 2 : w / 2));
  if (direction === "right") {
    // Grows left -> right; round the right-hand corners.
    return `M ${x},${y} H ${x + w - radius} A ${radius},${radius} 0 0 1 ${x + w},${y + radius} V ${y + h - radius} A ${radius},${radius} 0 0 1 ${x + w - radius},${y + h} H ${x} Z`;
  }
  // Grows bottom -> top; round the top corners.
  return `M ${x},${y + h} V ${y + radius} A ${radius},${radius} 0 0 1 ${x + radius},${y} H ${x + w - radius} A ${radius},${radius} 0 0 1 ${x + w},${y + radius} V ${y + h} Z`;
}

/** Attach a shared hover tooltip to every [data-tip] mark inside `host`. */
function attachTooltip(host) {
  const tip = el("div.kmg-charttip", { hidden: true });
  host.append(tip);

  const show = (event) => {
    const target = event.target.closest("[data-tip]");
    if (!target) return;
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const hostRect = host.getBoundingClientRect();
    const markRect = target.getBoundingClientRect();
    const left = markRect.left - hostRect.left + markRect.width / 2;
    tip.style.left = `${Math.max(4, Math.min(left, hostRect.width - 4))}px`;
    tip.style.top = `${markRect.top - hostRect.top - 8}px`;
  };
  const hide = () => {
    tip.hidden = true;
  };

  host.addEventListener("pointermove", show);
  host.addEventListener("pointerleave", hide);
  // Keyboard users get the same information: the marks are focusable.
  host.addEventListener("focusin", show);
  host.addEventListener("focusout", hide);
  return tip;
}

/**
 * Horizontal bars - the right form for comparing magnitude across categories
 * with long names, which is what a list of game titles is.
 *
 * @param {Array<{label: string, value: number, tip?: string}>} rows
 * @param {{max?: number, unit?: string, ticks?: number[]}} [options]
 */
export function barChartH(rows, options = {}) {
  const { max = 100, unit = "%", ticks = [0, 25, 50, 75, 100] } = options;
  const labelW = 132;
  const valueW = 46;
  const rowH = 30;
  const width = 560;
  const height = rows.length * rowH + 26;
  const plotW = width - labelW - valueW;

  const parts = [];

  // Gridlines first, so the data sits on top of them.
  for (const tick of ticks) {
    const x = labelW + (plotW * tick) / max;
    parts.push(
      `<line x1="${x}" y1="4" x2="${x}" y2="${rows.length * rowH + 4}" stroke="${gridColor()}" stroke-width="1"/>`,
      `<text x="${x}" y="${rows.length * rowH + 20}" text-anchor="middle" font-size="11" fill="${inkSoft()}">${tick}${unit}</text>`,
    );
  }

  rows.forEach((row, i) => {
    const barH = Math.min(MAX_BAR, rowH - 8);
    const y = i * rowH + 4 + (rowH - barH) / 2;
    const w = Math.max(2, (plotW * Math.min(row.value, max)) / max);
    const tip = escapeXml(row.tip ?? `${row.label}: ${Math.round(row.value)}${unit}`);

    parts.push(
      `<text x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="12" fill="${ink()}">${escapeXml(row.label)}</text>`,
      `<path d="${barPath(labelW, y, w, barH, 4, "right")}" fill="${barColor()}" data-tip="${tip}" tabindex="0" role="img" aria-label="${tip}"/>`,
      // Value at the tip, in a text token rather than the bar's colour.
      `<text x="${labelW + w + 8}" y="${y + barH / 2 + 4}" font-size="12" font-weight="bold" fill="${ink()}">${Math.round(row.value)}${unit}</text>`,
    );
  });

  const host = el("div.kmg-chart", {
    html: `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="group">${parts.join("")}</svg>`,
  });
  attachTooltip(host);
  return host;
}

/**
 * Columns over time. Only the tallest column is labelled directly - a number
 * on every column is chaos and goes unread; the axis ticks and the hover
 * tooltip carry the rest.
 *
 * @param {Array<{label: string, value: number, tip?: string}>} rows
 */
export function columnChart(rows) {
  const width = 560;
  const height = 210;
  const padLeft = 34;
  const padBottom = 30;
  const padTop = 16;
  const plotW = width - padLeft - 8;
  const plotH = height - padBottom - padTop;

  const rawMax = Math.max(1, ...rows.map((r) => r.value));
  // Round the axis up to a clean number so the ticks read 0 / 5 / 10 rather
  // than 0 / 3.5 / 7.
  const step = Math.max(1, Math.ceil(rawMax / 4));
  const niceStep = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => s >= step) ?? step;
  const max = niceStep * 4;

  const parts = [];
  for (let i = 0; i <= 4; i++) {
    const value = niceStep * i;
    const y = padTop + plotH - (plotH * value) / max;
    parts.push(
      `<line x1="${padLeft}" y1="${y}" x2="${width - 8}" y2="${y}" stroke="${gridColor()}" stroke-width="1"/>`,
      `<text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="${inkSoft()}">${value}</text>`,
    );
  }

  const band = plotW / rows.length;
  // The 2px surface gap is what separates touching columns - no stroke.
  const barW = Math.max(3, Math.min(MAX_BAR, band - GAP));
  const tallest = rows.reduce((best, row, i) => (row.value > rows[best].value ? i : best), 0);

  rows.forEach((row, i) => {
    const h = Math.max(2, (plotH * row.value) / max);
    const x = padLeft + i * band + (band - barW) / 2;
    const y = padTop + plotH - h;
    const tip = escapeXml(row.tip ?? `${row.label}: ${row.value}`);

    parts.push(
      `<path d="${barPath(x, y, barW, h, 4, "up")}" fill="${barColor()}" data-tip="${tip}" tabindex="0" role="img" aria-label="${tip}"/>`,
    );
    if (i === tallest) {
      parts.push(
        `<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="12" font-weight="bold" fill="${ink()}">${row.value}</text>`,
      );
    }
    // Label at most eight days along the axis, or they collide and none of
    // them are readable.
    const every = Math.max(1, Math.ceil(rows.length / 8));
    if (i % every === 0 || i === rows.length - 1) {
      parts.push(
        `<text x="${x + barW / 2}" y="${height - 10}" text-anchor="middle" font-size="10" fill="${inkSoft()}">${escapeXml(row.label)}</text>`,
      );
    }
  });

  const host = el("div.kmg-chart", {
    html: `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="group">${parts.join("")}</svg>`,
  });
  attachTooltip(host);
  return host;
}

/**
 * The same numbers as a table, collapsed by default.
 * Every chart ships one: it is the fallback when colour or hover is not
 * available, and it is how a parent copies a figure out.
 */
export function chartTable(rows, { labelHead, valueHead, format = (v) => String(v) }) {
  const table = el("table.kmg-table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [el("th", { text: labelHead }), el("th", { text: valueHead })]),
    ]),
    el(
      "tbody",
      {},
      rows.map((row) =>
        el("tr", {}, [el("td", { text: row.label }), el("td", { text: format(row.value) })]),
      ),
    ),
  );
  return table;
}
