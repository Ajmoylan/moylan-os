import type { Vector3 } from "three";
import type { AgentId } from "~/agents/registry";
import type { EffectiveMotion } from "~/motion/policy";
import type { Engine, FrameLayer } from "../engine/Engine";
import type { StageInteraction } from "../flow/interaction";

/**
 * The WebGL side of an agent (Milestone 2.4b.1a, Shared AgentCore). The DOM side (name, colours,
 * copy, route) is `src/agents/registry.ts`, the single source of truth that these definitions read
 * their palette from. Named `AgentRenderDefinition` so it is never confused with the registry's
 * `AgentDefinition`.
 */

/** One agent shape: N particles in the shared layout (positions N×3, orbits N×1, seeds N×4). */
export interface AgentShape {
  positions: Float32Array;
  orbits: Float32Array;
  seeds: Float32Array;
}

/**
 * How an agent's orbit frames reach its shaders: the approved uniform arrays, or (Milestone
 * 2.4b.1b) an RGBA32F table read with `texelFetch` (core/orbits/).
 */
export type OrbitTransport = "uniforms" | "texture";

export interface AgentTransports {
  /** Supported idle transports, in order of preference. */
  idle: readonly OrbitTransport[];
  /** Vertex-uniform vectors of the idle point program per transport (measured). */
  uniformVectors: Partial<Record<OrbitTransport, number>>;
}

/** Linear colour values as uploaded today (`rgb()` of the hex tokens): one shared set per stage. */
export interface AgentColours {
  deep: Vector3;
  accent: Vector3;
  hot: Vector3;
}

/** Discrete inputs from the Stage (ADR-007), forwarded on change. */
export interface AgentViewProps {
  /** Particle count N for the tier (fixed per tier, equal for every agent shape). */
  particles: number;
  /** Adapted share drawn (Stage-owned quality state, shared with the ambient field). */
  particleShare: number;
  /** Tier 3: a faint duplicate point layer gives a bloom-like glow (ARCHITECTURE §6.3). */
  glowLayer: boolean;
  motion: EffectiveMotion;
  /** Current route: the agent's anchor is looked up again after every navigation. */
  path: string;
}

/** What AgentCore lends an agent's view for its lifetime. */
export interface AgentViewContext {
  /** The stage element: agent state is published on it as data attributes. */
  stage: HTMLElement;
  /** The shared cursor-interaction substrate (ADR-004), written by the flow simulation. */
  interaction: StageInteraction;
  /** The agent's colours, owned by the Stage-lifetime `StageTransition` (ADR-007). */
  colours: AgentColours;
  /** The agent's shape for N particles, from the Stage-lifetime shape cache (synchronous). */
  shape(count: number): AgentShape;
  /** The orbit transport AgentCore selected for this context (fixed for the view's lifetime). */
  orbitTransport: OrbitTransport;
}

/**
 * An agent's renderer as hosted by AgentCore: its exact idle programs, scene objects and per-frame
 * logic. `phase` is kept so a view stays a valid engine layer on its own (its unit tests).
 */
export interface AgentView extends FrameLayer {
  setProps(props: AgentViewProps): boolean;
  /** The published visibility state ("hidden" | "visible"), or "" before the first frame. */
  readonly state: string;
}

export interface AgentRenderDefinition {
  id: AgentId;
  /** Bumped whenever the generator or its parameters change (part of the shape-cache key). */
  version: number;
  /** The generator seed the approved shape is made with. */
  seed: number;
  /** Synchronous generation (agreed contract; resumable jobs are deferred to M2.5). */
  generate(count: number, seed: number): AgentShape;
  transports: AgentTransports;
  /** WebGL-only highlight colour; base and accent always come from the registry. */
  hotOverride: string;
  createView(engine: Engine, context: AgentViewContext): AgentView;
}
