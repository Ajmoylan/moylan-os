/**
 * Light in a morph (Milestone 2.4b.2, stage-D luminance decision: Option 1 with the smooth onset): brightness
 * follows the **linear** phase in **linear light**, while movement keeps the approved eased curve.
 * Allocation-free helpers, shared by AgentCore and the views.
 *
 * - **Encoding.** The stage's shaders write sRGB-encoded values, blended additively; the display
 *   decodes them. Scaling an encoded contribution by `k` scales its light by about `k^2.2`, so a
 *   contribution meant to carry `presence` of its light is drawn with `presence^(1/2.2)`.
 * - **Onset.** The light progress leaves phase 0 (and reaches phase 1) with zero slope and
 *   curvature over the first and last `LIGHT_EDGE` of the phase, so the first and last animated
 *   frames continue the endpoints; it is exactly the linear phase everywhere in between.
 */
export const DISPLAY_GAMMA = 2.2;
/** Width of the smooth light onset at each end of the phase. */
export const LIGHT_EDGE = 0.05;

/** The encoded multiplier that gives `presence` (linear light, 0 … 1) of a contribution's light. */
export function encodedPresence(presence: number): number {
  if (presence <= 0) return 0;
  if (presence >= 1) return 1;
  return Math.pow(presence, 1 / DISPLAY_GAMMA);
}

/**
 * The light progress at `phase`: the phase itself on [LIGHT_EDGE, 1 − LIGHT_EDGE]; at each end a
 * quartic f(x) = e·(3x³ − 2x⁴), x = phase / e (mirrored at 1), with f = f' = f'' = 0 at the end and
 * value and slope matching the linear phase at e.
 */
export function lightProgress(phase: number): number {
  const e = LIGHT_EDGE;
  if (phase <= 0) return 0;
  if (phase >= 1) return 1;
  if (phase < e) {
    const x = phase / e;
    return e * x * x * x * (3 - 2 * x);
  }
  if (phase > 1 - e) {
    const x = (1 - phase) / e;
    return 1 - e * x * x * x * (3 - 2 * x);
  }
  return phase;
}
