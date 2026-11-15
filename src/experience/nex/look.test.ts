import { describe, expect, it } from "vitest";
import {
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
