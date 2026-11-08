/**
 * Pure flow-map policy (ADR-004), kept free of Three.js so it is unit-tested directly.
 */

export type FlowFormat = "half-float" | "rgba8" | "analytic";

/**
 * Render-target fallback order: half-float (needs EXT_color_buffer_half_float or
 * EXT_color_buffer_float) → RGBA8 → analytic (no render target). `isUsable` validates a candidate
 * (render, sample, filter and read back; see probe.ts) and allocates its targets; it is called
 * lazily, so later candidates are never probed or allocated once one works.
 */
export function selectFlowFormat(
  hasHalfFloatExtension: boolean,
  isUsable: (format: Exclude<FlowFormat, "analytic">) => boolean,
): FlowFormat {
  if (hasHalfFloatExtension && isUsable("half-float")) return "half-float";
  if (isUsable("rgba8")) return "rgba8";
  return "analytic";
}

/** Longest frame step the simulation will take (avoids jumps after a stall or a hidden tab). */
export const MAX_STEP_SECONDS = 0.1;

/**
 * Frame-rate-independent dissipation: `perFrameAt60` is the decay per 60 Hz frame; the result is
 * pow(d, Δt·60) with Δt clamped, so the flow fades at the same speed at 30, 60 or 120 fps.
 */
export function dissipationFor(perFrameAt60: number, dt: number): number {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS);
  return Math.pow(perFrameAt60, step * 60);
}
