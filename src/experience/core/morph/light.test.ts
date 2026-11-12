import { describe, expect, it } from "vitest";
import { encodedPresence, LIGHT_EDGE, lightProgress } from "./light";

/** The morph's light helpers (stage-D luminance decision: Option 1 with the smooth onset). */

describe("lightProgress", () => {
  it("is exactly 0 and 1 at the ends and exactly the phase between the onsets", () => {
    expect(lightProgress(0)).toBe(0);
    expect(lightProgress(1)).toBe(1);
    for (let p = LIGHT_EDGE; p <= 1 - LIGHT_EDGE + 1e-9; p += 0.05)
      expect(lightProgress(p)).toBeCloseTo(p, 12);
  });

  it("leaves each end with zero slope and joins the phase with matching value and slope", () => {
    const d = (f: (x: number) => number, x: number) => (f(x + 1e-6) - f(x - 1e-6)) / 2e-6;
    expect(d(lightProgress, 1e-5)).toBeLessThan(1e-3);
    expect(d(lightProgress, 1 - 1e-5)).toBeLessThan(1e-3);
    expect(d(lightProgress, LIGHT_EDGE)).toBeCloseTo(1, 4);
    expect(d(lightProgress, 1 - LIGHT_EDGE)).toBeCloseTo(1, 4);
    expect(lightProgress(LIGHT_EDGE / 4)).toBeLessThan(LIGHT_EDGE / 4);
  });

  it("is monotonic and symmetric", () => {
    let last = 0;
    for (let i = 1; i <= 1000; i++) {
      const v = lightProgress(i / 1000);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v + lightProgress(1 - i / 1000)).toBeCloseTo(1, 12);
      last = v;
    }
  });
});

describe("presence", () => {
  it("encodes linear-light presence for the display's gamma", () => {
    expect(encodedPresence(0)).toBe(0);
    expect(encodedPresence(1)).toBe(1);
    expect(encodedPresence(0.5) ** 2.2).toBeCloseTo(0.5, 12);
  });
});
