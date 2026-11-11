import type { AgentId } from "~/agents/registry";
import { definitionFor } from "../agents/definitions";
import type { Engine, FrameLayer } from "../engine/Engine";
import { writePalette, type StageTransition } from "./StageTransition";

export interface TransitionClockProps {
  /** Agent hosting the current URL (route manifest). */
  agent: AgentId;
}

export interface TransitionClockContext {
  transition: StageTransition;
}

/**
 * The single writer of `StageTransition` (ADR-007), in the engine's simulate phase, so every
 * update-phase reader sees one consistent frame (Milestone 2.4b.1a).
 *
 * 1a is idle-only and draws NEX only: a route whose agent has no WebGL definition keeps the current
 * agent as the drawn one (NEX then leaves with its page anchor, exactly as before). A change of the
 * drawn agent is applied at the next frame boundary, never inside a React commit. From 2.4b.2 this
 * layer advances the morph phase (clamping its own step; the engine passes raw elapsed time).
 */
export class TransitionClock implements FrameLayer {
  readonly phase = "simulate";
  private pending: AgentId | null = null;
  private disposed = false;

  constructor(
    _engine: Engine,
    private readonly context: TransitionClockContext,
  ) {
    // (Re)built with the stage's layers, after a context restore too: idle at the drawn agent.
    const transition = context.transition;
    transition.state = "idle";
    transition.target = transition.source;
  }

  /** Records the route's agent. Nothing visible changes in a commit, so this never invalidates. */
  setProps(next: TransitionClockProps): boolean {
    if (this.disposed) return false;
    const source = this.context.transition.source;
    const drawn = definitionFor(next.agent) ? next.agent : source;
    this.pending = drawn === source ? null : drawn;
    return false;
  }

  update(): void {
    const next = this.pending;
    if (next === null || this.disposed) return;
    this.pending = null;
    const transition = this.context.transition;
    writePalette(transition.palette, next);
    transition.source = next;
    transition.target = next;
    transition.generation++;
  }

  dispose(): void {
    this.disposed = true;
    this.pending = null;
  }
}
