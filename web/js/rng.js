/**
 * Random helpers with Python's `random` semantics, so the question
 * generators could be transcribed from utils/... and pages/... without
 * re-deriving every range by hand.
 *
 * The important one is randInt: Python's random.randint(a, b) includes b,
 * where a naive Math.random()*(b-a) does not. Getting that wrong would have
 * quietly removed the top value from every level's number range.
 */

/** Inclusive on both ends, like Python's random.randint. */
export function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** Uniform float in [a, b), like Python's random.uniform. */
export function randFloat(a, b) {
  return a + Math.random() * (b - a);
}

/** One element of `items`, like Python's random.choice. */
export function choice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

/** k distinct elements, like Python's random.sample. */
export function sample(items, k) {
  const pool = [...items];
  const out = [];
  const n = Math.min(k, pool.length);
  for (let i = 0; i < n; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

/** A shuffled copy (Fisher-Yates). */
export function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffle in place, like Python's random.shuffle. */
export function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** True half the time - the JS spelling of random.choice([True, False]). */
export function coinFlip() {
  return Math.random() < 0.5;
}

/** Python's range(start, stop, step) as an array. */
export function range(start, stop, step = 1) {
  if (stop === undefined) {
    stop = start;
    start = 0;
  }
  const out = [];
  if (step > 0) for (let v = start; v < stop; v += step) out.push(v);
  else for (let v = start; v > stop; v += step) out.push(v);
  return out;
}

/** Greatest common divisor, like math.gcd (always non-negative). */
export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Deduplicate while keeping first-seen order, like dict.fromkeys(...). */
export function unique(items) {
  return [...new Set(items)];
}
