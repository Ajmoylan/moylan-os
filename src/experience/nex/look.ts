import { NEX_SHELL_RADIUS } from "./params";

/**
 * NEX's personality (launch sprint): pure, allocation-free helpers and their tuning, unit-tested.
 *
 * - **Look:** NEX's ring assembly turns towards the visitor's cursor (it never translates): a
 *   noticeable but bounded yaw and pitch, approached with smooth exponential damping, so it follows
 *   the visitor's attention without snapping or chasing. It eases back when the cursor leaves and
 *   reaches exactly the approved pose at rest.
 * - **Core lean:** independently, the central energy core (its particles, glow and shell) leans
 *   towards the cursor by up to `CORE_LEAN` of NEX's ring radius, staying well inside the rings,
 *   with its own damping; exactly centred at rest.
 * - **Attention:** a soft acknowledgement level 0 … 1 (a held glow while the visitor's pointer or
 *   focus is on NEX's launcher, a brief pulse on activation), added to NEX's breathing glow.
 * - **Vitality:** extra amplitude on NEX's approved 7.48 s breathing cycle (the same phase, so it
 *   is one coordinated pulse), so NEX visibly breathes when nobody interacts with it. Zero at the
 *   cycle's rest phase, so the formed NEX at time 0 (and a Reduced Motion still) is unchanged.
 *
 * All of it exists only with Full Motion (and pointer effects, for look and lean); Reduced and Off
 * Motion keep NEX still (ADR-004).
 */

/**
 * Largest turn of the rings towards the cursor (radians): about 32° sideways, 22° up or down.
 * The ring cage's silhouette stays circular at any of these turns (measured: projected aspect
 * 1.000–1.007, full outline coverage), so NEX keeps its spherical form.
 */
export const LOOK_MAX_YAW = 0.56;
export const LOOK_MAX_PITCH = 0.38;
/** Radians of turn per NDC unit of horizontal (aspect-corrected) or vertical offset. */
export const LOOK_GAIN = 0.8;
/** The turn follows a gently damped spring (organic: eases in and out, no jolt). */
export const LOOK_SPRING = { frequency: 1.1, damping: 0.82 } as const;

/** Largest lean of the core, as a share of NEX's ring radius (NEX_SHELL_RADIUS). */
export const CORE_LEAN = 0.16;
/** NEX-local units of the largest lean (0.12): the core's shell (0.21) stays inside the innermost ring band (≈ 0.4). */
export const CORE_LEAN_UNITS = CORE_LEAN * NEX_SHELL_RADIUS;
/** Lean (0 … 1) per NDC unit of cursor distance: full lean from ≈ 0.6 NDC away. */
export const CORE_LEAN_GAIN = 1.7;
/** The core's own spring: a little quicker than the rings, so it reads as independent. */
export const CORE_SPRING = { frequency: 1.5, damping: 0.75 } as const;

/**
 * The core's energy pulse (heartbeat): every `period` seconds of NEX's idle time a soft shell of
 * light leaves the core and travels out through the rings to the halo over `travel` seconds,
 * brightening the particles it passes (`strength`, fading as it spreads), while the core's glow
 * swells briefly as it is released. Twice per breathing cycle, so breath and pulse are one rhythm.
 */
export const PULSE = { period: 7.4792 / 2, travel: 1.9, reach: 1.3, strength: 1, glow: 0.7 };

/** Extra breathing amplitude (added to the approved core scale 0.055, glow 0.2, shell 0.15). */
export const VITALITY = { breath: 0.045, glow: 0.22, atmosphere: 0.5, shell: 0.12 } as const;

/** Glow added at full attention (NEX's breathing glow spans 0.9 … 1.1). */
export const ATTENTION_GLOW = 0.32;
/** Level held while the pointer or focus is on NEX. */
export const ATTENTION_HOLD = 0.45;
/** Time constant (s) of the attention level's approach to its target. */
export const ATTENTION_SECONDS = 0.6;

/*
 * Personality 2.0 (70 % JARVIS, 30 % Ghost): small, readable reactions on NEX's existing springs.
 * Rotations and a few per cent of scale only, so his silhouette, particles and placement never change.
 */

/**
 * Curiosity: when the visitor's pointer pauses, NEX tilts his rings towards its side (a quizzical
 * head-tilt, up to `roll` radians), straightening again as it moves on. The pointer counts as
 * paused below `still` NDC per second; the tilt builds and fades with a `settle` s time constant.
 */
export const CURIOSITY = { roll: 0.2, still: 0.35, settle: 0.45 } as const;

/** Playfulness: one graceful turn of the ring assembly on activation, with a little lift. */
export const TWIRL = { seconds: 1.2, lift: 0.06 } as const;

/**
 * Idle presence (no pointer, e.g. on phones): about every `every` s NEX glances somewhere for
 * `hold` s and back (direction and timing vary per cycle, deterministically from his idle time).
 */
export const GLANCE = { every: 11, hold: 1.7, yaw: 0.34, pitch: 0.16 } as const;

/** Expressiveness: NEX perks up (scale) with the visitor's attention, by up to this share. */
export const PERK = 0.05;

/** Arrival: a small nod (radians per second given to the pitch spring) when a glide ends. */
export const ARRIVAL_NOD = 1.5;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
/** Deterministic 0 … 1 hash of an integer (no Math.random: frames and tests are reproducible). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The curiosity tilt for a pointer `dx` NDC (aspect-corrected) to the right of NEX and a dwell
 * level 0 … 1: negative (clockwise, the top towards the pointer) when the pointer is on his right.
 */
export function curiosityRoll(dx: number, dwell: number): number {
  return -CURIOSITY.roll * dwell * clamp(dx * 1.5, 1);
}

/**
 * The twirl at progress 0 … 1: `roll`, one full turn eased in and out (identical pose at both
 * ends), and `lift`, a scale share rising and falling with it. Writes into `out` and returns it.
 */
export function twirlAt(progress: number, out: { roll: number; lift: number }) {
  const t = Math.min(Math.max(progress, 0), 1);
  const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  out.roll = 2 * Math.PI * eased;
  out.lift = TWIRL.lift * Math.sin(Math.PI * t);
  return out;
}

/**
 * The idle glance NEX aims for at idle time `time` (seconds): a turn somewhere during a short
 * window in each `GLANCE.every` s cycle, otherwise straight ahead. Writes into `out`.
 */
export function glanceAt(time: number, out: Look): Look {
  const cycle = Math.floor(time / GLANCE.every);
  const start = 2 + 6 * hash(cycle);
  const local = time - cycle * GLANCE.every;
  if (cycle < 1 || local < start || local > start + GLANCE.hold) {
    out.yaw = out.pitch = 0;
    return out;
  }
  const side = hash(cycle + 0.5) < 0.5 ? -1 : 1;
  out.yaw = side * GLANCE.yaw * (0.6 + 0.4 * hash(cycle + 0.25));
  out.pitch = GLANCE.pitch * (hash(cycle + 0.75) * 2 - 1);
  return out;
}

export interface Look {
  yaw: number;
  pitch: number;
}

/**
 * The turn NEX aims for, from the cursor and NEX's own centre (both in NDC, y up) and the viewport
 * aspect (width / height). Writes into `out` and returns it.
 */
export function lookTarget(
  cursorX: number,
  cursorY: number,
  nexX: number,
  nexY: number,
  aspect: number,
  out: Look,
): Look {
  out.yaw = clamp((cursorX - nexX) * aspect * LOOK_GAIN, LOOK_MAX_YAW);
  // A cursor above NEX tilts its front upwards (a negative turn about the x axis).
  out.pitch = clamp(-(cursorY - nexY) * LOOK_GAIN, LOOK_MAX_PITCH);
  return out;
}

/**
 * The core's lean NEX aims for: a screen-space direction towards the cursor (y up) whose length,
 * 0 … 1, grows with the cursor's distance from NEX's centre. Writes into `out` and returns it.
 */
export function leanTarget(
  cursorX: number,
  cursorY: number,
  nexX: number,
  nexY: number,
  aspect: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const dx = (cursorX - nexX) * aspect;
  const dy = cursorY - nexY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const amount = Math.min(1, distance * CORE_LEAN_GAIN);
  out.x = (dx / distance) * amount;
  out.y = (dy / distance) * amount;
  return out;
}

/** A spring's state: position and velocity. */
export interface Spring {
  x: number;
  v: number;
}

/**
 * Advances a damped spring towards `target` by `dt` seconds (semi-implicit Euler in sub-steps of at
 * most 1/120 s, so it is stable at any frame rate). `frequency` in Hz, `damping` the ratio (< 1
 * eases in with a slight, natural settle). Snaps exactly onto a resting target once there.
 */
export function spring(
  state: Spring,
  target: number,
  dt: number,
  { frequency, damping }: { frequency: number; damping: number },
): number {
  const w = 2 * Math.PI * frequency;
  let left = Math.min(Math.max(dt, 0), 0.25);
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    state.v += (w * w * (target - state.x) - 2 * damping * w * state.v) * h;
    state.x += state.v * h;
    left -= h;
  }
  if (Math.abs(target - state.x) < 1e-5 && Math.abs(state.v) < 1e-4) {
    state.x = target;
    state.v = 0;
  }
  return state.x;
}

/**
 * The energy pulse at NEX idle time `time`: the wavefront's radius (NEX-local units) and strength,
 * and the core glow's swell (0 … 1) as the pulse is released. Pure.
 */
export function pulseAt(time: number, out: { radius: number; strength: number; swell: number }) {
  const t = ((time % PULSE.period) + PULSE.period) % PULSE.period;
  const travel = t / PULSE.travel;
  if (travel < 1) {
    // Eased outward travel; the shell fades as it spreads (and is fully gone at the halo).
    const eased = 1 - (1 - travel) ** 2;
    out.radius = eased * PULSE.reach;
    // A short fade-in (no pop at the core), then it fades as it spreads.
    out.strength = PULSE.strength * Math.min(1, travel * 8) * (1 - travel) ** 1.5;
  } else {
    out.radius = 0;
    out.strength = 0;
  }
  // The glow swells over the first 0.8 s (a smooth bump, 0 at both ends).
  out.swell = t < 0.8 ? Math.sin((Math.PI * t) / 0.8) ** 2 : 0;
  return out;
}

/**
 * Frame-rate-independent exponential approach of `current` towards `target` over `dt` seconds.
 * Settles exactly on the target once within `epsilon`, so a rest state is exactly reached.
 */
export function damp(
  current: number,
  target: number,
  dt: number,
  seconds: number,
  epsilon = 1e-4,
): number {
  const next = current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / seconds));
  return Math.abs(target - next) < epsilon ? target : next;
}
