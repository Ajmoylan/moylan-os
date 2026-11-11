import { definitionFor } from "../agents/definitions";
import type { AgentRenderDefinition, AgentView, AgentViewProps } from "../agents/types";
import type { Engine, FrameLayer } from "../engine/Engine";
import { Resources } from "../engine/resources";
import type { StageInteraction } from "../flow/interaction";
import type { StageTransition } from "../transition/StageTransition";
import type { ShapeCache } from "./shapeCache";

export type AgentCoreProps = AgentViewProps;

export interface AgentCoreContext {
  /** The stage element: agent state is published on it as data attributes. */
  stage: HTMLElement;
  /** The shared cursor-interaction substrate (ADR-004), written by the flow simulation. */
  interaction: StageInteraction;
  /** The shared transition frame (ADR-007), written by `TransitionClock` in the simulate phase. */
  transition: StageTransition;
  /** Stage-lifetime CPU shapes (survive context loss). */
  shapes: ShapeCache;
}

/**
 * Shared AgentCore (Milestone 2.4b.1a, ADR-014 proposed): the stage's one agent layer, in the
 * engine's `update` phase. It owns the active agent's renderer ("view"), lends it the shared
 * colours and the Stage-lifetime shape cache, forwards discrete props, and publishes
 * `data-agent-state`.
 *
 * 1a is a mechanical extraction: the view is NEX's existing renderer, with its exact GLSL, uniform
 * orbit transport, scene graph and per-frame logic, so NEX renders pixel-identically. Slot B,
 * morph programs and transitions between agents arrive in 2.4b.2.
 */
export class AgentCore implements FrameLayer {
  readonly phase = "update";
  readonly definition: AgentRenderDefinition;
  private readonly resources = new Resources();
  private readonly view: AgentView;
  private readonly stage: HTMLElement;
  private published = "";
  private disposed = false;

  /** Transactional: a failing view constructor leaves nothing behind. */
  constructor(engine: Engine, context: AgentCoreContext) {
    const own = this.resources;
    this.stage = context.stage;
    try {
      own.defer(() => {
        delete context.stage.dataset.agentState;
      });
      const { source, palette } = context.transition;
      const definition = definitionFor(source);
      if (!definition) throw new Error(`No WebGL definition for agent "${source}"`);
      this.definition = definition;
      this.view = own.own(
        definition.createView(engine, {
          stage: context.stage,
          interaction: context.interaction,
          colours: palette,
          shape: (count) => context.shapes.get(definition, count),
        }),
      );
    } catch (error) {
      this.disposed = true;
      throw own.rollback(error);
    }
  }

  /** Applies changed props only; returns whether anything visible may have changed. */
  setProps(next: AgentCoreProps): boolean {
    if (this.disposed) return false;
    return this.view.setProps(next);
  }

  update(engine: Engine, delta: number): void {
    if (this.disposed) return;
    this.view.update(engine, delta);
    // `data-agent-state` mirrors the agent's published state (e.g. `data-nex-state`).
    const state = this.view.state;
    if (state !== this.published) {
      this.published = state;
      this.stage.dataset.agentState = state;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.release();
  }
}
