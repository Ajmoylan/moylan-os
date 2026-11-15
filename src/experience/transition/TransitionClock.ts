import type { AgentId } from "~/agents/registry";
import { NEX_ANCHOR_EVENT, NEX_ATTENTION_EVENT, type NexAttention } from "~/lib/nex-events";
import type { EffectiveMotion } from "~/motion/policy";
import { definitionFor, stageAgentFor } from "../agents/definitions";
import type { AgentRenderDefinition, StageAgent } from "../agents/types";
import type { Engine, FrameLayer } from "../engine/Engine";
import { Resources } from "../engine/resources";
import { MAX_STEP_SECONDS } from "../flow/policy";
import type { AgentCapabilities } from "../core/capabilities";
import { AnchorTracker } from "../nex/anchor";
import { ATTENTION_HOLD, ATTENTION_SECONDS, damp } from "../nex/look";
import { CAMERA_DISTANCE, type Placement } from "../nex/placement";
import { TransitionMachine, type MachineEnvironment } from "./machine";
import { advanceSegment, copyPlacement, movedSubstantially, startSegment } from "./placement";
import { spring, type Spring } from "../nex/look";

/**
 * Fastest a glide may start (world units per second): about 2.5 viewport heights a second at the
 * stage camera's field of view (the viewport is ≈ 2.87 world units tall at NEX's distance).
 */
const GLIDE_MAX_SPEED = 7;
import {
  resetVisibility,
  writePalette,
  type MorphReport,
  type StageTransition,
} from "./StageTransition";

/**
 * Launch sprint: when the drawn agent's anchor moves to another element while the agent is shown
 * (the homepage opening handing NEX to the companion dock, a page with its own NEX anchor), the
 * agent glides there instead of jumping (Full Motion only; otherwise it is placed at once).
 *
 * The glide is a gently damped spring on position and (log) scale together, seeded with the
 * agent's current velocity: a NEX carried up by the scrolling page keeps flowing and curves into
 * the dock, shrinking as he goes, like a small creature deliberately repositioning itself; a
 * reversal mid-flight turns smoothly instead of stopping and restarting. It lands in about
 * `GLIDE_SECONDS` and settles exactly on the anchor.
 */
export const GLIDE_SECONDS = 1.1;
export const GLIDE_SPRING = { frequency: 0.8, damping: 0.86 } as const;

/** The glide springs scale in log space (equal ratios feel like equal steps); zero-safe. */
const logScale = (scale: number) => Math.log(Math.max(scale, 1e-6));

export interface TransitionClockProps {
  /** Agent hosting the current URL (route manifest). */
  agent: AgentId;
  /** Current route: the drawn agent's anchor is looked up again after every navigation. */
  path: string;
  motion: EffectiveMotion;
  /** The tab is hidden (no frames run; changes are applied at the first visible frame). */
  hidden: boolean;
}

export interface TransitionClockContext {
  transition: StageTransition;
  /** AgentCore's answers to morph requests (written by AgentCore, read here). */
  report: MorphReport;
  /**
   * The context's agent viability (core/capabilities.ts), shared with AgentCore. Absent (unit tests
   * only): an agent is supported when its definition declares an idle transport.
   */
  capabilities?: AgentCapabilities;
}

/**
 * The single transition timeline (Milestone 2.4b.2; ADR-007): the only writer of
 * `StageTransition`, in the engine's simulate phase, so every update-phase reader sees one
 * consistent frame. It owns:
 * - the transition state machine (selections, morph phase, completion, settling);
 * - the drawn agent's appearance: its anchor (one event-driven `AnchorTracker`), fade, arrival,
 *   post-arrival fade and idle time;
 * - the drawn agent's placement, including the glide between anchors (launch sprint);
 * - the visitor's attention to NEX (launch sprint), from the page's window events.
 *
 * The engine passes raw elapsed time; the clock clamps its own step (`MAX_STEP_SECONDS`) for all
 * progression. The appearance arithmetic is exactly what NEX's renderer did before 2.4b.2 (same
 * operations, same order, same conditions), so NEX renders pixel-identically.
 *
 * Agents without a WebGL definition are not drawn: such a route keeps the current agent as the
 * drawn one (NEX then leaves with its page anchor, as before).
 */
export class TransitionClock implements FrameLayer {
  readonly phase = "simulate";
  private readonly resources = new Resources();
  private readonly anchor: AnchorTracker;
  private readonly machine: TransitionMachine;
  private readonly env: MachineEnvironment = {
    // Device-specific viability (proposal §6.6): the context's shared assessment (uniform limits
    // with headroom, the float-texture probe, declared transports, idle programs that linked).
    supported: (agent) => {
      const capabilities = this.context.capabilities;
      if (capabilities) return capabilities.supported(agent);
      return (definitionFor(agent)?.transports.idle.length ?? 0) > 0;
    },
    full: true,
    hidden: false,
  };
  private props: TransitionClockProps | null = null;
  /** The route's agent as the stage draws it (`stageAgentFor`). */
  private selected: StageAgent | null = null;
  private drawn: AgentRenderDefinition;
  /** The agent whose anchor the tracker follows: the drawn one, or a morph's endpoint. */
  private anchored: StageAgent;
  /** Morph placement: the endpoint's target, the segment's endpoint and its phase bookkeeping. */
  private readonly endpoint: Placement = { x: 0, y: 0, scale: 0, onScreen: false };
  private segmentFor: StageAgent | null = null;
  private segmentSpan = 1;
  private lastPhase = 0;
  private transitioning = false;
  /** Gliding from the transform drawn last frame to a new anchor (`placement.to`, kept current). */
  private gliding = false;
  /** The glide's springs (world x, y and log scale) and the drawn transform's velocity. */
  private readonly springs = {
    x: { x: 0, v: 0 } as Spring,
    y: { x: 0, v: 0 } as Spring,
    s: { x: 0, v: 0 } as Spring,
  };
  private readonly motion = { x: 0, y: 0, s: 0, vx: 0, vy: 0, vs: 0, valid: false };
  /** The visitor's pointer or focus is on NEX's launcher; a pulse is pending. */
  private attentionHold = false;
  private attentionPulse = false;
  private disposed = false;
  /** The machine's swap count already applied (a swap makes the new agent arrive). */
  private swaps = 0;

  // The drawn agent's appearance bookkeeping (was NEX's own until 2.4b.2).
  private shown = false;
  private version = -1;
  private width = 0;
  private height = 0;
  private fov = 0;

  constructor(
    engine: Engine,
    private readonly context: TransitionClockContext,
  ) {
    const own = this.resources;
    try {
      const transition = context.transition;
      // (Re)built with the stage's layers, after a context restore too: the latest destination is
      // drawn and arrives again (proposal §8.3, §9).
      const agent = definitionFor(transition.target) ? transition.target : transition.source;
      this.drawn = definitionFor(agent)!;
      this.anchored = agent;
      // Morph request numbers come from the Stage-lifetime counter in the frame: monotonic across
      // context restores, so no number ever issued (answered or not) is issued again and a stale
      // answer can never match a new request. (Stage D adds owner and context epochs for the
      // asynchronous work each request starts.)
      this.machine = new TransitionMachine(agent, this.env, undefined, () => ++transition.issued);
      this.project();
      resetVisibility(transition.visibility);
      // The anchor's box is measured only after layout can have changed (scroll, resize, observed
      // size changes, fonts, navigation), never on every frame; each change requests a frame
      // through the engine's single invalidation path (needed when rendering on demand).
      this.anchor = new AnchorTracker(window, engine.invalidate);
      own.defer(() => this.anchor.detach());
      this.anchor.attach();
      // The page's NEX signals (src/lib/nex-events.ts): a new active anchor, and attention.
      const onAnchor = () => {
        this.lookUpAnchor();
        engine.invalidate();
      };
      const onAttention = (event: Event) => {
        const kind = (event as CustomEvent<NexAttention>).detail;
        if (kind === "hold") this.attentionHold = true;
        else if (kind === "release") this.attentionHold = false;
        else if (kind === "pulse") this.attentionPulse = true;
        engine.invalidate();
      };
      window.addEventListener(NEX_ANCHOR_EVENT, onAnchor);
      own.defer(() => window.removeEventListener(NEX_ANCHOR_EVENT, onAnchor));
      window.addEventListener(NEX_ATTENTION_EVENT, onAttention);
      own.defer(() => window.removeEventListener(NEX_ATTENTION_EVENT, onAttention));
    } catch (error) {
      this.disposed = true;
      throw own.rollback(error);
    }
  }

  /**
   * Records the route, motion and visibility. Returns whether anything visible may have changed
   * (the Stage then invalidates once): a navigation or a motion change, as NEX reported before.
   */
  setProps(next: TransitionClockProps): boolean {
    if (this.disposed) return false;
    const prev = this.props;
    this.props = next;
    this.env.full = next.motion === "full";
    this.env.hidden = next.hidden;
    const routed = stageAgentFor(next.agent);
    const selected = definitionFor(routed) ? routed : null;
    const previous = this.selected;
    this.selected = selected;
    if (!prev) {
      // First props after (re)construction: show the route's agent at once (a first visit, deep
      // link or restore plays its arrival, never a morph).
      if (selected !== null && selected !== this.machine.source) {
        this.machine.select(selected);
        this.machine.snap();
      }
    } else {
      if (selected !== null && selected !== previous) this.machine.select(selected);
      if (prev.motion === "full" && next.motion !== "full") this.machine.snap();
    }
    let changed = false;
    // The anchor is looked up after each navigation (the route's DOM has committed by then).
    if (!prev || prev.path !== next.path) {
      this.lookUpAnchor();
      changed = true;
    }
    if (prev?.motion !== next.motion) changed = true;
    return changed;
  }

  update(engine: Engine, delta: number): void {
    const props = this.props;
    if (!props || this.disposed) return;
    const dt = Math.min(delta, MAX_STEP_SECONDS);
    const { report } = this.context;
    // An agent found unsupported since the last frame (its idle program failed to link) resolves to
    // its accessible fallback at once.
    this.machine.revalidate();
    if (report.status !== "none") this.machine.report(report.request, report.status);
    this.machine.tick(dt);
    this.project();
    this.appear(engine, dt, props.motion === "full");
    this.attend(dt, props.motion === "full");
    this.projectState();
  }

  /** The attention level: towards the hold level (or rest), jumping to 1 on a pulse. */
  private attend(dt: number, full: boolean): void {
    const v = this.context.transition.visibility;
    if (!full) {
      v.attention = 0;
      this.attentionPulse = false;
      return;
    }
    if (this.attentionPulse) {
      this.attentionPulse = false;
      v.attention = 1;
    }
    v.attention = damp(v.attention, this.attentionHold ? ATTENTION_HOLD : 0, dt, ATTENTION_SECONDS);
  }

  /** Projects the machine into the shared frame; a change of drawn agent restarts its appearance. */
  private project(): void {
    const m = this.machine;
    const t = this.context.transition;
    if (m.source !== t.source || m.swaps !== this.swaps) {
      const definition = definitionFor(m.source);
      if (definition) {
        writePalette(t.palette, m.source);
        this.drawn = definition;
      }
      if (m.source !== t.source) t.generation++;
      t.source = m.source;
      if (m.swaps !== this.swaps) {
        this.swaps = m.swaps;
        resetVisibility(t.visibility);
        this.shown = false;
        this.version = -1;
        this.anchored = m.source;
        this.lookUpAnchor();
      } else {
        // A morph's handoff: the destination is drawn as it ended the morph, fully formed (no
        // arrival); its fade, idle time and post-arrival fade continue, so nothing jumps.
        t.visibility.arrival = this.drawn.timing.arrival;
        this.shown = true;
        this.version = -1;
      }
    }
    // The anchor followed: a morph's endpoint while morphing (its destination, or its source when
    // reversing), the destination while preparing, else the drawn agent.
    const follow =
      m.kind === "morphing"
        ? m.direction > 0
          ? m.target
          : m.source
        : m.kind === "preparing"
          ? m.target
          : m.source;
    if (follow !== this.anchored) {
      this.anchored = follow;
      this.version = -1;
      this.lookUpAnchor();
    }
    const transitioning = m.kind === "preparing" || m.kind === "morphing";
    if (this.transitioning && !transitioning) {
      // Back to the drawn agent's own placement, recomputed at once (the segment ended on it).
      this.version = -1;
      this.segmentFor = null;
    }
    this.transitioning = transitioning;
    t.target = m.target;
    t.phase = m.phase;
    t.direction = m.direction;
    t.eased = m.eased;
    t.settle = m.settle;
    t.request = transitioning ? m.request : 0;
    this.projectState();
  }

  /** The state readers see: the machine's, with `arriving` while the drawn agent arrives. */
  private projectState(): void {
    const m = this.machine;
    const t = this.context.transition;
    const arriving =
      m.kind === "idle" &&
      this.env.full &&
      t.visibility.arrival < this.drawn.timing.arrival &&
      t.visibility.fade > 0;
    t.state = arriving ? "arriving" : m.kind;
  }

  private lookUpAnchor(): void {
    const placement = (definitionFor(this.anchored) ?? this.drawn).placement;
    const element = placement.kind === "anchor" ? document.querySelector(placement.selector) : null;
    const changed = this.anchor.setElement(element);
    // A new anchor for an agent that is shown: glide there from where it is drawn now, even from
    // just off screen (it flies back in to accompany the visitor). Full Motion only, outside a
    // morph, which has its own placement segments.
    const p = this.context.transition.placement;
    if (
      changed &&
      element !== null &&
      this.env.full &&
      !this.transitioning &&
      this.shown &&
      this.context.transition.visibility.fade > 0
    ) {
      startSegment(p, p.displayed);
      // Seeded where NEX is drawn, moving as he moves now (no stop at the handover).
      const d = p.displayed;
      const m = this.motion;
      const s = this.springs;
      s.x.x = d.x;
      s.y.x = d.y;
      s.s.x = logScale(d.scale);
      // Capped: an instant jump of the page (a link to a section) mustn't fling him.
      const clamp = (v: number, limit: number) =>
        m.valid ? Math.max(-limit, Math.min(limit, v)) : 0;
      s.x.v = clamp(m.vx, GLIDE_MAX_SPEED);
      s.y.v = clamp(m.vy, GLIDE_MAX_SPEED);
      s.s.v = clamp(m.vs, 3);
      this.gliding = true;
    }
  }

  /**
   * The drawn agent's fade, arrival, placement and idle time: NEX's Milestone 2.3 logic, moved here
   * unchanged (the same expressions, in the same order, under the same conditions).
   */
  private appear(engine: Engine, dt: number, full: boolean): void {
    const v = this.context.transition.visibility;
    const placement = this.drawn.placement;
    const timing = this.drawn.timing;
    // While a morph is prepared or runs, the drawn agent stays (its anchor may have left with the
    // old route) and its placement follows the morph's segment instead of its own anchor.
    const transitioning = this.transitioning;
    const box = !transitioning && placement.kind === "anchor" ? this.anchor.read() : null;
    const present = transitioning || (box ? box.present : true);

    // Appear / disappear with the anchor; the arrival replays each time the agent appears. Without
    // full motion the agent is always fully formed (also when motion is reduced during an arrival).
    v.fade = full
      ? Math.min(1, Math.max(0, v.fade + (present ? dt : -dt) / timing.fade))
      : present
        ? 1
        : 0;
    if (present && !this.shown) {
      this.shown = true;
      v.arrival = 0;
    }
    if (!full) v.arrival = timing.arrival;
    if (!present && v.fade === 0) this.shown = false;
    if (v.fade === 0) return;

    // Placement is recomputed only when the anchor box, viewport or field of view changed.
    const camera = engine.camera;
    const displayed = this.context.transition.placement.displayed;
    const version = box ? this.anchor.version : 0;
    if (transitioning) {
      this.gliding = false;
      this.morphPlacement(engine);
    } else if (this.gliding) {
      this.glide(engine, box, dt);
    } else if (
      present &&
      (version !== this.version ||
        engine.width !== this.width ||
        engine.height !== this.height ||
        camera.fov !== this.fov)
    ) {
      if (placement.kind === "anchor") placement.place(box!, engine, camera.fov, displayed);
      else placement.place(engine, camera.fov, displayed);
      this.version = version;
      this.width = engine.width;
      this.height = engine.height;
      this.fov = camera.fov;
    }
    this.context.transition.placement.gliding = this.gliding;
    this.track(displayed, dt);
    if (!displayed.onScreen) return;

    if (full) {
      v.time += dt * timing.pace;
      v.arrival = Math.min(timing.arrival, v.arrival + dt);
    }
    // The post-arrival fade (NEX's glow layer) starts once the arrival is complete.
    v.formed = full
      ? v.arrival >= timing.arrival
        ? Math.min(1, v.formed + dt / timing.fade)
        : 0
      : 1;
  }

  /**
   * The glide to a new anchor: a placement segment from the transform drawn when the anchor
   * changed towards the new anchor's placement, re-measured each frame (the page may scroll while
   * gliding). Ends on the anchor's own placement; a missing anchor or reduced motion ends it at once.
   */
  private glide(engine: Engine, box: { present: boolean } | null, dt: number): void {
    const p = this.context.transition.placement;
    const placement = this.drawn.placement;
    if (!this.env.full || placement.kind !== "anchor" || !box?.present) {
      this.gliding = false;
      this.version = -1;
      return;
    }
    // The target is re-measured every frame (the page may scroll, the viewport may change).
    placement.place(this.anchor.box, engine, engine.camera.fov, this.endpoint);
    copyPlacement(p.to, this.endpoint);
    const s = this.springs;
    const d = p.displayed;
    const target = this.endpoint;
    d.x = spring(s.x, target.x, dt, GLIDE_SPRING);
    d.y = spring(s.y, target.y, dt, GLIDE_SPRING);
    d.scale = Math.exp(spring(s.s, logScale(target.scale), dt, GLIDE_SPRING));
    d.onScreen = p.from.onScreen || target.onScreen || d.onScreen;
    // The springs snap position and velocity to rest together: all still means arrived.
    if (s.x.v === 0 && s.y.v === 0 && s.s.v === 0) {
      copyPlacement(d, target);
      this.gliding = false;
      // The next frame places the agent from its anchor again (equal to where the glide ended).
      this.version = -1;
    }
  }

  /**
   * The drawn transform's velocity (world units and log scale per second), lightly smoothed, so a
   * glide can start at the speed NEX is already moving (e.g. carried by the scrolling page).
   */
  private track(displayed: Placement, dt: number): void {
    const m = this.motion;
    const s = logScale(displayed.scale);
    if (this.gliding) {
      m.vx = this.springs.x.v;
      m.vy = this.springs.y.v;
      m.vs = this.springs.s.v;
    } else if (m.valid && dt > 0) {
      const k = 0.5;
      m.vx += ((displayed.x - m.x) / dt - m.vx) * k;
      m.vy += ((displayed.y - m.y) / dt - m.vy) * k;
      m.vs += ((s - m.s) / dt - m.vs) * k;
    }
    m.x = displayed.x;
    m.y = displayed.y;
    m.s = s;
    m.valid = displayed.scale > 0;
  }

  /**
   * Placement during a morph (proposal §8.4): a segment from the transform drawn last frame to the
   * endpoint's target, advanced with the morph's phase so it lands exactly when the morph ends. A
   * new segment starts when the morph starts or reverses, or the target moves substantially. While
   * preparing, and while the endpoint's anchor is absent, the drawn transform is retained.
   */
  private morphPlacement(engine: Engine): void {
    const m = this.machine;
    const p = this.context.transition.placement;
    if (m.kind !== "morphing") {
      this.segmentFor = null;
      this.lastPhase = m.phase;
      return;
    }
    const agent = this.anchored;
    const definition = definitionFor(agent);
    const fov = engine.camera.fov;
    let known = false;
    if (definition?.placement.kind === "fixed") {
      definition.placement.place(engine, fov, this.endpoint);
      known = true;
    } else if (definition?.placement.kind === "anchor") {
      const box = this.anchor.read();
      if (box?.present) {
        definition.placement.place(box, engine, fov, this.endpoint);
        known = true;
      }
    }
    const unitsPerPixel =
      (2 * CAMERA_DISTANCE * Math.tan((fov * Math.PI) / 360)) / Math.max(1, engine.height);
    if (
      known &&
      (this.segmentFor !== agent || movedSubstantially(p.to, this.endpoint, unitsPerPixel))
    ) {
      startSegment(p, this.endpoint);
      this.segmentFor = agent;
      this.segmentSpan = Math.max(Number.EPSILON, m.direction > 0 ? 1 - m.phase : m.phase);
      this.lastPhase = m.phase;
    }
    if (this.segmentFor === null) return;
    const step = Math.abs(m.phase - this.lastPhase);
    this.lastPhase = m.phase;
    advanceSegment(p, step, this.segmentSpan);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.release();
  }
}
