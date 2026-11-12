import { Points, Vector3, type BufferGeometry, type Object3D, type ShaderMaterial } from "three";
import { definitionFor } from "../agents/definitions";
import type {
  AgentColours,
  AgentRenderDefinition,
  AgentView,
  AgentViewProps,
  OrbitTransport,
  StageAgent as AgentId,
} from "../agents/types";
import type { Engine, FrameLayer } from "../engine/Engine";
import { Resources } from "../engine/resources";
import type { StageInteraction } from "../flow/interaction";
import { drawCount } from "../performance/quality";
import {
  writePalette,
  type MorphReport,
  type StageTransition,
} from "../transition/StageTransition";
import { AgentCapabilities, rendererLimits, VERTEX_UNIFORM_HEADROOM } from "./capabilities";
import { lightProgress } from "./morph/light";
import { createPairMaterial } from "./morph/program";
import {
  MorphPrograms,
  rendererCompiler,
  type MorphCompiler,
  type StageEpochs,
} from "./morph/programs";
import { resolveMorphTransport } from "./morph/transport";
import { createMorphGeometry, releaseMorphGeometry } from "./morphSlot";
import { orbitTexturesSupported } from "./orbits/probe";
import type { ShapeCache } from "./shapeCache";

export type AgentCoreProps = AgentViewProps;

export interface AgentCoreContext {
  /** The stage element: agent state is published on it as data attributes. */
  stage: HTMLElement;
  /** The shared cursor-interaction substrate (ADR-004), written by the flow simulation. */
  interaction: StageInteraction;
  /** The shared transition frame (ADR-007), written by `TransitionClock` in the simulate phase. */
  transition: StageTransition;
  /** AgentCore's answers to morph requests (written only here, read by `TransitionClock`). */
  report: MorphReport;
  /** Stage-lifetime CPU shapes (survive context loss; immutable once generated). */
  shapes: ShapeCache;
  /** The preferred orbit transport (default `uniforms`; `texture` behind the 1b switch). */
  orbitPreference: OrbitTransport;
  /** Stage-lifetime owner and context epochs (asynchronous results are checked against them). */
  epochs: StageEpochs;
  /** The morph-program compiler (tests inject one; default: the renderer's `compileAsync`). */
  compiler?: MorphCompiler;
  /**
   * The context's agent viability, shared with `TransitionClock` (the Stage builds one per context
   * generation). Absent: AgentCore assesses this renderer itself (unit tests).
   */
  capabilities?: AgentCapabilities;
}

/** Stage data attributes AgentCore publishes (written only when their value changes). */
type Published = "agentState" | "stageTransition" | "morphProgram" | "morphCompileMs";

/** One agent renderer owned by AgentCore, with the transport it was built for. */
interface ViewSlot {
  readonly definition: AgentRenderDefinition;
  readonly view: AgentView;
  readonly orbitTransport: OrbitTransport;
  /** Its idle programs compiled and linked on this context (checked before it is first drawn). */
  verified: boolean;
  /** A destination's own programs: compiled asynchronously while preparing (epoch-guarded). */
  warm: "no" | "warming" | "ready" | "failed";
}

/** A morph's GPU-side resources (proposal §5.2, §7): built while preparing, drawn while morphing. */
interface Morph {
  readonly request: number;
  readonly source: AgentId;
  readonly target: AgentId;
  /** The morph geometry: borrows both views' attributes (no buffer of its own). */
  readonly geometry: BufferGeometry;
  readonly points: Points;
  readonly material: ShaderMaterial;
  /** Slot B is the destination (`uMorph` = eased, `uLight` = phase), else the source (1 − each). */
  readonly towardsB: boolean;
}

/**
 * Shared AgentCore (Milestones 2.4b.1a–2.4b.2, ADR-014 proposed): the stage's one agent layer, in
 * the engine's `update` phase.
 *
 * **Views.** AgentCore owns the agent renderers explicitly: the *active* view draws
 * `StageTransition.source`; while a morph is prepared or runs, a *destination* view draws
 * `target`. Each view gets its own colours (from its definition) and is built transactionally with
 * the current props. A swap builds the new view first, then disposes the old one; a morph's
 * handoff promotes the destination view (no rebuild, no upload) and disposes the source. An
 * `unsupported` agent has no view.
 *
 * **Morphs (2.4b.2 stage D).** For each preparation request AgentCore: builds the destination view
 * (hidden); resolves the pair program's orbit transport for this device; asks the bounded compile
 * queue for the pair program (compiled asynchronously, epoch-guarded); then builds the morph
 * geometry from the two views' own attributes (borrowed: no buffer, no copy) and answers "ready",
 * or "failed" (the agreed fallback: a swap) once per request. While morphing it drives `uMorph`
 * and the views' roles from the clock's eased phase.
 *
 * **Release order.** The morph geometry is always released (detached, then disposed) *before*
 * either view it borrows from: at the handoff, a reversal's end, a retarget, a swap, a tier change
 * (released before the new particle count reaches the views; the morph then reports "failed" and
 * the machine shows the latest destination), context loss and unmount (morph → destination →
 * active → programs).
 */
export class AgentCore implements FrameLayer {
  readonly phase = "update";
  private readonly resources = new Resources();
  private readonly stage: HTMLElement;
  private readonly programs: MorphPrograms;
  private readonly compiler: MorphCompiler;
  /** The context's agent viability (shared with the clock). */
  private readonly capabilities: AgentCapabilities;
  /** This instance's owner epoch (a later AgentCore makes its results stale). */
  readonly owner: number;
  private active: ViewSlot | null = null;
  private destination: ViewSlot | null = null;
  private morph: Morph | null = null;
  private props: AgentCoreProps | null = null;
  /** The last request answered "ready"/"failed" while preparing, and the last morph aborted. */
  private answered = 0;
  private aborted = 0;
  private readonly published: Record<Published, string> = {
    agentState: "",
    stageTransition: "",
    morphProgram: "",
    morphCompileMs: "",
  };
  private disposed = false;

  /** Transactional: a failing view constructor leaves nothing behind. */
  constructor(
    private readonly engine: Engine,
    private readonly context: AgentCoreContext,
  ) {
    const own = this.resources;
    this.stage = context.stage;
    this.owner = ++context.epochs.owner;
    this.compiler = context.compiler ?? rendererCompiler(engine, context.epochs);
    this.programs = new MorphPrograms(this.compiler, context.epochs, this.owner);
    this.capabilities =
      context.capabilities ??
      new AgentCapabilities(
        rendererLimits(engine.renderer, () => orbitTexturesSupported(engine.renderer)),
        context.orbitPreference,
        context.epochs.context,
      );
    try {
      own.defer(() => {
        const { dataset } = context.stage;
        delete dataset.agentState;
        delete dataset.stageOrbits;
        delete dataset.agentSupport;
        delete dataset.stageTransition;
        delete dataset.morphProgram;
        delete dataset.morphCompileMs;
      });
      // Newest first: the morph geometry, then the views it borrows from, then the programs.
      own.defer(() => {
        this.releaseMorph();
        this.destination?.view.dispose();
        this.destination = null;
        this.active?.view.dispose();
        this.active = null;
        this.programs.dispose();
      });
      const { source, state } = context.transition;
      if (!definitionFor(source)) throw new Error(`No WebGL definition for agent "${source}"`);
      if (state !== "unsupported") this.active = this.buildSlot(source);
    } catch (error) {
      this.disposed = true;
      throw own.rollback(error);
    }
  }

  /** The active view's definition (null while the drawn agent is unsupported). */
  get definition(): AgentRenderDefinition | null {
    return this.active?.definition ?? null;
  }

  /** The active view's orbit transport (the preference if supported and probed, else uniforms). */
  get orbitTransport(): OrbitTransport | null {
    return this.active?.orbitTransport ?? null;
  }

  /** Diagnostics and tests: the morph in place, the destination view, the compile queue. */
  get diagnostics() {
    return {
      morph: this.morph,
      destination: this.destination?.definition.id ?? null,
      programs: this.programs,
    };
  }

  /** Applies changed props only; returns whether anything visible may have changed. */
  setProps(next: AgentCoreProps): boolean {
    if (this.disposed) return false;
    const prev = this.props;
    // A new particle count replaces the views' attributes: the morph borrowing them goes first.
    if (this.morph && prev && prev.particles !== next.particles) this.releaseMorph();
    this.props = next;
    const changed = this.active?.view.setProps(next) ?? false;
    if (this.destination) this.destination.view.setProps(next);
    if (this.morph) {
      this.morph.geometry.setDrawRange(0, drawCount(next.particles, next.particleShare));
    }
    return changed;
  }

  update(engine: Engine, delta: number): void {
    if (this.disposed) return;
    this.reconcile();
    this.drive();
    this.active?.view.update(engine, delta);
    this.destination?.view.update(engine, delta);
    // `data-agent-state` mirrors the agent's published state (e.g. `data-nex-state`).
    const state = this.active ? this.active.view.state : "unsupported";
    this.publish("agentState", state);
    this.publish("stageTransition", this.context.transition.state);
  }

  /** Brings the owned views and morph in line with the clock's frame; answers its request once. */
  private reconcile(): void {
    const t = this.context.transition;
    const transitioning = t.state === "preparing" || t.state === "morphing";
    // 1. A morph that no longer matches the frame is released before any view changes.
    const morph = this.morph;
    if (
      morph &&
      !(
        transitioning &&
        morph.request === t.request &&
        morph.source === t.source &&
        morph.target === t.target
      )
    ) {
      this.releaseMorph();
    }

    if (t.state === "unsupported") {
      this.releaseDestination();
      if (this.active) {
        const old = this.active;
        this.active = null;
        old.view.dispose();
      }
      this.stage.dataset.agentSupport = "unsupported";
      return;
    }
    if (this.stage.dataset.agentSupport) delete this.stage.dataset.agentSupport;

    // 2. The drawn agent: a morph's handoff promotes the destination view; otherwise a swap.
    if (!this.active || this.active.definition.id !== t.source) {
      const old = this.active;
      if (this.destination && this.destination.definition.id === t.source) {
        this.active = this.destination;
        this.destination = null;
      } else {
        // The new view first (it fails transactionally), then the old one goes. Null: the agent
        // is unsupported on this context (the clock shows its fallback from the next frame).
        this.active = this.buildSlot(t.source);
      }
      old?.view.dispose();
    }
    // Before a view first draws, its idle programs must have linked (proposal §6.6): a failure
    // rejects that transport and tries the next viable one once; none left → unsupported.
    if (this.active && !this.active.verified && this.props) {
      if (this.morph) this.releaseMorph();
      this.active = this.verified(this.active);
    }

    // 3. The destination view, only while a morph is prepared or runs.
    if (transitioning && t.target !== t.source) {
      if (this.destination && this.destination.definition.id !== t.target) {
        this.releaseDestination();
      }
      // A destination whose idle programs failed to link is never handed off to: it is released,
      // and the next viable transport is tried once; with none left the agent is unsupported.
      if (this.destination?.warm === "failed") {
        const failed = this.destination;
        this.releaseDestination();
        this.capabilities.reject(failed.definition.id, failed.orbitTransport);
      }
      if (!this.destination) {
        this.destination = this.buildSlot(t.target);
        if (!this.destination) {
          // Unsupported on this context: no morph (the clock resolves to the fallback).
          if (t.state === "preparing" && this.answered !== t.request) {
            this.answer(t.request, "failed");
          }
          this.publish("morphProgram", this.programStatus());
          return;
        }
      }
    } else {
      this.releaseDestination();
    }

    // The compile queue keeps only the pair the latest preparation wants.
    if (t.state !== "preparing") this.programs.unwant();
    // 4. Preparing: ready the morph's resources, and answer the request once.
    if (t.state === "preparing" && this.answered !== t.request) {
      const status = this.prepare(t.request, t.source, t.target);
      if (status !== "pending") this.answer(t.request, status);
    }
    // 5. Morphing without resources (aborted by a tier change): the machine swaps.
    if (t.state === "morphing" && !this.morph && this.aborted !== t.request) {
      this.aborted = t.request;
      this.context.report.request = t.request;
      this.context.report.status = "failed";
    }
    this.publish("morphProgram", this.programStatus());
  }

  /** The morph's uniforms and the views' roles for this frame. */
  private drive(): void {
    const t = this.context.transition;
    const morph = this.morph;
    const active = this.active;
    const destination = this.destination;
    if (morph && t.state === "morphing" && active && destination) {
      morph.points.visible = true;
      // Movement follows the eased phase; light follows the linear phase, with a smooth onset and
      // offset at each end (core/morph/light.ts; stage-D luminance decision: Option 1 + onset).
      const uniforms = morph.material.uniforms;
      const light = lightProgress(t.phase);
      uniforms.uMorph!.value = morph.towardsB ? t.eased : 1 - t.eased;
      uniforms.uLight!.value = morph.towardsB ? light : 1 - light;
      active.view.setMorphRole("morph", 1 - light, false);
      destination.view.setMorphRole("morph", light, true);
      return;
    }
    if (morph) morph.points.visible = false;
    active?.view.setMorphRole("none", 1, false);
    destination?.view.setMorphRole("hidden", 0, true);
  }

  /**
   * Readies the morph for `request`: transport, program, geometry. "pending" while the program
   * compiles (the clock's 1.5 s cap then swaps). Transactional: a failure releases what it built.
   */
  private prepare(
    request: number,
    source: AgentId,
    target: AgentId,
  ): "ready" | "failed" | "pending" {
    const from = this.active;
    const to = this.destination;
    if (!from || !to || !this.props) return "pending";
    const slotA = from.definition.morph?.slot === "A" ? from : to;
    const slotB = slotA === from ? to : from;
    if (slotA.definition.morph?.slot !== "A" || slotB.definition.morph?.slot !== "B") {
      return "failed";
    }
    const capabilities = this.capabilities;
    const transport = resolveMorphTransport({
      slotA: slotA.definition,
      slotB: slotB.definition,
      idle: slotA.orbitTransport,
      maxVertexUniforms: capabilities.budget + VERTEX_UNIFORM_HEADROOM,
      textureAvailable: () => capabilities.floatTextures(),
      slotAViable: (t) => capabilities.viable(slotA.definition, t),
    });
    if (!transport) return "failed";
    const a = slotA.definition;
    const b = slotB.definition;
    const key = `${a.id}@${a.version}>${b.id}@${b.version}:${transport}`;
    const program = this.programs.want(
      key,
      () =>
        createPairMaterial(
          a.morph!.module(transport),
          b.morph!.module("uniforms"),
          slotA.view.morphUniforms(transport),
          slotB.view.morphUniforms("uniforms"),
        ),
      request,
    );
    this.publish("morphCompileMs", String(Math.round(this.programs.stats.lastMs)));
    if (program.status === "failed") return "failed";
    // The destination's own programs compile alongside, so neither its first morph frame nor the
    // handoff compiles synchronously.
    // A failed warm-up is handled by reconcile on the next frame (fallback transport or unsupported).
    const warmed = this.warm(to);
    if (program.status !== "ready" || warmed !== "ready") return "pending";
    const material = program.material!;
    const attributesA = slotA.view.particles();
    const attributesB = slotB.view.particles();
    const host: Object3D | null = slotA.view.morphHost();
    if (!attributesA || !attributesB) return "pending";
    if (!host) return "failed";

    let geometry: BufferGeometry | null = null;
    try {
      // Rebind the cached program's uniforms to these views (it may have served earlier ones).
      const uniforms = material.uniforms;
      Object.assign(
        uniforms,
        slotA.view.morphUniforms(transport),
        slotB.view.morphUniforms("uniforms"),
      );
      uniforms.uMorph!.value = slotB === to ? 0 : 1;
      uniforms.uLight!.value = slotB === to ? 0 : 1;
      geometry = createMorphGeometry(attributesA, attributesB);
      geometry.setDrawRange(0, drawCount(this.props.particles, this.props.particleShare));
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      points.visible = false;
      host.add(points);
      this.programs.pin(material);
      this.morph = { request, source, target, geometry, points, material, towardsB: slotB === to };
      return "ready";
    } catch {
      if (geometry) releaseMorphGeometry(geometry);
      return "failed";
    }
  }

  /**
   * Starts (once) compiling a destination view's own programs; true once done. The result carries
   * the owner and context epochs and applies only to the view still being prepared: a late result
   * for a released view, a replaced AgentCore or a lost context changes nothing.
   */
  private warm(slot: ViewSlot): ViewSlot["warm"] {
    if (slot.warm === "no") {
      slot.warm = "warming";
      const { epochs } = this.context;
      const owner = this.owner;
      const context = epochs.context;
      const settle = (linked: boolean) => {
        if (this.disposed || owner !== epochs.owner || context !== epochs.context) return;
        if (this.destination !== slot) return;
        slot.warm = linked ? "ready" : "failed";
        if (linked) slot.verified = true;
      };
      let warming: Promise<boolean>;
      try {
        warming = this.compiler.warm(slot.view.object());
      } catch {
        warming = Promise.resolve(false);
      }
      // Genuine success only: a rejected warm-up is a failure, never "ready".
      warming.then(settle, () => settle(false));
    }
    return slot.warm;
  }

  private answer(request: number, status: "ready" | "failed"): void {
    this.answered = request;
    this.context.report.request = request;
    this.context.report.status = status;
  }

  /** Releases the morph: detached from its host, geometry detached then disposed, program unpinned. */
  private releaseMorph(): void {
    const morph = this.morph;
    if (!morph) return;
    this.morph = null;
    morph.points.removeFromParent();
    releaseMorphGeometry(morph.geometry);
    this.programs.unpin(morph.material);
  }

  private releaseDestination(): void {
    if (!this.destination) return;
    this.releaseMorph();
    const old = this.destination;
    this.destination = null;
    old.view.dispose();
  }

  private programStatus(): string {
    const p = this.programs;
    return p.compiling ? "compiling" : this.morph ? "ready" : p.size > 0 ? "cached" : "none";
  }

  private publish(key: Published, value: string): void {
    if (this.published[key] === value) return;
    this.published[key] = value;
    this.stage.dataset[key] = value;
  }

  /** A view for `agent` with its viable transport on this context; null when it is unsupported. */
  private buildSlot(agent: AgentId): ViewSlot | null {
    const transport = this.capabilities.transport(agent);
    return transport ? this.createSlot(agent, transport) : null;
  }

  /**
   * Compiles and checks a view's idle programs (synchronously: it is about to draw). A program that
   * failed to link rejects that transport for this context and the next viable one is tried, once
   * per transport (bounded); null when none is left: the agent is unsupported. Exceptions (a
   * corrupted renderer) propagate to the Stage's `fail()`.
   */
  private verified(slot: ViewSlot): ViewSlot | null {
    let current: ViewSlot | null = slot;
    while (current && !current.verified) {
      if (this.compiler.verify(current.view.object())) {
        current.verified = true;
        break;
      }
      current.view.dispose();
      const next = this.capabilities.reject(current.definition.id, current.orbitTransport);
      current = next ? this.createSlot(current.definition.id, next) : null;
    }
    return current;
  }

  private createSlot(agent: AgentId, orbitTransport: OrbitTransport): ViewSlot {
    const { context, engine } = this;
    const definition = definitionFor(agent);
    if (!definition) throw new Error(`No WebGL definition for agent "${agent}"`);
    // Each view has its own colours (two agents are drawn at once during a morph).
    const colours: AgentColours = {
      deep: new Vector3(),
      accent: new Vector3(),
      hot: new Vector3(),
    };
    writePalette(colours, agent);
    const view = definition.createView(engine, {
      stage: context.stage,
      interaction: context.interaction,
      colours,
      shape: (count) => context.shapes.get(definition, count),
      orbitTransport,
      visibility: context.transition.visibility,
      placement: context.transition.placement,
    });
    try {
      if (this.props) view.setProps(this.props);
    } catch (error) {
      view.dispose();
      throw error;
    }
    context.stage.dataset.stageOrbits = orbitTransport;
    return { definition, view, orbitTransport, verified: false, warm: "no" };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.release();
  }
}
