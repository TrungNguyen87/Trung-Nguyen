/**
 * Sound effects, synthesized live with the Web Audio API.
 *
 * The Streamlit version had to build a WAV file byte by byte with Python's
 * `wave` module, base64 it into a hidden <audio autoplay> tag, and hope the
 * browser allowed it - which meant one fixed blip per outcome, arriving a
 * network round-trip after the tap.
 *
 * Here the tones are generated in the browser at the instant of the tap, so
 * they are free, immediate, and can actually respond to what happened: the
 * correct-answer arpeggio rises a step for every answer in the current
 * streak, which is a small thing a child notices within about four answers.
 *
 * Autoplay policy: an AudioContext starts suspended until the page has had a
 * real user gesture. unlock() is wired to the first pointer/key event; until
 * then every play call is a silent no-op rather than an error.
 */
import { state } from "./state.js";

let ctx = null;
let master = null;

function ensureContext() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Called from the first user gesture - see main.js. */
export function unlock() {
  const context = ensureContext();
  if (context && context.state === "suspended") context.resume().catch(() => {});
}

function blip(freq, startAt, duration, { type = "sine", gain = 1, slideTo = null } = {}) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, startAt + duration);

  // A short attack and an exponential tail: a plain on/off gate clicks
  // audibly at both ends, which is unpleasant over a 45-minute session.
  env.gain.setValueAtTime(0.0001, startAt);
  env.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function play(notes, options = {}) {
  if (!state.soundEnabled) return;
  const context = ensureContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  notes.forEach(([freq, offset, duration, opts]) =>
    blip(freq, now + offset, duration, { ...options, ...opts }),
  );
}

// Equal temperament from A4, so the arpeggios stay in tune as they climb.
const note = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

/**
 * Correct answer: a rising major triad. `streak` shifts the whole figure up,
 * capped at an octave so a long run doesn't end up shrill.
 */
export function playCorrect(streak = 0) {
  const shift = Math.min(streak, 12);
  play([
    [note(3 + shift), 0, 0.1, { type: "triangle" }],
    [note(7 + shift), 0.07, 0.1, { type: "triangle" }],
    [note(12 + shift), 0.14, 0.2, { type: "triangle", gain: 1.1 }],
  ]);
}

/** A bright chime for a prompt correct competition answer or quick alert. */
export function playDing() {
  play([
    [note(12), 0, 0.09, { type: "triangle", gain: 1.0 }],
    [note(19), 0.07, 0.2, { type: "sine", gain: 0.9 }],
  ]);
}

/** Wrong answer: a soft two-note fall. Gentle on purpose - it is not a buzzer. */
export function playIncorrect() {
  play([
    [note(-9), 0, 0.14, { type: "sine", gain: 0.8 }],
    [note(-14), 0.12, 0.24, { type: "sine", gain: 0.7 }],
  ]);
}

/** A short buzz for an incorrect competition answer or timeout. */
export function playBuzz() {
  play([
    [note(-9), 0, 0.12, { type: "sawtooth", gain: 0.45 }],
    [note(-14), 0.08, 0.16, { type: "sawtooth", gain: 0.35 }],
  ]);
}

/** Level up: a four-note fanfare. */
export function playLevelUp() {
  play([
    [note(0), 0, 0.11, { type: "triangle" }],
    [note(4), 0.1, 0.11, { type: "triangle" }],
    [note(7), 0.2, 0.11, { type: "triangle" }],
    [note(12), 0.3, 0.32, { type: "triangle", gain: 1.2 }],
  ]);
}

/** Badge earned: a bright sparkle above the fanfare's range. */
export function playBadge() {
  play([
    [note(12), 0, 0.08, { type: "sine" }],
    [note(16), 0.06, 0.08, { type: "sine" }],
    [note(19), 0.12, 0.08, { type: "sine" }],
    [note(24), 0.18, 0.26, { type: "sine", gain: 0.9 }],
  ]);
}

/** A quiet click for taps that are neither right nor wrong (menus, dice). */
export function playTap() {
  play([[note(7), 0, 0.045, { type: "square", gain: 0.35 }]]);
}

/** The last five seconds of a timed round. */
export function playTick() {
  play([[note(-2), 0, 0.05, { type: "square", gain: 0.3 }]]);
}

/** A timed round ending. */
export function playTimeUp() {
  play([
    [note(-5), 0, 0.18, { type: "sawtooth", gain: 0.5, slideTo: note(-17) }],
  ]);
}

/** Round cleared / new record. */
export function playFanfare() {
  play([
    [note(0), 0, 0.12, { type: "triangle" }],
    [note(4), 0.1, 0.12, { type: "triangle" }],
    [note(7), 0.2, 0.12, { type: "triangle" }],
    [note(12), 0.3, 0.14, { type: "triangle" }],
    [note(7), 0.44, 0.12, { type: "triangle" }],
    [note(12), 0.54, 0.4, { type: "triangle", gain: 1.2 }],
  ]);
}

if (typeof window !== "undefined") {
  window.__kmg_sound = {
    unlock,
    playCorrect,
    playDing,
    playIncorrect,
    playBuzz,
    playLevelUp,
    playBadge,
    playTap,
    playTick,
    playTimeUp,
    playFanfare,
  };
}
