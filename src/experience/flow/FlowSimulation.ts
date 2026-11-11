import type { Engine, FrameLayer } from "../engine/Engine";
import { ambientLook } from "../ambient/config";
import { FlowField } from "./FlowField";
import { clearInteraction, type StageInteraction } from "./interaction";
import { MAX_STEP_SECONDS } from "./policy";
import { PointerTracker } from "./PointerTracker";

/** Discrete inputs, forwarded by the Stage on change (ADR-007). */
export interface FlowSimulationProps {
  /** Pointer effects allowed (effective motion "full"): only then is anything allocated. */
  pointerEffects: boolean;
  /** Flow-map resolution for the tier (64² / 128² / 256²). */
  flowSize: number;
}

export interface FlowSimulationContext {
  /** The stage element: the flow format is published on it as data attributes. */
  stage: HTMLElement;
  /** The stage's shared cursor-interaction substrate, written here once per frame. */
  interaction: StageInteraction;
}

/**
 * The shared pointer flow (ADR-004) as the engine's `simulate` phase: the only pointer listener
 * (`PointerTracker`) and the only flow simulation (`FlowField`, or the analytic fallback when no
 * render-target format validates). It runs before every `update`-phase layer, so the ambient field,
 * NEX and future agents all read the same, current interaction whatever order they were added in.
 *
 * Nothing is allocated, and no listener is attached, unless pointer effects are allowed; turning
 * them off at runtime (reduced/off motion) disposes the render targets, detaches the listeners and
 * resets the interaction to "none".
 */
export class FlowSimulation implements FrameLayer {
  readonly phase = "simulate";
  private props: FlowSimulationProps | null = null;
  private tracker: PointerTracker | null = null;
  private field: FlowField | null = null;
  private disposed = false;

  constructor(
    private readonly engine: Engine,
    private readonly context: FlowSimulationContext,
  ) {}

  /** Applies changed props only. Returns whether anything changed (the Stage then invalidates). */
  setProps(next: FlowSimulationProps): boolean {
    if (this.disposed) return false;
    const prev = this.props;
    if (prev && prev.pointerEffects === next.pointerEffects && prev.flowSize === next.flowSize) {
      return false;
    }
    this.stop();
    this.props = next;
    this.start(next);
    return true;
  }

  /** Transactional: on failure nothing stays attached or allocated, and the error propagates. */
  private start({ pointerEffects, flowSize }: FlowSimulationProps): void {
    const { stage, interaction } = this.context;
    clearInteraction(interaction);
    // Ambient draw + flow pass (the field's own draw-call figure, published since Milestone 2.2).
    stage.dataset.stageDrawCalls = pointerEffects ? "2" : "1";
    if (!pointerEffects) {
      stage.dataset.stageFlow = "none";
      return;
    }
    const field = FlowField.create(this.engine.renderer, flowSize, ambientLook.cursor);
    const pointer = new PointerTracker(window);
    try {
      pointer.attach();
    } catch (error) {
      pointer.detach();
      field?.dispose();
      throw error;
    }
    this.field = field;
    this.tracker = pointer;
    interaction.mode = field?.format ?? "analytic";
    interaction.radius = ambientLook.cursor.radius;
    stage.dataset.stageFlow = interaction.mode;
  }

  private stop(): void {
    const { tracker, field } = this;
    this.tracker = null;
    this.field = null;
    clearInteraction(this.context.interaction);
    try {
      tracker?.detach();
    } finally {
      field?.dispose();
    }
  }

  update(engine: Engine, delta: number): void {
    const pointer = this.tracker;
    if (!pointer) return;
    const dt = Math.min(delta, MAX_STEP_SECONDS);
    const { interaction } = this.context;
    const sample = pointer.update(dt);
    const field = this.field;
    if (field) {
      field.step(engine.renderer, dt, sample, engine.width / Math.max(1, engine.height));
      interaction.texture = field.texture;
    } else {
      interaction.pointer.set(sample.u * 2 - 1, sample.v * 2 - 1);
      interaction.velocity.set(sample.smoothVx, sample.smoothVy);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }
}
