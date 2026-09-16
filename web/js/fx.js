/**
 * The celebration layer: confetti, toasts, feedback banners, level-up cards.
 *
 * The Streamlit version could only use CSS keyframes (st.markdown strips
 * <script>), so confetti was ~34 divs falling in straight lines and a "toast"
 * was whatever Streamlit's own st.toast looked like. Here the same moments
 * get a canvas particle system with gravity, drag, tumble and a burst
 * originating wherever the child actually tapped.
 *
 * Rules kept from utils/anim.py, because they were the right ones:
 *   - every effect ends inert and invisible, never swallowing a later tap;
 *   - prefers-reduced-motion skips the movement entirely rather than
 *     speeding it up - some children get motion sick, and a maths game must
 *     not be the thing that triggers it.
 */
const COLORS = ["#ff4b4b", "#ffb300", "#4caf50", "#42a5f5", "#ab47bc", "#ff7043"];

const reduceMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

let canvas = null;
let ctx = null;
let particles = [];
let rafId = null;

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.className = "kmg-confetti-canvas";
  // pointer-events:none in CSS - the overlay must never eat a tap meant for
  // the answer buttons underneath it.
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  return canvas;
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function tick() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);

  particles = particles.filter((p) => {
    p.vy += 0.22; // gravity
    p.vx *= 0.992; // air drag
    p.x += p.vx;
    p.y += p.vy;
    p.spin += p.spinRate;
    p.life -= 1;
    // Fade out over the last half-second rather than vanishing mid-air.
    const alpha = Math.max(0, Math.min(1, p.life / 40));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.fillStyle = p.color;
    // A rectangle squashed by cos(spin) reads as a tumbling paper flake
    // without needing a second axis of rotation.
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5 * Math.abs(Math.cos(p.spin)));
    ctx.restore();

    return p.life > 0 && p.y < height + 40;
  });

  if (particles.length) {
    rafId = requestAnimationFrame(tick);
  } else {
    ctx.clearRect(0, 0, width, height);
    rafId = null;
  }
}

/**
 * Fire a confetti burst.
 * @param {{x?: number, y?: number, count?: number, spread?: number}} options
 *   x/y default to the top-centre of the viewport; pass the tap coordinates
 *   to make the burst come out of the button the child just pressed.
 */
export function confetti(options = {}) {
  if (reduceMotion()) return;
  const {
    x = window.innerWidth / 2,
    y = window.innerHeight * 0.3,
    count = 60,
    spread = Math.PI * 2,
  } = options;

  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = 4 + Math.random() * 9;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      spin: Math.random() * Math.PI * 2,
      spinRate: (Math.random() - 0.5) * 0.3,
      life: 90 + Math.random() * 60,
    });
  }
  // Cap the population so a child hammering the answer button can't build up
  // thousands of particles and drop the frame rate on a school Chromebook.
  if (particles.length > 400) particles = particles.slice(particles.length - 400);
  if (!rafId) rafId = requestAnimationFrame(tick);
}

/** A bigger, two-sided burst for finishing a round or beating a record. */
export function bigCelebration() {
  if (reduceMotion()) return;
  const h = window.innerHeight * 0.55;
  confetti({ x: 0, y: h, count: 55, spread: Math.PI * 0.7 });
  confetti({ x: window.innerWidth, y: h, count: 55, spread: Math.PI * 0.7 });
  setTimeout(() => confetti({ count: 70 }), 220);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

function toastHost() {
  let host = document.getElementById("kmg-toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "kmg-toasts";
    host.className = "kmg-toasts";
    // Announced politely so a screen reader hears "level 3!" without the
    // toast stealing focus from the answer field.
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

/** Show a short message in the corner. Returns the element. */
export function toast(message, icon = "✨", duration = 3200) {
  const host = toastHost();
  const el = document.createElement("div");
  el.className = "kmg-toast";
  el.innerHTML = `<span class="kmg-toast-icon"></span><span class="kmg-toast-text"></span>`;
  el.querySelector(".kmg-toast-icon").textContent = icon;
  el.querySelector(".kmg-toast-text").textContent = message;
  host.appendChild(el);

  setTimeout(() => {
    el.classList.add("kmg-toast-out");
    setTimeout(() => el.remove(), 400);
  }, duration);
  return el;
}

/**
 * The full-screen "Level 3!" card. Big, brief, and impossible to miss -
 * levelling up was previously just a small toast, which children missed.
 */
export function levelUpOverlay(title, subtitle) {
  const el = document.createElement("div");
  el.className = "kmg-levelcard";
  el.innerHTML = `
    <div class="kmg-levelcard-inner">
      <div class="kmg-levelcard-star">⭐</div>
      <div class="kmg-levelcard-title"></div>
      <div class="kmg-levelcard-sub"></div>
    </div>`;
  el.querySelector(".kmg-levelcard-title").textContent = title;
  el.querySelector(".kmg-levelcard-sub").textContent = subtitle || "";
  document.body.appendChild(el);
  const life = reduceMotion() ? 900 : 1600;
  setTimeout(() => {
    el.classList.add("kmg-levelcard-out");
    setTimeout(() => el.remove(), 400);
  }, life);
}

/** Pop a floating "+15" out of an element - immediate, visible reward. */
export function floatPoints(anchor, text) {
  if (reduceMotion() || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "kmg-floatpoints";
  el.textContent = text;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/** Centre point of an element, for aiming a confetti burst at it. */
export function centerOf(el) {
  if (!el) return {};
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
