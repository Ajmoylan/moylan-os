import { Vector2, type Texture } from "three";
import { FLOW_RANGE } from "./FlowField";
import type { FlowFormat } from "./policy";

/**
 * The stage's single cursor-interaction substrate (ADR-004), shared by every layer that reacts
 * to the pointer: the ambient field now, NEX and the specialist agents later.
 *
 * One owner (`FlowSimulation`, the engine's simulate phase) attaches the only `PointerTracker`,
 * runs the only `FlowField` simulation and writes this object once per frame, before any consumer
 * updates. Every consumer copies it into its own uniforms with `syncInteraction()` and samples it
 * in GLSL with `sampleFlow()` (FLOW_GLSL), so the flow-map decoding and the analytic fallback exist
 * exactly once. Mutable fields only:
 * nothing here touches React or Zustand state (ADR-007).
 *
 * Mode "none" (motion reduced or off, or pointer effects unavailable) means no flow map, no
 * listener and zeroed uniforms in every consumer.
 */
export interface StageInteraction {
  mode: FlowFormat | "none";
  /** The current flow velocity field (flow-map modes only). */
  texture: Texture | null;
  /** Analytic fallback: pointer position (NDC) and smoothed velocity (NDC units per second). */
  pointer: Vector2;
  velocity: Vector2;
  /** Splat radius in UV units (fraction of the viewport height). */
  radius: number;
}

export function createInteraction(radius: number): StageInteraction {
  return { mode: "none", texture: null, pointer: new Vector2(), velocity: new Vector2(), radius };
}

/** Resets to "none": no texture, pointer and velocity at rest. */
export function clearInteraction(interaction: StageInteraction): void {
  interaction.mode = "none";
  interaction.texture = null;
  interaction.pointer.set(0, 0);
  interaction.velocity.set(0, 0);
}

/** The uniforms FLOW_GLSL reads. Spread into a material's uniforms; update with `syncInteraction`. */
export function interactionUniforms() {
  return {
    uFlowMode: { value: 0 },
    uFlow: { value: null as Texture | null },
    uFlowEncoded: { value: 0 },
    uFlowRange: { value: FLOW_RANGE },
    uPointer: { value: new Vector2() },
    uPointerVelocity: { value: new Vector2() },
    uPointerRadius: { value: 0.09 },
    uAspect: { value: 1 },
  };
}

export type InteractionUniforms = ReturnType<typeof interactionUniforms>;

/** Copy the shared interaction into a consumer's uniforms (no allocation). */
export function syncInteraction(
  u: InteractionUniforms,
  interaction: StageInteraction,
  aspect: number,
): void {
  const { mode } = interaction;
  const textured = (mode === "half-float" || mode === "rgba8") && interaction.texture !== null;
  const analytic = mode === "analytic";
  u.uFlowMode.value = textured ? 1 : analytic ? 2 : 0;
  u.uFlow.value = textured ? interaction.texture : null;
  u.uFlowEncoded.value = mode === "rgba8" ? 1 : 0;
  u.uPointerRadius.value = interaction.radius;
  u.uAspect.value = aspect;
  if (analytic) {
    u.uPointer.value.copy(interaction.pointer);
    u.uPointerVelocity.value.copy(interaction.velocity);
  } else {
    u.uPointer.value.set(0, 0);
    u.uPointerVelocity.value.set(0, 0);
  }
}

/**
 * GLSL: the shared cursor flow at a screen position (NDC), as a velocity in NDC units per
 * second: the decoded flow map (half-float, or RGBA8 encoded around 0.5), or the analytic
 * Gaussian falloff around the pointer when no render target is available, or zero.
 */
export const FLOW_GLSL = /* glsl */ `
uniform float uFlowMode;
uniform sampler2D uFlow;
uniform float uFlowEncoded;
uniform float uFlowRange;
uniform vec2 uPointer;
uniform vec2 uPointerVelocity;
uniform float uPointerRadius;
uniform float uAspect;

vec2 sampleFlow(vec2 ndc) {
  if (uFlowMode < 0.5) return vec2(0.0);
  if (uFlowMode < 1.5) {
    vec4 c = texture2D(uFlow, clamp(ndc * 0.5 + 0.5, 0.0, 1.0));
    return uFlowEncoded > 0.5 ? (c.xy - 0.5) * 2.0 * uFlowRange : c.xy;
  }
  vec2 d = ndc - uPointer;
  d.x *= uAspect;
  return uPointerVelocity * exp(-dot(d, d) / (4.0 * uPointerRadius * uPointerRadius));
}
`;
