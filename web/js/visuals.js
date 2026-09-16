/**
 * The SVG visualisation library - the port of utils/visuals.py.
 *
 * Every function returns a plain SVG string, so a kid gets an immediate
 * picture of the maths instead of just numbers on a screen. The visuals are
 * animated: pizza slices fill one by one, dot arrays pop in row by row, bars
 * grow from zero, clock hands sweep round, shapes draw their own outline.
 *
 * Two rules everything here follows, unchanged from the Python original:
 *
 *   - Class names are scoped with a per-render unique id. Inline SVG shares
 *     the page's global CSS scope, so two pizzas on one page with a shared
 *     ".slice" class would animate each other.
 *   - Every animation ends on the finished picture and is disabled wholesale
 *     under prefers-reduced-motion, so the visual is never *only* legible
 *     while it is moving.
 */
import { t } from "./i18n.js";

let uidCounter = 0;
const uid = () => `k${(uidCounter++).toString(16)}`;

const f1 = (n) => Number(n).toFixed(1);
const f2 = (n) => Number(n).toFixed(2);
const f0 = (n) => Math.round(Number(n)).toString();
/** Python's "%g": drop trailing zeros, keep it short. */
const g = (n) => {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(parseFloat(num.toPrecision(6)));
};

function animStyle(id, rules, reduced) {
  const fallback = reduced || `#${id} * { animation: none !important; }`;
  return `<style>${rules}@media (prefers-reduced-motion: reduce) { ${fallback} }</style>`;
}

// A warm, consistent, kid-friendly palette used across every visual.
export const FILL = "#ffb74d";
export const EMPTY = "#fff3e0";
export const STROKE = "#5d4037";
export const ACCENT = "#4caf50";
export const ACCENT2 = "#42a5f5";
export const DANGER = "#ef5350";

function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

/**
 * A pizza cut into `denominator` equal slices, `numerator` of them filled.
 * Good for fractions up to ~12 pieces; beyond that use fractionBarSvg.
 */
export function pizzaSvg(numerator, denominator, size = 180) {
  denominator = Math.max(1, Math.trunc(denominator));
  numerator = Math.max(0, Math.min(Math.trunc(numerator), denominator));
  const id = uid();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const parts = [];

  // Filled slices are laid down one after another, so a child literally
  // watches "3 of the 8 pieces" being counted out.
  for (const i of range(denominator)) {
    const a0 = -90 + i * (360 / denominator);
    const a1 = -90 + (i + 1) * (360 / denominator);
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    const largeArc = 360 / denominator > 180 ? 1 : 0;
    const filled = i < numerator;
    const color = filled ? FILL : EMPTY;
    const d = `M ${cx},${cy} L ${f2(x0)},${f2(y0)} A ${r},${r} 0 ${largeArc} 1 ${f2(x1)},${f2(y1)} Z`;
    const cls = filled ? `${id}-fill` : `${id}-empty`;
    const delay = filled ? 0.06 * i : 0;
    parts.push(
      `<path class="${cls}" style="animation-delay:${f2(delay)}s" d="${d}" fill="${color}" stroke="${STROKE}" stroke-width="2"/>`,
    );
  }

  const pct = Math.round((100 * numerator) / denominator);
  const style = animStyle(
    id,
    `@keyframes ${id}slice { from { opacity:0; transform:scale(0.35); } to { opacity:1; transform:scale(1); } }` +
      `@keyframes ${id}base { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-fill { transform-origin:${cx}px ${cy}px; animation:${id}slice 0.34s cubic-bezier(0.22,1.2,0.36,1) both; }` +
      `.${id}-empty { animation:${id}base 0.3s ease-out both; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${size}" height="${size + 34}" viewBox="0 0 ${size} ${size + 34}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${numerator}/${denominator}">
    ${style}${parts.join("")}
    <text x="${cx}" y="${size + 24}" text-anchor="middle" font-size="18" font-weight="bold" fill="${STROKE}">${numerator}/${denominator} = ${pct}%</text>
  </svg>`;
}

/** A row of `denominator` equal blocks, `numerator` filled. */
export function fractionBarSvg(numerator, denominator, width = 280, height = 50) {
  denominator = Math.max(1, Math.trunc(denominator));
  numerator = Math.max(0, Math.min(Math.trunc(numerator), denominator));
  const id = uid();
  const gap = 3;
  const blockW = (width - gap * (denominator - 1)) / denominator;
  const blocks = [];

  for (const i of range(denominator)) {
    const x = i * (blockW + gap);
    const filled = i < numerator;
    const color = filled ? FILL : EMPTY;
    const cls = filled ? `${id}-fill` : `${id}-empty`;
    const delay = filled ? 0.05 * i : 0;
    blocks.push(
      `<rect class="${cls}" style="animation-delay:${f2(delay)}s;transform-origin:${f1(x + blockW / 2)}px ${f1(height / 2)}px" ` +
        `x="${f1(x)}" y="0" width="${f1(blockW)}" height="${height}" fill="${color}" stroke="${STROKE}" stroke-width="2" rx="4"/>`,
    );
  }

  const pct = Math.round((100 * numerator) / denominator);
  const style = animStyle(
    id,
    `@keyframes ${id}blk { 0% { opacity:0; transform:scaleY(0.15); } 70% { opacity:1; transform:scaleY(1.12); } 100% { transform:scaleY(1); } }` +
      `@keyframes ${id}base { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-fill { animation:${id}blk 0.3s ease-out both; }` +
      `.${id}-empty { animation:${id}base 0.3s ease-out both; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height + 30}" viewBox="0 0 ${width} ${height + 30}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${numerator}/${denominator}">
    ${style}${blocks.join("")}
    <text x="${width / 2}" y="${height + 22}" text-anchor="middle" font-size="16" font-weight="bold" fill="${STROKE}">${numerator}/${denominator} = ${pct}%</text>
  </svg>`;
}

/** Pizza for small denominators, bar for larger ones. */
export function fractionVisualSvg(numerator, denominator) {
  return denominator <= 12
    ? pizzaSvg(numerator, denominator)
    : fractionBarSvg(numerator, denominator);
}

/** A horizontal fill bar (0-100%) with 25% gridlines. */
export function percentBarSvg(percent, { width = 280, height = 44, label = null } = {}) {
  percent = Math.max(0, Math.min(100, percent));
  const id = uid();
  const fillW = (width * percent) / 100;
  const ticks = [25, 50, 75]
    .map(
      (p) =>
        `<line x1="${f1((width * p) / 100)}" y1="0" x2="${f1((width * p) / 100)}" y2="${height}" stroke="${STROKE}" stroke-width="1" stroke-dasharray="3,3"/>`,
    )
    .join("");
  const text = label != null ? label : `${percent}%`;

  // The bar fills left-to-right so the percentage is seen being "poured in"
  // up to its mark, rather than just appearing at that length.
  const style = animStyle(
    id,
    `@keyframes ${id}grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }` +
      `.${id}-bar { transform-origin:0 0; animation:${id}grow 0.75s cubic-bezier(0.25,0.9,0.35,1) both; }`,
    `.${id}-bar { animation:none !important; transform:scaleX(1); }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height + 26}" viewBox="0 0 ${width} ${height + 26}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${percent}%">
    ${style}
    <rect x="0" y="0" width="${width}" height="${height}" fill="${EMPTY}" stroke="${STROKE}" stroke-width="2" rx="6"/>
    <rect class="${id}-bar" x="0" y="0" width="${f1(fillW)}" height="${height}" fill="${ACCENT}" rx="6"/>
    ${ticks}
    <text x="${width / 2}" y="${height + 20}" text-anchor="middle" font-size="16" font-weight="bold" fill="${STROKE}">${text}</text>
  </svg>`;
}

/**
 * A rows-x-cols dot array for multiplication. Falls back to a labelled grid
 * outline (no individual dots) when a*b is too big to read.
 */
export function arrayGridSvg(a, b, { maxDots = 100, dotR = 7, gap = 22 } = {}) {
  a = Math.trunc(a);
  b = Math.trunc(b);

  if (a * b <= maxDots) {
    const id = uid();
    const width = b * gap;
    const height = a * gap;
    const dots = [];
    // Dots pop in row by row, which is the whole point of an array picture:
    // "a rows of b" is something you watch being built up.
    for (const row of range(a)) {
      for (const col of range(b)) {
        const cx = col * gap + gap / 2;
        const cy = row * gap + gap / 2;
        const delay = 0.09 * row + 0.02 * col;
        dots.push(
          `<circle class="${id}-dot" style="animation-delay:${f2(delay)}s;transform-origin:${cx}px ${cy}px" ` +
            `cx="${cx}" cy="${cy}" r="${dotR}" fill="${FILL}" stroke="${STROKE}" stroke-width="1.5"/>`,
        );
      }
    }
    const style = animStyle(
      id,
      `@keyframes ${id}dot { 0% { opacity:0; transform:scale(0); } 65% { opacity:1; transform:scale(1.35); } 100% { transform:scale(1); } }` +
        `.${id}-dot { animation:${id}dot 0.32s cubic-bezier(0.22,1.2,0.36,1) both; }`,
    );
    return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${a} x ${b}">
      ${style}${dots.join("")}
    </svg>`;
  }

  // Too many for individual dots: draw a labelled grid rectangle instead.
  const width = 220;
  const height = 140;
  const colsShown = Math.min(b, 10);
  const rowsShown = Math.min(a, 10);
  const cellW = width / colsShown;
  const cellH = height / rowsShown;
  const lines = [];
  for (let i = 1; i < colsShown; i++) {
    const x = i * cellW;
    lines.push(
      `<line x1="${f1(x)}" y1="0" x2="${f1(x)}" y2="${height}" stroke="${STROKE}" stroke-width="1" opacity="0.5"/>`,
    );
  }
  for (let i = 1; i < rowsShown; i++) {
    const y = i * cellH;
    lines.push(
      `<line x1="0" y1="${f1(y)}" x2="${width}" y2="${f1(y)}" stroke="${STROKE}" stroke-width="1" opacity="0.5"/>`,
    );
  }
  return `<svg class="kmg-svg" width="${width}" height="${height + 26}" viewBox="0 0 ${width} ${height + 26}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${a} x ${b}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="${EMPTY}" stroke="${STROKE}" stroke-width="2" rx="6"/>
    ${lines.join("")}
    <text x="${width / 2}" y="${height + 20}" text-anchor="middle" font-size="16" font-weight="bold" fill="${STROKE}">${a} &#215; ${b}</text>
  </svg>`;
}

/** An analogue clock face showing the given time. */
export function clockSvg(hour, minute, { size = 140, highlight = ACCENT2 } = {}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const ticks = range(12)
    .map((i) => {
      const angle = i * 30;
      const [x0, y0] = polar(cx, cy, r, angle);
      const [x1, y1] = polar(cx, cy, r - 8, angle);
      return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${STROKE}" stroke-width="2"/>`;
    })
    .join("");

  const id = uid();
  const hourAngle = ((hour % 12) + minute / 60) * 30 - 90;
  const minuteAngle = minute * 6 - 90;
  const [hx, hy] = polar(cx, cy, r * 0.5, hourAngle);
  const [mx, my] = polar(cx, cy, r * 0.8, minuteAngle);
  const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  // Both hands are drawn at their final position and then rotated back to
  // 12 o'clock at the start of the animation, so they sweep round to the time
  // being asked about. Winding the minute hand a full extra turn makes the
  // "time passing" idea read at a glance.
  const hourFrom = -(hourAngle + 90);
  const minuteFrom = -(minuteAngle + 90) - 360;
  const style = animStyle(
    id,
    `@keyframes ${id}h { from { transform:rotate(${f1(hourFrom)}deg); } to { transform:rotate(0deg); } }` +
      `@keyframes ${id}m { from { transform:rotate(${f1(minuteFrom)}deg); } to { transform:rotate(0deg); } }` +
      `.${id}-hand { transform-origin:${cx}px ${cy}px; }` +
      `.${id}-h { animation:${id}h 0.9s cubic-bezier(0.3,0.9,0.3,1) both; }` +
      `.${id}-m { animation:${id}m 0.9s cubic-bezier(0.3,0.9,0.3,1) both; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${size}" height="${size + 26}" viewBox="0 0 ${size} ${size + 26}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
    ${style}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${EMPTY}" stroke="${STROKE}" stroke-width="3"/>
    ${ticks}
    <line class="${id}-hand ${id}-h" x1="${cx}" y1="${cy}" x2="${f1(hx)}" y2="${f1(hy)}" stroke="${STROKE}" stroke-width="4" stroke-linecap="round"/>
    <line class="${id}-hand ${id}-m" x1="${cx}" y1="${cy}" x2="${f1(mx)}" y2="${f1(my)}" stroke="${highlight}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="${STROKE}"/>
    <text x="${cx}" y="${size + 18}" text-anchor="middle" font-size="16" font-weight="bold" fill="${STROKE}">${label}</text>
  </svg>`;
}

/**
 * A bar-model / tape diagram: a full bar of `total`, with `part` marked off
 * at the front. Used for money (paid vs price -> change) and part-whole
 * measurement questions.
 */
export function tapeDiagramSvg(
  total,
  part,
  { width = 280, height = 46, totalLabel = null, partLabel = null, restLabel = null } = {},
) {
  total = Math.max(1e-9, total);
  part = Math.max(0, Math.min(part, total));
  const partW = (width * part) / total;
  const id = uid();
  const tLabel = totalLabel != null ? totalLabel : g(total);
  const pLabel = partLabel != null ? partLabel : g(part);
  const rLabel = restLabel != null ? restLabel : g(total - part);

  const style = animStyle(
    id,
    `@keyframes ${id}grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }` +
      `@keyframes ${id}slide { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-part { transform-origin:0 0; animation:${id}grow 0.6s cubic-bezier(0.25,0.9,0.35,1) both; }` +
      `.${id}-cut { animation:${id}slide 0.3s ease-out 0.55s both; }`,
    `.${id}-part { animation:none !important; transform:scaleX(1); } .${id}-cut { animation:none !important; opacity:1; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height + 46}" viewBox="0 0 ${width} ${height + 46}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${style}
    <rect x="0" y="20" width="${width}" height="${height}" fill="${EMPTY}" stroke="${STROKE}" stroke-width="2" rx="6"/>
    <rect class="${id}-part" x="0" y="20" width="${f1(partW)}" height="${height}" fill="${ACCENT2}" rx="6"/>
    <line class="${id}-cut" x1="${f1(partW)}" y1="14" x2="${f1(partW)}" y2="${height + 26}" stroke="${STROKE}" stroke-width="2" stroke-dasharray="4,3"/>
    <text x="${width / 2}" y="14" text-anchor="middle" font-size="14" fill="${STROKE}">${t("visual.total")}: ${tLabel}</text>
    <text x="${f1(Math.max(24, partW / 2))}" y="${20 + height / 2 + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#ffffff">${pLabel}</text>
    <text x="${f1(partW + Math.max(24, (width - partW) / 2))}" y="${20 + height / 2 + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="${STROKE}">${rLabel}</text>
  </svg>`;
}

/** A bar split into proportional segments, one per ratio part. */
export function ratioBarSvg(parts, { colors = null, width = 280, height = 46, labels = null } = {}) {
  const total = parts.reduce((s, p) => s + p, 0) || 1;
  const id = uid();
  const palette = colors || [FILL, ACCENT2, ACCENT, DANGER, "#ab47bc"];
  const segments = [];
  let x = 0;

  // Segments unroll one after another, so a ratio reads as "this much, then
  // this much" rather than as a single pre-split bar.
  parts.forEach((p, i) => {
    const w = (width * p) / total;
    const color = palette[i % palette.length];
    const delay = 0.11 * i;
    segments.push(
      `<rect class="${id}-seg" style="animation-delay:${f2(delay)}s;transform-origin:${f1(x)}px 0" ` +
        `x="${f1(x)}" y="0" width="${f1(w)}" height="${height}" fill="${color}" stroke="${STROKE}" stroke-width="2"/>`,
    );
    const label = labels ? labels[i] : String(p);
    segments.push(
      `<text class="${id}-lbl" style="animation-delay:${f2(delay + 0.2)}s" ` +
        `x="${f1(x + w / 2)}" y="${height / 2 + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#ffffff">${label}</text>`,
    );
    x += w;
  });

  const style = animStyle(
    id,
    `@keyframes ${id}seg { from { transform:scaleX(0); } to { transform:scaleX(1); } }` +
      `@keyframes ${id}lbl { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-seg { animation:${id}seg 0.36s cubic-bezier(0.25,0.9,0.35,1) both; }` +
      `.${id}-lbl { animation:${id}lbl 0.25s ease-out both; }`,
    `.${id}-seg { animation:none !important; transform:scaleX(1); } .${id}-lbl { animation:none !important; opacity:1; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${style}${segments.join("")}
  </svg>`;
}

/**
 * A see-saw balance scale visualising an equation: left side vs right side,
 * level when `balanced`.
 */
export function balanceScaleSvg(leftText, rightText, { balanced = true, width = 280, height = 170 } = {}) {
  const tilt = balanced ? 0 : 10;
  const cx = width / 2;
  const fulcrumY = height * 0.55;
  const beamHalf = width * 0.36;
  const angle = (tilt * Math.PI) / 180;
  const lx = cx - beamHalf * Math.cos(angle);
  const ly = fulcrumY - beamHalf * Math.sin(angle);
  const rx = cx + beamHalf * Math.cos(angle);
  const ry = fulcrumY + beamHalf * Math.sin(angle);
  const panR = 34;
  const id = uid();

  // The whole beam rocks and settles level, the way a real balance does - a
  // small piece of motion that says "these two sides are equal", which is the
  // entire idea behind solving for x.
  const style = animStyle(
    id,
    `@keyframes ${id}rock { 0% { transform:rotate(-7deg); } 35% { transform:rotate(4.5deg); } ` +
      `60% { transform:rotate(-2.5deg); } 82% { transform:rotate(1.2deg); } 100% { transform:rotate(0deg); } }` +
      `.${id}-beam { transform-origin:${cx}px ${fulcrumY}px; animation:${id}rock 1.5s cubic-bezier(0.4,0.05,0.3,1) both; }`,
    `.${id}-beam { animation:none !important; transform:rotate(0deg); }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${leftText} = ${rightText}">
    ${style}
    <polygon points="${cx - 14},${height - 20} ${cx + 14},${height - 20} ${cx},${fulcrumY}" fill="${STROKE}"/>
    <g class="${id}-beam">
      <line x1="${f1(lx)}" y1="${f1(ly)}" x2="${f1(rx)}" y2="${f1(ry)}" stroke="${STROKE}" stroke-width="5"/>
      <line x1="${f1(lx)}" y1="${f1(ly)}" x2="${f1(lx)}" y2="${f1(ly + 40)}" stroke="${STROKE}" stroke-width="2"/>
      <line x1="${f1(rx)}" y1="${f1(ry)}" x2="${f1(rx)}" y2="${f1(ry + 40)}" stroke="${STROKE}" stroke-width="2"/>
      <ellipse cx="${f1(lx)}" cy="${f1(ly + 44)}" rx="${panR}" ry="12" fill="${FILL}" stroke="${STROKE}" stroke-width="2"/>
      <ellipse cx="${f1(rx)}" cy="${f1(ry + 44)}" rx="${panR}" ry="12" fill="${ACCENT2}" stroke="${STROKE}" stroke-width="2"/>
      <text x="${f1(lx)}" y="${f1(ly + 40)}" text-anchor="middle" font-size="16" font-weight="bold" fill="${STROKE}">${leftText}</text>
      <text x="${f1(rx)}" y="${f1(ry + 40)}" text-anchor="middle" font-size="16" font-weight="bold" fill="${STROKE}">${rightText}</text>
    </g>
  </svg>`;
}

/**
 * A number line from lo to hi with labelled points, given as [value, label]
 * pairs.
 */
export function numberLineSvg(lo, hi, points, { width = 320, height = 90 } = {}) {
  lo = Math.trunc(lo);
  hi = Math.trunc(hi);
  const span = Math.max(1, hi - lo);
  const margin = 20;
  const usable = width - 2 * margin;
  const xOf = (v) => margin + (usable * (v - lo)) / span;
  const y = height * 0.45;

  const ticks = [];
  const step = Math.max(1, Math.floor(span / 10));
  for (let v = lo; v <= hi; v += step) {
    const x = xOf(v);
    ticks.push(
      `<line x1="${f1(x)}" y1="${y - 6}" x2="${f1(x)}" y2="${y + 6}" stroke="${STROKE}" stroke-width="1.5"/>`,
    );
    // Label every other tick on a long line, every tick on a short one -
    // otherwise the numbers collide and none of them are readable.
    const labelEvery = step >= 1 ? step * 2 : 1;
    if (v % labelEvery === 0 || span <= 12) {
      ticks.push(
        `<text x="${f1(x)}" y="${y + 22}" text-anchor="middle" font-size="11" fill="${STROKE}">${v}</text>`,
      );
    }
  }

  const id = uid();
  const markers = [];
  const colors = [ACCENT2, ACCENT, DANGER];
  // Markers drop onto the line and bounce, so the eye is pulled to where on
  // the line the starting number actually sits.
  points.forEach(([val, label], i) => {
    const x = xOf(val);
    const color = colors[i % colors.length];
    const delay = 0.35 + 0.18 * i;
    markers.push(
      `<circle class="${id}-mark" style="animation-delay:${f2(delay)}s;transform-origin:${f1(x)}px ${y}px" ` +
        `cx="${f1(x)}" cy="${y}" r="7" fill="${color}" stroke="${STROKE}" stroke-width="2"/>`,
    );
    markers.push(
      `<text class="${id}-mark" style="animation-delay:${f2(delay + 0.08)}s;transform-origin:${f1(x)}px ${y - 14}px" ` +
        `x="${f1(x)}" y="${y - 14}" text-anchor="middle" font-size="13" font-weight="bold" fill="${color}">${label}</text>`,
    );
  });

  const style = animStyle(
    id,
    `@keyframes ${id}draw { from { transform:scaleX(0); } to { transform:scaleX(1); } }` +
      `@keyframes ${id}drop { 0% { opacity:0; transform:translateY(-20px) scale(0.5); } 70% { opacity:1; transform:translateY(2px) scale(1.2); } 100% { transform:translateY(0) scale(1); } }` +
      `.${id}-axis { transform-origin:${margin}px ${y}px; animation:${id}draw 0.45s ease-out both; }` +
      `.${id}-mark { animation:${id}drop 0.4s cubic-bezier(0.22,1.2,0.36,1) both; }`,
    `.${id}-axis { animation:none !important; transform:scaleX(1); } .${id}-mark { animation:none !important; opacity:1; transform:none; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${style}
    <line class="${id}-axis" x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="${STROKE}" stroke-width="2"/>
    ${ticks.join("")}${markers.join("")}
  </svg>`;
}

/**
 * A skip-counting number line: ticks at 0, step, 2*step ... up to just past
 * `target`, with the target flagged. Used as a *guidance* hint for
 * missing-factor and division problems - it makes the child count the hops
 * themselves rather than printing the missing factor.
 */
export function skipCountSvg(step, target, { width = 320, height = 100 } = {}) {
  step = Math.max(1, Math.trunc(step));
  target = Math.max(step, Math.trunc(target));
  const hopsToTarget = Math.floor(target / step);
  const nHops = Math.min(hopsToTarget + 1, 14);
  const margin = 26;
  const usable = width - 2 * margin;
  const y = height * 0.45;
  const xOf = (i) => margin + (usable * i) / nHops;

  const id = uid();
  const ticks = [];
  const hopArcs = [];

  // Each hop is revealed in turn with an arc drawn from the previous tick, so
  // a child counting the hops sees them appear at counting speed.
  for (let i = 0; i <= nHops; i++) {
    const value = i * step;
    const x = xOf(i);
    const isTarget = value === target;
    const color = isTarget ? DANGER : STROKE;
    const r = isTarget ? 6 : 4;
    const delay = 0.16 * i;

    if (i > 0) {
      const xp = xOf(i - 1);
      const arc = `M ${f1(xp)},${y} Q ${f1((xp + x) / 2)},${y - 26} ${f1(x)},${y}`;
      hopArcs.push(
        `<path class="${id}-hop" style="animation-delay:${f2(delay - 0.1)}s" d="${arc}" fill="none" stroke="${ACCENT2}" stroke-width="2" stroke-dasharray="3,3"/>`,
      );
    }

    const group = [
      `<line x1="${f1(x)}" y1="${y - 8}" x2="${f1(x)}" y2="${y + 8}" stroke="${STROKE}" stroke-width="1.5"/>`,
      `<circle cx="${f1(x)}" cy="${y}" r="${r}" fill="${color}"/>`,
      `<text x="${f1(x)}" y="${y + 24}" text-anchor="middle" font-size="12" font-weight="${isTarget ? "bold" : "normal"}" fill="${color}">${value}</text>`,
    ];
    if (isTarget) {
      group.push(`<text x="${f1(x)}" y="${y - 16}" text-anchor="middle" font-size="16">&#128681;</text>`);
    }
    ticks.push(
      `<g class="${id}-tick" style="animation-delay:${f2(delay)}s;transform-origin:${f1(x)}px ${y}px">${group.join("")}</g>`,
    );
  }

  const style = animStyle(
    id,
    `@keyframes ${id}tick { 0% { opacity:0; transform:scale(0.4); } 70% { opacity:1; transform:scale(1.2); } 100% { transform:scale(1); } }` +
      `@keyframes ${id}hop { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-tick { animation:${id}tick 0.28s cubic-bezier(0.22,1.2,0.36,1) both; }` +
      `.${id}-hop { animation:${id}hop 0.22s ease-out both; }`,
    `#${id} * { animation:none !important; opacity:1; transform:none; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${style}
    <line x1="${margin}" y1="${y}" x2="${f1(xOf(nHops))}" y2="${y}" stroke="${STROKE}" stroke-width="2"/>
    ${hopArcs.join("")}${ticks.join("")}
  </svg>`;
}

/** A labelled rectangle for perimeter/area questions. */
export function rectangleSvg(w, h, { unit = "", width = 260, height = 180 } = {}) {
  const pad = 40;
  const maxW = width - 2 * pad;
  const maxH = height - 2 * pad;
  const scale = Math.min(maxW / w, maxH / h);
  const rw = w * scale;
  const rh = h * scale;
  const x0 = (width - rw) / 2;
  const y0 = (height - rh) / 2 - 10;
  const id = uid();

  // The outline draws itself (stroke-dashoffset) and the fill washes in
  // behind it, so the shape is "constructed" rather than stamped down.
  const perimeter = 2 * (rw + rh) + 24;
  const style = animStyle(
    id,
    `@keyframes ${id}draw { from { stroke-dashoffset:${f0(perimeter)}; } to { stroke-dashoffset:0; } }` +
      `@keyframes ${id}wash { from { opacity:0; } to { opacity:1; } }` +
      // Opacity only, never transform: the height label carries its own SVG
      // rotate() attribute and a CSS transform would silently replace it,
      // tipping the label back flat.
      `@keyframes ${id}lbl { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-outline { stroke-dasharray:${f0(perimeter)}; animation:${id}draw 0.7s ease-out both; }` +
      `.${id}-fill { animation:${id}wash 0.5s ease-out 0.5s both; }` +
      `.${id}-lbl { animation:${id}lbl 0.3s ease-out 0.8s both; }`,
    `#${id} * { animation:none !important; opacity:1; stroke-dashoffset:0; transform:none; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${w} x ${h} ${unit}">
    ${style}
    <rect class="${id}-fill" x="${f1(x0)}" y="${f1(y0)}" width="${f1(rw)}" height="${f1(rh)}" fill="${FILL}" stroke="none" rx="4"/>
    <rect class="${id}-outline" x="${f1(x0)}" y="${f1(y0)}" width="${f1(rw)}" height="${f1(rh)}" fill="none" stroke="${STROKE}" stroke-width="3" rx="4"/>
    <text class="${id}-lbl" x="${f1(x0 + rw / 2)}" y="${f1(y0 - 10)}" text-anchor="middle" font-size="15" font-weight="bold" fill="${STROKE}">${w} ${unit}</text>
    <text class="${id}-lbl" x="${f1(x0 + rw + 22)}" y="${f1(y0 + rh / 2)}" text-anchor="middle" font-size="15" font-weight="bold" fill="${STROKE}" transform="rotate(90 ${f1(x0 + rw + 22)} ${f1(y0 + rh / 2)})">${h} ${unit}</text>
  </svg>`;
}

/** A labelled triangle (base + dashed height) for triangle-area questions. */
export function triangleSvg(base, heightVal, { unit = "", width = 260, height = 180 } = {}) {
  const pad = 40;
  const maxW = width - 2 * pad;
  const maxH = height - 2 * pad;
  const scale = Math.min(maxW / base, maxH / heightVal);
  const tb = base * scale;
  const th = heightVal * scale;
  const x0 = (width - tb) / 2;
  const y0 = height - pad;
  const apexX = x0 + tb * 0.35;
  const apexY = y0 - th;
  const id = uid();

  // Outline draws itself, then the dashed height line grows down from the
  // apex - the height is the part children forget, so it gets its own beat
  // instead of arriving with everything else.
  const side =
    Math.hypot(apexX - x0, apexY - y0) + Math.hypot(x0 + tb - apexX, y0 - apexY) + tb + 12;
  const style = animStyle(
    id,
    `@keyframes ${id}draw { from { stroke-dashoffset:${f0(side)}; } to { stroke-dashoffset:0; } }` +
      `@keyframes ${id}hdraw { from { transform:scaleY(0); } to { transform:scaleY(1); } }` +
      `@keyframes ${id}wash { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-outline { stroke-dasharray:${f0(side)}; animation:${id}draw 0.7s ease-out both; }` +
      `.${id}-fill { animation:${id}wash 0.5s ease-out 0.5s both; }` +
      `.${id}-h { transform-origin:${f1(apexX)}px ${f1(apexY)}px; animation:${id}hdraw 0.4s ease-out 0.75s both; }` +
      `.${id}-lbl { animation:${id}wash 0.3s ease-out 0.95s both; }`,
    `#${id} * { animation:none !important; opacity:1; stroke-dashoffset:0; transform:none; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${style}
    <polygon class="${id}-fill" points="${f1(x0)},${f1(y0)} ${f1(x0 + tb)},${f1(y0)} ${f1(apexX)},${f1(apexY)}" fill="${FILL}" stroke="none"/>
    <polygon class="${id}-outline" points="${f1(x0)},${f1(y0)} ${f1(x0 + tb)},${f1(y0)} ${f1(apexX)},${f1(apexY)}" fill="none" stroke="${STROKE}" stroke-width="3"/>
    <line class="${id}-h" x1="${f1(apexX)}" y1="${f1(apexY)}" x2="${f1(apexX)}" y2="${f1(y0)}" stroke="${STROKE}" stroke-width="1.5" stroke-dasharray="4,3"/>
    <text class="${id}-lbl" x="${f1(x0 + tb / 2)}" y="${f1(y0 + 18)}" text-anchor="middle" font-size="14" font-weight="bold" fill="${STROKE}">${t("visual.base")}: ${base} ${unit}</text>
    <text class="${id}-lbl" x="${f1(apexX + 10)}" y="${f1((apexY + y0) / 2)}" font-size="14" font-weight="bold" fill="${STROKE}">${t("visual.height")}: ${heightVal} ${unit}</text>
  </svg>`;
}

/** A simple isometric box for volume questions. */
export function cuboidSvg(l, w, h, { unit = "", width = 260, height = 200 } = {}) {
  const pad = 40;
  const ox = pad;
  const oy = height - pad;
  const dx = 0.5;
  const dy = 0.28; // isometric skew for depth
  const scale = Math.min((width - 2 * pad) / (l + w * 0.9), (height - 2 * pad) / (h + w * 0.5));
  const L = l * scale;
  const W = w * scale;
  const H = h * scale;

  const front = [
    [ox, oy],
    [ox + L, oy],
    [ox + L, oy - H],
    [ox, oy - H],
  ];
  const top = [
    [ox, oy - H],
    [ox + L, oy - H],
    [ox + L + W * dx, oy - H - W * dy],
    [ox + W * dx, oy - H - W * dy],
  ];
  const side = [
    [ox + L, oy],
    [ox + L + W * dx, oy - W * dy],
    [ox + L + W * dx, oy - H - W * dy],
    [ox + L, oy - H],
  ];
  const pts = (p) => p.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

  const id = uid();
  // The three faces assemble one at a time (front, side, top), which makes
  // the box read as three dimensions rather than a flat hexagon - exactly the
  // confusion that trips kids up on volume.
  const style = animStyle(
    id,
    `@keyframes ${id}face { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }` +
      `@keyframes ${id}lbl { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-f1 { animation:${id}face 0.4s ease-out both; }` +
      `.${id}-f2 { animation:${id}face 0.4s ease-out 0.2s both; }` +
      `.${id}-f3 { animation:${id}face 0.4s ease-out 0.4s both; }` +
      `.${id}-lbl { animation:${id}lbl 0.3s ease-out 0.7s both; }`,
    `#${id} * { animation:none !important; opacity:1; transform:none; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${style}
    <polygon class="${id}-f3" points="${pts(top)}" fill="#ffe0b2" stroke="${STROKE}" stroke-width="2"/>
    <polygon class="${id}-f2" points="${pts(side)}" fill="#ffb74d" stroke="${STROKE}" stroke-width="2"/>
    <polygon class="${id}-f1" points="${pts(front)}" fill="#ffcc80" stroke="${STROKE}" stroke-width="2"/>
    <text class="${id}-lbl" x="${f1(ox + L / 2)}" y="${f1(oy + 18)}" text-anchor="middle" font-size="13" font-weight="bold" fill="${STROKE}">${t("visual.length_abbr")}=${l}${unit}</text>
    <text class="${id}-lbl" x="${f1(ox - 14)}" y="${f1(oy - H / 2)}" text-anchor="middle" font-size="13" font-weight="bold" fill="${STROKE}">${t("visual.height_abbr")}=${h}${unit}</text>
    <text class="${id}-lbl" x="${f1(ox + L + (W * dx) / 2 + 8)}" y="${f1(oy - (W * dy) / 2 + 4)}" text-anchor="middle" font-size="13" font-weight="bold" fill="${STROKE}">${t("visual.width_abbr")}=${w}${unit}</text>
  </svg>`;
}

/** A simple travel diagram: start -> end with distance/time labels. */
export function speedDiagramSvg(distance, unitD, time, unitT, { width = 280, height = 90 } = {}) {
  const y = height * 0.5;
  const x0 = 30;
  const x1 = width - 30;
  const id = uid();

  // The marker id has to be unique per render: two speed diagrams on one page
  // both defining id="arrow" would leave the second pointing at the first
  // one's marker (duplicate ids resolve to whichever came first).
  const style = animStyle(
    id,
    `@keyframes ${id}road { from { transform:scaleX(0); } to { transform:scaleX(1); } }` +
      `@keyframes ${id}drive { from { transform:translateX(0); } to { transform:translateX(${f0(x1 - x0 - 24)}px); } }` +
      `@keyframes ${id}fade { from { opacity:0; } to { opacity:1; } }` +
      `.${id}-road { transform-origin:${x0}px ${y}px; animation:${id}road 0.6s ease-out both; }` +
      `.${id}-car { animation:${id}drive 1.5s cubic-bezier(0.4,0,0.5,1) 0.4s both; }` +
      `.${id}-lbl { animation:${id}fade 0.35s ease-out 0.5s both; }`,
    `.${id}-road { animation:none !important; transform:scaleX(1); } .${id}-car { animation:none !important; transform:none; } .${id}-lbl { animation:none !important; opacity:1; }`,
  );

  return `<svg id="${id}" class="kmg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${style}
    <defs>
      <marker id="${id}-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="${STROKE}"/>
      </marker>
    </defs>
    <line class="${id}-road" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${STROKE}" stroke-width="3" marker-end="url(#${id}-arrow)"/>
    <text class="${id}-car" x="${x0}" y="${y - 14}" font-size="22">&#128663;</text>
    <text x="${x1 - 18}" y="${y - 14}" font-size="22">&#127937;</text>
    <text class="${id}-lbl" x="${f1((x0 + x1) / 2)}" y="${y + 24}" text-anchor="middle" font-size="14" font-weight="bold" fill="${STROKE}">${distance} ${unitD} ${t("visual.in_time")} ${time} ${unitT}</text>
  </svg>`;
}

/**
 * A circular countdown dial for the timed games. Unlike the Streamlit
 * version this is redrawn every animation frame rather than once a second,
 * so the ring sweeps smoothly instead of stepping.
 */
export function countdownRingSvg(remaining, total, { size = 108 } = {}) {
  total = Math.max(1e-9, total);
  const frac = Math.max(0, Math.min(1, remaining / total));
  const r = size / 2 - 9;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - frac);
  const color = frac > 0.5 ? "#4caf50" : frac > 0.25 ? "#ffb300" : "#ef5350";
  return `<svg class="kmg-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="timer" aria-label="${Math.ceil(remaining)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#fff" stroke="#eceff1" stroke-width="9"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="9"
            stroke-linecap="round" stroke-dasharray="${f1(circumference)}" stroke-dashoffset="${f1(offset)}"
            transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="${size / 2}" y="${size / 2 + 9}" text-anchor="middle" font-size="26" font-weight="bold" fill="#5d4037">${Math.ceil(remaining)}</text>
  </svg>`;
}
