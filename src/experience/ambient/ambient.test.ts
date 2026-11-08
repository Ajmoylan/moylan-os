import { describe, expect, it } from "vitest";
import { ambientLook, settingsForTier, tierSettings } from "./config";
import { SPAN_Y, WRAP_X, createRandom, generateParticles } from "./particles";

describe("tier settings (ARCHITECTURE §9.2)", () => {
  it("follow the ambient and NEX counts, DPR caps, flow-map sizes and pixel limits of the tier table", () => {
    expect(tierSettings).toEqual({
      1: {
        particles: 2_000,
        dprCap: 1,
        flowSize: 64,
        maxPixels: 1920 * 1080,
        nex: { particles: 12_000, glowLayer: false },
      },
      2: {
        particles: 6_000,
        dprCap: 1.5,
        flowSize: 128,
        maxPixels: 2560 * 1440,
        nex: { particles: 30_000, glowLayer: false },
      },
      3: {
        particles: 12_000,
        dprCap: 2,
        flowSize: 256,
        maxPixels: 3840 * 2160,
        nex: { particles: 30_000, glowLayer: true },
      },
    });
  });

  it("never asks for more than tier 1 when given tier 0 (defensive; tier 0 never renders)", () => {
    expect(settingsForTier(0)).toBe(tierSettings[1]);
  });

  it("keeps the look restrained and in the NEX palette", () => {
    expect(ambientLook.palette).toEqual({ base: "#14a89c", accent: "#3fe0d0", hot: "#c9fbf5" });
    expect(ambientLook.brightness).toBeLessThanOrEqual(1);
    expect(ambientLook.cursor.dissipation).toBeLessThan(1);
  });
});

describe("generateParticles", () => {
  it("creates one position (xyz) and four seeds per particle", () => {
    const { base, seed } = generateParticles(500);
    expect(base).toHaveLength(1500);
    expect(seed).toHaveLength(2000);
  });

  it("is deterministic, so every visit shows the same composition", () => {
    expect(generateParticles(200)).toEqual(generateParticles(200));
    expect(generateParticles(200, 1)).not.toEqual(generateParticles(200, 2));
  });

  it("keeps positions inside the wrap span and depths and seeds in [0, 1)", () => {
    const { base, seed } = generateParticles(2_000);
    for (let i = 0; i < 2_000; i++) {
      expect(Math.abs(base[i * 3]!)).toBeLessThanOrEqual(WRAP_X);
      expect(Math.abs(base[i * 3 + 1]!)).toBeLessThanOrEqual(SPAN_Y);
      expect(base[i * 3 + 2]).toBeGreaterThanOrEqual(0);
      expect(base[i * 3 + 2]).toBeLessThan(1);
    }
    expect(seed.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("puts most particles far away (depth biased towards 0) for atmospheric depth", () => {
    const { base } = generateParticles(4_000);
    let far = 0;
    for (let i = 0; i < 4_000; i++) if (base[i * 3 + 2]! < 0.5) far++;
    expect(far / 4_000).toBeGreaterThan(0.6);
  });

  it("uses a well-distributed PRNG", () => {
    const random = createRandom(42);
    const values = Array.from({ length: 10_000 }, random);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});
