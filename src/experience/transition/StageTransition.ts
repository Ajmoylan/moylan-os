import { Vector3 } from "three";
import type { AgentId } from "~/agents/registry";
import type { StageAgent } from "../agents/types";
import { rgb } from "../ambient/config";
import { definitionFor } from "../agents/definitions";
import { registryPalette } from "../agents/palette";
import type { AgentColours } from "../agents/types";
import type { Placement } from "../nex/placement";

/**
 * The projection of the transition machine (proposal §4.3, §8.3). `arriving` is the drawn agent's
 * arrival (Full Motion), `preparing` waits for a morph's resources, `morphing` runs the shared
 * phase, `settling` hands over to the destination's idle renderer, and `unsupported` means the
 * drawn agent can't render on this device (its accessible poster is shown).
 */
export type TransitionState =
  "arriving" | "idle" | "preparing" | "morphing" | "settling" | "unsupported";

/**
 * The drawn agent's appearance, advanced once per frame by `TransitionClock` with the exact
 * arithmetic NEX used before Milestone 2.4b.2 (so NEX renders pixel-identically).
 */
export interface AgentVisibility {
  /** 0 … 1: fades in and out with the agent's anchor (instant without Full Motion). */
  fade: number;
  /** Seconds into the arrival (the timing's `arrival` once formed). */
  arrival: number;
  /** 0 … 1: the post-arrival overlay fade (NEX's glow layer). */
  formed: number;
  /** The agent's idle animation time (seconds × the agent's pace). */
  time: number;
}

/** Where the drawn agent is, plus the segment it is interpolating along (morphs only). */
export interface StagePlacement {
  /** The transform drawn this frame (world x, y, scale; onScreen). Retained every frame. */
  displayed: Placement;
  /** Segment start and end (equal to `displayed` outside a placement segment). */
  from: Placement;
  to: Placement;
  /** 0 … 1 within the current segment. */
  progress: number;
  /** Increments whenever a new placement segment starts (diagnostics and tests). */
  segment: number;
}

/**
 * The stage's shared, preallocated transition frame (ADR-007, analogous to `StageInteraction`).
 * Allocated once per Stage, mutated in place, never read by React. Written only by
 * `TransitionClock` (simulate phase); read by update-phase layers.
 */
export interface StageTransition {
  state: TransitionState;
  /** The agent drawn now (idle), or the morph source. */
  source: StageAgent;
  /** The destination; equals `source` except while preparing or morphing. */
  target: StageAgent;
  /** 0 … 1, the single morph coordinate, and its direction. */
  phase: number;
  direction: 1 | -1;
  /** Deterministic easing of `phase` (easeInOutCubic). */
  eased: number;
  /** 0 … 1 progress of the settle window (0 outside `settling`). */
  settle: number;
  /** The morph request AgentCore must prepare (0 when none). */
  request: number;
  /**
   * The last morph request number ever issued: Stage-lifetime and monotonic (the clock's request
   * allocator). It survives context restores, so a rebuilt clock never reuses a number.
   */
  issued: number;
  /** The drawn agent's colours: shared uniform values (one write updates every material). */
  palette: AgentColours;
  visibility: AgentVisibility;
  placement: StagePlacement;
  /** Increments on each change of the drawn agent. */
  generation: number;
}

/**
 * AgentCore's answer to a morph request (ADR-007: one writer per object; this one is written only
 * by AgentCore in the update phase and read by `TransitionClock` in the next simulate phase).
 */
export interface MorphReport {
  request: number;
  status: "none" | "ready" | "failed";
}

export function createMorphReport(): MorphReport {
  return { request: 0, status: "none" };
}

/** Writes `agent`'s registry palette into the shared colour values (no allocation kept). */
export function writePalette(colours: AgentColours, agent: StageAgent): void {
  const definition = definitionFor(agent);
  if (!definition) throw new Error(`No WebGL definition for agent "${agent}"`);
  const palette = definition.palette
    ? definition.palette()
    : registryPalette(agent as AgentId, definition.hotOverride);
  colours.deep.copy(rgb(palette.base));
  colours.accent.copy(rgb(palette.accent));
  colours.hot.copy(rgb(palette.hot));
}

const placement = (): Placement => ({ x: 0, y: 0, scale: 0, onScreen: false });

/** Resets the drawn agent's appearance: it arrives again (a first visit or a context restore). */
export function resetVisibility(visibility: AgentVisibility): void {
  visibility.fade = 0;
  visibility.arrival = 0;
  visibility.formed = 0;
  visibility.time = 0;
}

export function createTransition(agent: StageAgent = "nex"): StageTransition {
  const palette = { deep: new Vector3(), accent: new Vector3(), hot: new Vector3() };
  writePalette(palette, agent);
  return {
    state: "idle",
    source: agent,
    target: agent,
    phase: 0,
    direction: 1,
    eased: 0,
    settle: 0,
    request: 0,
    issued: 0,
    palette,
    visibility: { fade: 0, arrival: 0, formed: 0, time: 0 },
    placement: {
      displayed: placement(),
      from: placement(),
      to: placement(),
      progress: 0,
      segment: 0,
    },
    generation: 0,
  };
}
