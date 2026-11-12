import { createRandom } from "../../ambient/particles";
import type { AgentShape } from "../types";

/**
 * The diagnostic TEST shape (Milestone 2.4b.2, `?morph=test` only): two interlocking tori, a
 * gyroscope deliberately unlike NEX, so a morph between them is unmistakable. Pure and seeded.
 *
 * Layout (the shared AgentCore layout, as NEX's): positions N × 3 in the particle's orbit frame,
 * orbits N × 1 (the frame index: 0 or 1; role 0), seeds N × 4 in [0, 1).
 *
 * Ordering: consecutive blocks of 32 particles alternate between the two tori, and the points on
 * each torus follow the R2 low-discrepancy sequence, so any prefix (the adaptive-quality draw
 * range) is an even sample of both.
 */

export const TEST_SEED = 0x74657374;
export const TEST_FRAMES = 2;
export const TEST_BLOCK = 32;
/** Torus radii (local units; NEX's ring cage is ≈ 0.76). */
export const TEST_MAJOR = 0.56;
export const TEST_MINOR = 0.15;

/** The plastic number's reciprocals: the R2 sequence's two increments. */
const G = 1.324717957244746;
const A1 = 1 / G;
const A2 = 1 / (G * G);

export function generateTestShape(count: number, seed = TEST_SEED): AgentShape {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 3);
  const orbits = new Float32Array(count);
  const seeds = new Float32Array(count * 4);
  const perFrame = [0, 0];
  for (let i = 0; i < count; i++) {
    const frame = Math.floor(i / TEST_BLOCK) % TEST_FRAMES;
    const k = perFrame[frame]!++;
    const u = (0.5 + A1 * k) % 1;
    const v = (0.5 + A2 * k) % 1;
    const theta = 2 * Math.PI * u;
    const phi = 2 * Math.PI * v;
    const ring = TEST_MAJOR + TEST_MINOR * Math.cos(phi);
    positions[i * 3] = ring * Math.cos(theta);
    positions[i * 3 + 1] = TEST_MINOR * Math.sin(phi);
    positions[i * 3 + 2] = ring * Math.sin(theta);
    orbits[i] = frame;
    for (let c = 0; c < 4; c++) seeds[i * 4 + c] = random();
  }
  return { positions, orbits, seeds };
}
