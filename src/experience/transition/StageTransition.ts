import { Vector3 } from "three";
import type { AgentId } from "~/agents/registry";
import { rgb } from "../ambient/config";
import { definitionFor } from "../agents/definitions";
import { registryPalette } from "../agents/palette";
import type { AgentColours } from "../agents/types";

/**
 * Milestone 2.4b.1a: idle only. `preparing`, `morphing`, `settling` and `unsupported` arrive with
 * the morph proof of concept (2.4b.2). NEX's arrival stays inside its renderer until then, because
 * its progress depends on the on-screen placement that 1a deliberately leaves in AgentCore.
 */
export type TransitionState = "idle";

/**
 * The stage's shared, preallocated transition frame (ADR-007, analogous to `StageInteraction`).
 * Allocated once per Stage, mutated in place, never read by React. Written only by
 * `TransitionClock` (simulate phase); read by update-phase layers.
 */
export interface StageTransition {
  state: TransitionState;
  /** The agent drawn now (idle) or, from 2.4b.2, the morph source. */
  source: AgentId;
  /** Equals `source` while idle. */
  target: AgentId;
  /** The drawn agent's colours: shared uniform values (one write updates every material). */
  palette: AgentColours;
  /** Increments on each change of the drawn agent. */
  generation: number;
}

/** Writes `agent`'s registry palette into the shared colour values (no allocation kept). */
export function writePalette(colours: AgentColours, agent: AgentId): void {
  const definition = definitionFor(agent);
  if (!definition) throw new Error(`No WebGL definition for agent "${agent}"`);
  const palette = registryPalette(agent, definition.hotOverride);
  colours.deep.copy(rgb(palette.base));
  colours.accent.copy(rgb(palette.accent));
  colours.hot.copy(rgb(palette.hot));
}

export function createTransition(agent: AgentId = "nex"): StageTransition {
  const palette = { deep: new Vector3(), accent: new Vector3(), hot: new Vector3() };
  writePalette(palette, agent);
  return { state: "idle", source: agent, target: agent, palette, generation: 0 };
}
