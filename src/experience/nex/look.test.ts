import { describe, expect, it } from "vitest";
import {
  CURIOSITY,
  GLANCE,
  EXCITE,
  approached,
  calmExcitement,
  createExcitement,
  curiosityRoll,
  excite,
  exciteStep,
  glanceAt,
  CORE_LEAN_UNITS,
  LOOK_SPRING,
  PULSE,
  pulseAt,
  spring,
  damp,
  leanTarget,
  lookTarget,
  LOOK_GAIN,
  LOOK_MAX_PITCH,
  LOOK_MAX_YAW,
  type Look,
} from "./look";
import { NEX_PARAMS, NEX_SHELL_RADIUS } from "./params";

describe("NEX's look towards the cursor (launch sprint)", () => {
  const out: Look = { yaw: 0, pitch: 0 };

  it("turns towards the cursor: right → positive yaw, above → negative pitch", () => {
    lookTarget(0.25, 0.25, 0, 0, 1, out);
    expect(out.yaw).toBeCloseTo(0.25 * LOOK_GAIN);
    expect(out.pitch).toBeCloseTo(-0.25 * LOOK_GAIN);
    lookTarget(-0.5, -0.5, 0, 0, 1, out);
    expect(out.yaw).toBeLessThan(0);
    expect(out.pitch).toBeGreaterThan(0);
  });

  it("is relative to NEX's own position and corrected for the aspect ratio", () => {
    lookTarget(0.6, 0.2, 0.6, 0.2, 1.5, out);
    expect(out).toEqual({ yaw: 0, pitch: -0 });
    lookTarget(0.2, 0, 0, 0, 2, out);
    expect(out.yaw).toBeCloseTo(0.2 * 2 * LOOK_GAIN);
  });

  it("is noticeable but bounded, however far the cursor", () => {
    lookTarget(1, -1, -1, 1, 2, out);
    expect(out.yaw).toBe(LOOK_MAX_YAW);
    expect(out.pitch).toBe(LOOK_MAX_PITCH);
    expect(LOOK_MAX_YAW).toBeGreaterThan(0.5); // > 28°: clearly visible
    expect(LOOK_MAX_YAW).toBeLessThan(0.6); // < 35°
    expect(LOOK_MAX_PITCH).toBeLessThan(0.4); // < 23°
  });

  it("core lean: towards the cursor, growing with distance, at most 1 (CORE_LEAN of the radius)", () => {
    const lean = { x: 0, y: 0 };
    leanTarget(0.1, 0, 0, 0, 1, lean);
    expect(lean.x).toBeGreaterThan(0);
    expect(lean.x).toBeLessThan(1);
    expect(lean.y).toBe(0);
    leanTarget(-2, 2, 0, 0, 1, lean);
    expect(Math.hypot(lean.x, lean.y)).toBeCloseTo(1);
    expect(lean.x).toBeLessThan(0);
    expect(lean.y).toBeGreaterThan(0);
    leanTarget(0.3, 0.3, 0.3, 0.3, 1.5, lean);
    expect(lean).toEqual({ x: 0, y: 0 });
  });

  it("core lean is clearly visible (≈ 16 % of NEX's radius) and stays well inside the rings", () => {
    const share = CORE_LEAN_UNITS / NEX_SHELL_RADIUS;
    expect(share).toBeGreaterThanOrEqual(0.14);
    expect(share).toBeLessThanOrEqual(0.18);
    const coreReach = NEX_PARAMS.coreRadius * 1.22 * 1.1; // the shell sphere, fully breathed
    const innermostRing = Math.min(
      ...NEX_PARAMS.rings.flatMap((ring) => ring.bands.map(([r]) => r)),
    );
    expect(coreReach + CORE_LEAN_UNITS).toBeLessThan(innermostRing * 0.9); // inside the innermost band
  });

  it("damps frame-rate independently and settles exactly", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 1 / 60, 0.5);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 1 / 30, 0.5);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeCloseTo(1 - Math.exp(-2), 6);
    let c = 1;
    for (let i = 0; i < 600; i++) c = damp(c, 0, 1 / 60, 0.5);
    expect(c).toBe(0);
    expect(damp(0.3, 0.3, 0.016, 0.5)).toBe(0.3);
    expect(damp(0.3, 1, 0, 0.5)).toBe(0.3);
  });
});

describe("organic motion and the energy pulse", () => {
  it("the spring eases in (no jolt), settles exactly, and is frame-rate independent", () => {
    const a = { x: 0, v: 0 };
    spring(a, 1, 1 / 60, LOOK_SPRING);
    expect(a.x).toBeLessThan(0.02); // a gentle start, not an instant jump
    for (let i = 0; i < 59; i++) spring(a, 1, 1 / 60, LOOK_SPRING);
    const b = { x: 0, v: 0 };
    for (let i = 0; i < 30; i++) spring(b, 1, 1 / 30, LOOK_SPRING);
    expect(a.x).toBeCloseTo(b.x, 3);
    let peak = 0;
    for (let i = 0; i < 600; i++) peak = Math.max(peak, spring(a, 1, 1 / 60, LOOK_SPRING));
    expect(peak).toBeLessThan(1.05); // at most a slight, natural settle
    expect(a).toEqual({ x: 1, v: 0 });
    for (let i = 0; i < 900; i++) spring(a, 0, 1 / 60, LOOK_SPRING);
    expect(a).toEqual({ x: 0, v: 0 });
  });

  it("the pulse leaves the core, travels to the halo and fades, once per half breath", () => {
    const out = { radius: 0, strength: 0, swell: 0 };
    pulseAt(0, out);
    expect(out).toEqual({ radius: 0, strength: 0, swell: 0 }); // nothing at the very start
    pulseAt(0.4, out);
    expect(out.radius).toBeGreaterThan(0);
    expect(out.strength).toBeGreaterThan(0.5);
    expect(out.swell).toBeGreaterThan(0.5); // the core glow swells as it is released
    const early = out.strength;
    pulseAt(PULSE.travel * 0.8, out);
    expect(out.radius).toBeGreaterThan(0.9);
    expect(out.strength).toBeLessThan(early);
    pulseAt(PULSE.travel + 0.1, out);
    expect(out.strength).toBe(0);
    pulseAt(PULSE.period + 0.4, out);
    expect(out.strength).toBeCloseTo(early); // it repeats
    expect(PULSE.period * 2).toBeCloseTo(NEX_PARAMS.breath.period); // in step with the breathing
  });
});

describe("Personality 2.0 and 2.1 helpers", () => {
  it("curiosity tilts towards the pointer's side, bounded, and not at all without dwelling", () => {
    expect(curiosityRoll(0.5, 1)).toBeLessThan(0); // pointer on the right: clockwise
    expect(curiosityRoll(-0.5, 1)).toBeGreaterThan(0);
    expect(Math.abs(curiosityRoll(5, 1))).toBeCloseTo(CURIOSITY.roll, 10);
    expect(curiosityRoll(0.5, 0)).toBe(-0); // a moving pointer: no tilt
  });

  /** Runs an excitement at 60 fps from `clock` for `seconds`; returns what was seen. */
  const run = (e = createExcitement(), seconds = 4, clock = 0) => {
    let peakSpeed = 0;
    let furthest = 0;
    let highest = 0;
    let lowest = 0;
    let firstFrame = 0;
    for (let i = 1; i <= seconds * 60; i++) {
      exciteStep(e, clock + i / 60, 1 / 60);
      if (i === 1) firstFrame = e.spin.x;
      peakSpeed = Math.max(peakSpeed, Math.abs(e.spin.v));
      furthest = Math.max(furthest, e.spin.x);
      highest = Math.max(highest, e.hop.x);
      lowest = Math.min(lowest, e.hop.x);
    }
    return { e, peakSpeed, furthest, highest, lowest, firstFrame };
  };

  it("excitement: one clearly visible spin that eases in, settles naturally and ends at rest", () => {
    const e = createExcitement();
    expect(excite(e, 0)).toBe(true);
    const seen = run(e, 6);
    expect(seen.firstFrame).toBeLessThan(0.001); // eases in: no jolt
    expect(seen.peakSpeed).toBeGreaterThan(6); // lively, clearly visible
    expect(seen.peakSpeed).toBeLessThan(11); // never a frantic whirl (≤ 1.75 turns a second)
    const overshoot = seen.furthest - 2 * Math.PI;
    expect(overshoot).toBeGreaterThan(0.05); // a natural settle…
    expect(overshoot).toBeLessThan(0.3); // …not a wobble
    // A hop: up (a lift of ≈ 8 %), a small dip, then back.
    expect(seen.highest * EXCITE.lift).toBeGreaterThan(0.06);
    expect(seen.highest * EXCITE.lift).toBeLessThan(0.1);
    expect(seen.lowest).toBeGreaterThan(-0.06);
    // Exactly at rest afterwards: whole turns dropped, the same pose as before.
    expect(e).toEqual(Object.assign(createExcitement(), { start: 0 }));
  });

  it("excitement never stacks: a new spin waits until the current one has nearly settled", () => {
    const e = createExcitement();
    excite(e, 0);
    exciteStep(e, 0.5, 0.5);
    expect(excite(e, 0.5)).toBe(false); // mid-turn
    expect(e.to).toBeCloseTo(2 * Math.PI, 10);
    run(e, 3, 0.5);
    expect(excite(e, 3.6)).toBe(true); // settled: ready again
    calmExcitement(e);
    expect(e).toEqual(createExcitement()); // Reduced Motion, a morph: at rest at once
  });

  it("an approach counts once, and again only after the pointer has really left", () => {
    const state = { armed: true };
    expect(approached(state, 5)).toBe(false);
    expect(approached(state, EXCITE.near - 0.1)).toBe(true);
    for (const d of [0.2, 1, EXCITE.near + 0.1, EXCITE.far - 0.1, 0.5]) {
      expect(approached(state, d)).toBe(false); // resting or hovering nearby: no repeat
    }
    approached(state, EXCITE.far + 0.1); // left
    expect(approached(state, 1)).toBe(true);
    expect(approached({ armed: true }, Infinity)).toBe(false); // no (or a touch) pointer
  });

  it("idle glances are occasional, bounded and deterministic", () => {
    const out = { yaw: 0, pitch: 0 };
    let glancing = 0;
    let samples = 0;
    for (let t = 0; t < 10 * GLANCE.every; t += 0.05, samples++) {
      glanceAt(t, out);
      if (t < GLANCE.every) expect(out).toEqual({ yaw: 0, pitch: 0 }); // never straight away
      if (out.yaw !== 0) glancing++;
      expect(Math.abs(out.yaw)).toBeLessThanOrEqual(GLANCE.yaw);
      expect(Math.abs(out.pitch)).toBeLessThanOrEqual(GLANCE.pitch);
    }
    // About one glance of GLANCE.hold seconds per cycle after the first: occasional, not constant.
    expect(glancing / samples).toBeGreaterThan(0.1);
    expect(glancing / samples).toBeLessThan(0.2);
    const a = glanceAt(30.3, { yaw: 0, pitch: 0 });
    expect(glanceAt(30.3, { yaw: 0, pitch: 0 })).toEqual(a);
  });
});
