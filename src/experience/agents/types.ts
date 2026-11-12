import type { IUniform, Object3D, Vector3 } from "three";
import type { AgentId } from "~/agents/registry";
import type { Palette } from "../ambient/config";
import type { EffectiveMotion } from "~/motion/policy";
import type { Engine, FrameLayer } from "../engine/Engine";
import type { StageInteraction } from "../flow/interaction";
import type { ParticleAttributes } from "../core/morphSlot";
import type { Placement, Rect } from "../nex/placement";
import type { AgentVisibility, StagePlacement } from "../transition/StageTransition";

/**
 * The WebGL side of an agent (Milestone 2.4b.1a, Shared AgentCore). The DOM side (name, colours,
 * copy, route) is `src/agents/registry.ts`, the single source of truth that these definitions read
 * their palette from. Named `AgentRenderDefinition` so it is never confused with the registry's
 * `AgentDefinition`.
 */

/**
 * The agents the stage can draw: the registry's agents, plus the diagnostic-only TEST shape of
 * Milestone 2.4b.2 (lazy-loaded behind `?morph=test`, never a registry agent or a public route).
 */
export type StageAgent = AgentId | "test";

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
  /**
   * The agent's visibility and placement, written by `TransitionClock` (the single transition
   * timeline) in the simulate phase, read by the view in the same frame (Milestone 2.4b.2).
   */
  visibility: Readonly<AgentVisibility>;
  placement: Readonly<StagePlacement>;
}

/**
 * An agent's renderer as hosted by AgentCore: its exact idle programs, scene objects and per-frame
 * logic. `phase` is kept so a view stays a valid engine layer on its own (its unit tests).
 */
/**
 * A view's part in a morph (Milestone 2.4b.2): `none` (its own idle rendering), `hidden` (built
 * while the morph is prepared, not drawn), `morph` (its particles are drawn by the morph program;
 * its overlays are scaled by its presence, 0 … 1). In `morph` a view keeps its own point layer in
 * the scene with its material hidden, so Three.js registers the geometry owning the buffers the
 * morph geometry uploads, and disposing the view releases them (none is orphaned).
 */
export type MorphRole = "none" | "hidden" | "morph";

export interface AgentView extends FrameLayer {
  setProps(props: AgentViewProps): boolean;
  /** The published visibility state ("hidden" | "visible"), or "" before the first frame. */
  readonly state: string;
  /**
   * The view's own particle attributes (it owns their GPU buffers), for a morph geometry to borrow
   * (core/morphSlot.ts); null before the first props. They change only when the particle count
   * does, and AgentCore releases any borrowing morph geometry before forwarding such a change.
   */
  particles(): ParticleAttributes | null;
  /**
   * The uniform objects its morph module reads for the morph's orbit transport (shared, so the
   * view's per-frame writes apply to the morph program too).
   */
  morphUniforms(transport: OrbitTransport): Record<string, IUniform>;
  /** For a slot-A agent: the group whose transform its morph module's `modelViewMatrix` assumes. */
  morphHost(): Object3D | null;
  /** The view's scene object: a destination's programs are compiled from it while preparing. */
  object(): Object3D;
  /** Its part in a morph; `formed`: draw as fully formed (a morph destination never arrives). */
  setMorphRole(role: MorphRole, presence: number, formed: boolean): void;
}

/**
 * An agent's part of a pair morph program (core/morph/program.ts). Slot A's module defines
 * `particleA(out vec4 clip, out float size, out vec3 color, out float alpha)` over `position`,
 * `aOrbit` and `aSeed` and its host's `modelViewMatrix`; slot B's defines `particleB(...)` over
 * `positionB`, `aOrbitB` and `aSeedB` with its own model-view uniform. The host agent (NEX) takes
 * slot A, so one program serves both directions of a pair.
 */
export interface AgentMorphModule {
  slot: "A" | "B";
  /** The module's GLSL for the given orbit transport (slot A) or its only transport (slot B). */
  module(transport: OrbitTransport): string;
}

/** An agent's appearance timing, applied by `TransitionClock` (seconds; pace scales its idle time). */
export interface AgentTiming {
  /** Arrival from the scattered shell to the formed shape. */
  arrival: number;
  /** Fade in and out with the agent's anchor (and the post-arrival overlay fade). */
  fade: number;
  /** Idle animation pace (1 = reference timing). */
  pace: number;
}

/**
 * Where the agent is drawn, computed by `TransitionClock` (pure functions writing into a
 * preallocated `Placement`):
 * - `anchor`: centred on the page's layout-only `[data-stage-anchor]` element (looked up again after
 *   every navigation; absent → the agent fades out);
 * - `fixed`: a deterministic viewport position with no DOM anchor (the test-only target of 2.4b.2;
 *   it never changes any page's layout).
 */
export type AgentPlacement =
  | {
      kind: "anchor";
      selector: string;
      place(
        rect: Rect,
        viewport: { width: number; height: number },
        fov: number,
        out: Placement,
      ): Placement;
    }
  | {
      kind: "fixed";
      place(viewport: { width: number; height: number }, fov: number, out: Placement): Placement;
    };

export interface AgentRenderDefinition {
  id: StageAgent;
  /** Bumped whenever the generator or its parameters change (part of the shape-cache key). */
  version: number;
  /** The generator seed the approved shape is made with. */
  seed: number;
  /** Synchronous generation (agreed contract; resumable jobs are deferred to M2.5). */
  generate(count: number, seed: number): AgentShape;
  transports: AgentTransports;
  /** WebGL-only highlight colour; base and accent always come from the registry. */
  hotOverride: string;
  /** A palette for an agent outside the registry (the diagnostic TEST shape only). */
  palette?: () => Palette;
  /** The agent's morph module (absent: it can't take part in a morph; changes are swaps). */
  morph?: AgentMorphModule;
  timing: AgentTiming;
  placement: AgentPlacement;
  createView(engine: Engine, context: AgentViewContext): AgentView;
}
