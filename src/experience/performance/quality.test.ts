import { describe, expect, it } from "vitest";
import { tierSettings } from "../ambient/config";
import {
  FULL_QUALITY,
  MIN_DPR,
  MIN_PARTICLE_SHARE,
  drawCount,
  dprRange,
  lowerOf,
  pixelLimitedDpr,
  resolveDprCap,
  stepDown,
  type Quality,
} from "./quality";
import { resolveDpr } from "../engine/Engine";

/** The renderer's DPR for a device ratio and a range, as the stage engine resolves it. */
const resolved = (device: number, range: [number, number]) => resolveDpr(range, device);

describe("stepDown (quality ladder)", () => {
  it("lowers the DPR first, then halves the particles, then stops", () => {
    let quality: Quality = FULL_QUALITY;
    const tier = tierSettings[3];
    const steps = [];
    for (;;) {
      const current = resolved(2, dprRange(resolveDprCap(tier.dprCap, quality, Infinity)));
      const next = stepDown(quality, current);
      if (!next) break;
      quality = lowerOf(quality, next);
      steps.push({
        dpr: resolved(2, dprRange(resolveDprCap(tier.dprCap, quality, Infinity))),
        particles: drawCount(tier.particles, quality.particleShare),
      });
    }
    expect(steps).toEqual([
      { dpr: 1.5, particles: 12_000 },
      { dpr: 1, particles: 12_000 },
      { dpr: 1, particles: 6_000 },
      { dpr: 1, particles: 12_000 * MIN_PARTICLE_SHARE },
    ]);
  });

  it("starts from the DPR actually in use: a 1× display goes straight to particles", () => {
    expect(stepDown(FULL_QUALITY, 1)).toEqual({ dprCap: Infinity, particleShare: 0.5 });
    expect(stepDown(FULL_QUALITY, 1.375)).toEqual({ dprCap: 1, particleShare: 1 });
  });

  it("returns null at the lowest quality", () => {
    expect(stepDown({ dprCap: 1, particleShare: MIN_PARTICLE_SHARE }, 1)).toBeNull();
  });
});

describe("lowerOf", () => {
  it("never raises quality, so a late or repeated step can't undo a later one", () => {
    const low = { dprCap: 1, particleShare: 0.25 };
    expect(lowerOf(low, { dprCap: 1.5, particleShare: 1 })).toBe(low);
    expect(
      lowerOf({ dprCap: 1.5, particleShare: 1 }, { dprCap: Infinity, particleShare: 0.5 }),
    ).toEqual({ dprCap: 1.5, particleShare: 0.5 });
  });
});

describe("adapted quality survives tier changes", () => {
  it("re-derives the draw count and DPR cap for whichever tier is active", () => {
    const quality = { dprCap: 1, particleShare: MIN_PARTICLE_SHARE };
    for (const tier of [3, 1, 3, 2] as const) {
      const settings = tierSettings[tier];
      expect(drawCount(settings.particles, quality.particleShare)).toBe(
        settings.particles * MIN_PARTICLE_SHARE,
      );
      expect(resolveDprCap(settings.dprCap, quality, Infinity)).toBe(1);
    }
  });
});

describe("backing-pixel limit", () => {
  it("leaves typical displays at their tier cap", () => {
    // 16" laptop at 2×, 1080p monitor, phone at 1.5× cap.
    expect(pixelLimitedDpr(1728, 1117, tierSettings[3].maxPixels)).toBeGreaterThanOrEqual(2);
    expect(pixelLimitedDpr(1920, 1080, tierSettings[3].maxPixels)).toBeGreaterThanOrEqual(2);
    expect(pixelLimitedDpr(430, 932, tierSettings[2].maxPixels)).toBeGreaterThanOrEqual(1.5);
  });

  it("lowers the DPR on very large canvases so the buffer fits the limit", () => {
    const { maxPixels } = tierSettings[3];
    const dpr = pixelLimitedDpr(2560, 1440, maxPixels); // 27" 5K display
    expect(dpr).toBe(1.5);
    expect(2560 * 1440 * dpr * dpr).toBeLessThanOrEqual(maxPixels);
    expect(resolveDprCap(2, FULL_QUALITY, dpr)).toBe(1.5);
  });

  it("can go below 1× on low tiers, but never below MIN_DPR", () => {
    const dpr = pixelLimitedDpr(2560, 1440, tierSettings[1].maxPixels);
    expect(dpr).toBe(0.75);
    expect(dprRange(dpr)).toEqual([0.75, 0.75]);
    expect(pixelLimitedDpr(100_000, 100_000, tierSettings[1].maxPixels)).toBe(MIN_DPR);
  });

  it("uses the device ratio within [1, cap] when the cap is at least 1", () => {
    expect(dprRange(2)).toEqual([1, 2]);
    expect(resolved(3, dprRange(2))).toBe(2);
    expect(resolved(1, dprRange(2))).toBe(1);
  });
});
