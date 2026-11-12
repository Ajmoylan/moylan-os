import type { StageAgent as AgentId } from "../agents/types";

/**
 * The transition state machine (Milestone 2.4b.2; proposal §8.3). Pure: no Three.js, no DOM, no
 * clock of its own. `TransitionClock` (the single transition timeline) feeds it selections, morph
 * reports and the clamped frame step, and projects it into `StageTransition`. Mutable fields and
 * no allocation per `tick()`.
 *
 * States: `idle(agent)`, `preparing(source → target)` while AgentCore readies the morph,
 * `morphing(source → target)` along one phase coordinate, `settling(agent)` while the destination's
 * idle renderer takes over, and `unsupported(agent)` when the agent can't render on this device.
 * A change of the drawn agent without a morph is a *swap* (`swaps` counts them): Reduced Motion,
 * hidden tabs, a failed or timed-out preparation, unsupported agents.
 */

export type MachineKind = "idle" | "preparing" | "morphing" | "settling" | "unsupported";

export interface MachineTiming {
  /** Full morph duration (s). */
  morph: number;
  /** Settle window after a forward morph (s). */
  settle: number;
  /** Longest wait for a morph's resources before swapping instead (s). */
  prepareCap: number;
  /** A pending re-target finishes the current morph within this time (s). */
  boost: number;
}

export const DEFAULT_MACHINE_TIMING: MachineTiming = {
  morph: 1.3,
  settle: 0.4,
  prepareCap: 1.5,
  boost: 0.3,
};

export interface MachineEnvironment {
  /** The agent has a definition with a viable transport on this device. */
  supported(agent: AgentId): boolean;
  /** Full Motion (morphs allowed); otherwise every change is a swap. */
  full: boolean;
  /** The tab is hidden: changes are applied as a swap at the first visible frame. */
  hidden: boolean;
}

/** easeInOutCubic: a pure function of the phase, so reversing retraces the same curve. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** A private monotonic counter (the default allocator; the clock passes a Stage-lifetime one). */
function counter(): () => number {
  let last = 0;
  return () => ++last;
}

export class TransitionMachine {
  kind: MachineKind = "idle";
  source: AgentId;
  target: AgentId;
  phase = 0;
  direction: 1 | -1 = 1;
  settle = 0;
  /** The current morph request (AgentCore prepares it); 0 when none. */
  request = 0;
  /** The latest selection while morphing (only the latest is kept). */
  pending: AgentId | null = null;
  /** Phase speed multiplier (> 1 while a pending selection is finishing the current morph). */
  speed = 1;
  /** Seconds spent preparing. */
  waited = 0;
  /** Number of agent changes made without a morph. */
  swaps = 0;
  private hiddenSelection: AgentId | null = null;

  /**
   * `allocate` issues morph request numbers. It must be **Stage-lifetime and monotonic** (the
   * clock passes a counter kept in the Stage's transition frame), so a machine rebuilt after a
   * context restore never reissues a number that any earlier request (answered or not) used, and a
   * stale answer can never match a new request. The default is a private counter (tests).
   */
  constructor(
    agent: AgentId,
    private env: MachineEnvironment,
    private readonly timing: MachineTiming = DEFAULT_MACHINE_TIMING,
    private readonly allocate: () => number = counter(),
  ) {
    this.source = agent;
    this.target = agent;
    if (!env.supported(agent)) this.kind = "unsupported";
  }

  configure(env: MachineEnvironment): void {
    this.env = env;
  }

  /** The destination the visitor asked for last (what a snap or a restore shows). */
  get latest(): AgentId {
    if (this.hiddenSelection !== null) return this.hiddenSelection;
    switch (this.kind) {
      case "preparing":
        return this.target;
      case "morphing":
        return this.pending ?? (this.direction > 0 ? this.target : this.source);
      default:
        return this.source;
    }
  }

  /** The visitor selected `agent` (a route change). */
  select(agent: AgentId): void {
    if (this.env.hidden) {
      this.hiddenSelection = agent;
      return;
    }
    // An unsupported destination resolves at once from any state to its accessible fallback: no
    // preparation request, no pending entry; any preparation or morph in progress is dropped.
    if (!this.env.supported(agent)) {
      if (!(this.kind === "unsupported" && agent === this.source)) this.swap(agent);
      return;
    }
    const settled = this.kind === "idle" || this.kind === "unsupported";
    if (!this.env.full) {
      if (!(settled && agent === this.source)) this.swap(agent);
      return;
    }
    switch (this.kind) {
      case "idle":
      case "settling":
      case "unsupported":
        // Selecting the agent already drawn (or settling into place) changes nothing.
        if (agent === this.source) return;
        if (this.kind === "unsupported") this.swap(agent);
        else this.prepare(this.source, agent);
        return;
      case "preparing":
        if (agent === this.target) return;
        if (agent === this.source) this.toIdle(this.source);
        else this.prepare(this.source, agent);
        return;
      case "morphing":
        if (agent === this.target) {
          this.direction = 1;
          this.pending = null;
          this.speed = 1;
        } else if (agent === this.source) {
          this.direction = -1;
          this.pending = null;
          this.speed = 1;
        } else {
          this.pending = agent;
          const remaining = this.direction > 0 ? 1 - this.phase : this.phase;
          this.speed = Math.max(1, (remaining * this.timing.morph) / this.timing.boost);
        }
        return;
    }
  }

  /**
   * AgentCore's answer to the current request. Answers to any other request are stale. While
   * morphing, "failed" means the morph's resources are gone (a tier change aborted them): the
   * latest destination is then shown at once (a swap).
   */
  report(request: number, status: "ready" | "failed"): void {
    if (request !== this.request) return;
    if (this.kind === "morphing") {
      if (status === "failed") this.swap(this.latest);
      return;
    }
    if (this.kind !== "preparing") return;
    if (status === "ready") {
      this.kind = "morphing";
      this.phase = 0;
      this.direction = 1;
      this.speed = 1;
      this.pending = null;
    } else {
      this.swap(this.target);
    }
  }

  /** One frame of the shared timeline (`step`: the clock's clamped frame step, seconds). */
  tick(step: number): void {
    if (this.hiddenSelection !== null) {
      const agent = this.hiddenSelection;
      this.hiddenSelection = null;
      const settled = this.kind === "idle" || this.kind === "unsupported";
      if (!(settled && agent === this.source)) this.swap(agent);
    }
    switch (this.kind) {
      case "preparing":
        this.waited += step;
        if (this.waited >= this.timing.prepareCap) this.swap(this.target);
        return;
      case "morphing": {
        this.phase += (this.direction * step * this.speed) / this.timing.morph;
        if (this.direction > 0 && this.phase >= 1) this.finish(this.target, true);
        else if (this.direction < 0 && this.phase <= 0) this.finish(this.source, false);
        return;
      }
      case "settling":
        this.settle += step / this.timing.settle;
        if (this.settle >= 1) this.toIdle(this.source);
        return;
      default:
        return;
    }
  }

  /** Reduced Motion became active: show the latest destination at once. */
  snap(): void {
    const agent = this.latest;
    this.hiddenSelection = null;
    const settled = this.kind === "idle" || this.kind === "unsupported";
    if (!(settled && agent === this.source)) this.swap(agent);
  }

  /** The morph's remaining duration in its current direction (s; 0 outside `morphing`). */
  get remaining(): number {
    if (this.kind !== "morphing") return 0;
    const left = this.direction > 0 ? 1 - this.phase : this.phase;
    return (left * this.timing.morph) / this.speed;
  }

  /**
   * The environment's support may change within a context (an idle program that failed to link
   * makes its agent unsupported): a drawn agent no longer supported goes to `unsupported` (no swap:
   * the drawn agent is unchanged), and a preparation towards one resolves to it at once.
   */
  revalidate(): void {
    if (this.kind === "unsupported") return;
    if (
      (this.kind === "preparing" || this.kind === "morphing") &&
      !this.env.supported(this.target)
    ) {
      this.swap(this.target);
      return;
    }
    if (!this.env.supported(this.source)) this.toIdle(this.source);
  }

  /** The eased phase (pure function of `phase`). */
  get eased(): number {
    return easeInOutCubic(this.phase);
  }

  private finish(agent: AgentId, forward: boolean): void {
    const pending = this.pending;
    this.pending = null;
    this.speed = 1;
    this.phase = forward ? 1 : 0;
    this.source = agent;
    this.target = agent;
    this.request = 0;
    if (pending !== null && pending !== agent) {
      // The next transition starts at once from the endpoint reached (no settle window).
      this.kind = "idle";
      this.phase = 0;
      this.select(pending);
    } else if (forward) {
      this.kind = "settling";
      this.settle = 0;
    } else {
      this.toIdle(agent);
    }
  }

  private prepare(source: AgentId, target: AgentId): void {
    this.kind = "preparing";
    this.source = source;
    this.target = target;
    this.request = this.allocate();
    this.waited = 0;
    this.phase = 0;
    this.direction = 1;
    this.pending = null;
    this.speed = 1;
  }

  private toIdle(agent: AgentId): void {
    this.kind = this.env.supported(agent) ? "idle" : "unsupported";
    this.source = agent;
    this.target = agent;
    this.phase = 0;
    this.direction = 1;
    this.settle = 0;
    this.request = 0;
    this.pending = null;
    this.speed = 1;
    this.waited = 0;
  }

  /** Change the drawn agent without a morph. */
  private swap(agent: AgentId): void {
    this.toIdle(agent);
    this.swaps++;
  }
}
