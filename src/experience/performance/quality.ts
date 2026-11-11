/**
 * Adaptive quality (ARCHITECTURE §9.2, runtime adaptation). Pure functions, unit-tested directly.
 *
 * `Quality` records only the *reductions* the frame monitor has made during this stage's
 * lifetime. It is the single source of truth, held as low-frequency React state in the Stage
 * (ADR-007: it changes at most a handful of times per visit, never per frame), and everything
 * else is derived from it on every render:
 *
 *   renderer DPR  = min(tier DPR cap, adapted DPR cap, backing-pixel limit), via the engine's DPR range
 *   drawn count   = tier particle count × adapted particle share, via the geometry draw range
 *
 * Because the engine's DPR range *is* the adapted value, re-applying it on a re-render (route,
 * visibility or motion change) or on a display/zoom change can no longer undo an adaptation, and a
 * tier change re-derives the draw range for the new geometry.
 */

export interface Quality {
  /** Highest DPR the stage may use (∞ until the monitor first lowers it). */
  dprCap: number;
  /** Share of the tier's particles drawn (1 until the monitor lowers it). */
  particleShare: number;
}

export const FULL_QUALITY: Quality = { dprCap: Number.POSITIVE_INFINITY, particleShare: 1 };

export const MIN_PARTICLE_SHARE = 0.25;

/** Lowest DPR the backing-pixel limit may impose (points stay sized by DPR, so they stay soft). */
export const MIN_DPR = 0.5;

/** Backing-pixel limit DPRs are floored to this step, so window resizes re-render rarely. */
export const DPR_STEP = 0.125;

/**
 * Quality step-down ladder: first the DPR (−0.5 per step, not below 1), then halve the share of
 * particles drawn (not below MIN_PARTICLE_SHARE). `currentDpr` is the ratio the renderer is
 * actually using, so a display that is already at 1× goes straight to particles. Returns null at
 * the bottom of the ladder.
 */
export function stepDown(quality: Quality, currentDpr: number): Quality | null {
  if (currentDpr > 1) return { ...quality, dprCap: Math.max(1, currentDpr - 0.5) };
  if (quality.particleShare > MIN_PARTICLE_SHARE) {
    return { ...quality, particleShare: Math.max(MIN_PARTICLE_SHARE, quality.particleShare / 2) };
  }
  return null;
}

/** Quality only ever goes down within a stage's lifetime, even if a step arrives late. */
export function lowerOf(a: Quality, b: Quality): Quality {
  const next = {
    dprCap: Math.min(a.dprCap, b.dprCap),
    particleShare: Math.min(a.particleShare, b.particleShare),
  };
  return next.dprCap === a.dprCap && next.particleShare === a.particleShare ? a : next;
}

/**
 * Largest DPR that keeps the drawing buffer within `maxPixels` backing pixels for a
 * `width` × `height` CSS-pixel canvas, floored to DPR_STEP and not below MIN_DPR.
 */
export function pixelLimitedDpr(width: number, height: number, maxPixels: number): number {
  const area = Math.max(1, width) * Math.max(1, height);
  const limit = Math.floor(Math.sqrt(maxPixels / area) / DPR_STEP) * DPR_STEP;
  return Math.max(MIN_DPR, limit);
}

/** The DPR cap the renderer uses: the lowest of the tier cap, the adaptation and the pixel limit. */
export function resolveDprCap(tierCap: number, quality: Quality, pixelLimit: number): number {
  return Math.min(tierCap, quality.dprCap, pixelLimit);
}

/**
 * The engine's DPR range for a cap: the device ratio clamped to [1, cap], or exactly `cap` when the cap
 * is below 1 (very large canvases on low tiers).
 */
export function dprRange(cap: number): [number, number] {
  return [Math.min(1, cap), cap];
}

/** Particles drawn for a tier count and an adapted share. */
export function drawCount(particles: number, particleShare: number): number {
  return Math.floor(particles * particleShare);
}
