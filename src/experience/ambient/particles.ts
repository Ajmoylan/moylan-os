/**
 * Deterministic particle attributes for the ambient field. Pure (no Three.js), so it is unit-
 * tested and could later move to a Web Worker. Generated once per tier; the GPU animates
 * everything from these attributes, so nothing is uploaded per frame.
 */

/** Horizontal wrap span in normalised device coordinates (slightly wider than the screen). */
export const WRAP_X = 1.15;
export const SPAN_Y = 1.1;

export interface ParticleAttributes {
  /** xyz per particle: x in [-WRAP_X, WRAP_X], y in [-SPAN_Y, SPAN_Y], depth in [0, 1]. */
  base: Float32Array;
  /** Four seeds per particle in [0, 1): phase, speed, size, brightness/highlight. */
  seed: Float32Array;
}

/** Small, fast, seedable PRNG (mulberry32), so every visit shows the same composition. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateParticles(count: number, seed = 0x6d6f796c): ParticleAttributes {
  const random = createRandom(seed);
  const base = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (random() * 2 - 1) * WRAP_X;
    base[i * 3 + 1] = (random() * 2 - 1) * SPAN_Y;
    // Most particles sit far away (small, dim, slow); a few drift close (larger, brighter).
    base[i * 3 + 2] = Math.pow(random(), 1.7);
    seeds[i * 4] = random();
    seeds[i * 4 + 1] = random();
    seeds[i * 4 + 2] = random();
    seeds[i * 4 + 3] = random();
  }
  return { base, seed: seeds };
}
