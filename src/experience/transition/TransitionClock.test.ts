import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentId } from "~/agents/registry";
import { rgb } from "../ambient/config";
import type * as Definitions from "../agents/definitions";
import type { AgentRenderDefinition } from "../agents/types";
import type { Engine } from "../engine/Engine";
import { ARRIVAL_SECONDS, FADE_SECONDS, NEX_ANCHOR, NEX_PACE } from "../nex/NexAvatar";
import { NEX_PARAMS } from "../nex/params";
import { CAMERA_DISTANCE, placeNex } from "../nex/placement";
import { createMorphReport, createTransition } from "./StageTransition";
import { TransitionClock, type TransitionClockProps } from "./TransitionClock";

/**
 * The single transition timeline (Milestone 2.4b.2): the only writer of the shared frame. It owns
 * the drawn agent's anchor, fade, arrival, post-arrival fade, idle time and placement (NEX's
 * original arithmetic; frame-by-frame identity is in nex/appearance.test.ts), and the transition
 * machine (selections, swaps, hidden tabs, Reduced Motion, restores).
 */

const anchor = vi.hoisted(() => ({
  box: { present: true, left: 600, top: 200, width: 400, height: 400 },
  version: 1,
  attached: 0,
  detached: 0,
  elements: [] as (Element | null)[],
}));

vi.mock("../nex/anchor", () => ({
  AnchorTracker: class {
    get version() {
      return anchor.version;
    }
    attach() {
      anchor.attached++;
    }
    detach() {
      anchor.detached++;
    }
    setElement(element: Element | null) {
      anchor.elements.push(element);
    }
    read() {
      return anchor.box;
    }
  },
}));

/**
 * Fake agents, off by default: "forge" (supported, fixed placement) for swap tests, and "syn"
 * (declares no idle transport: unsupported everywhere) for the unsupported-destination tests.
 */
const extra = vi.hoisted(() => ({ forge: false }));

vi.mock("../agents/definitions", async (original) => {
  const actual = await original<typeof Definitions>();
  return {
    stageAgentFor: (agent: AgentId) => agent,
    definitionFor: (id: AgentId) => {
      if (id === "syn" && extra.forge) {
        return {
          ...actual.definitionFor("nex")!,
          id: "syn",
          hotOverride: "#ffffff",
          transports: { idle: [], uniformVectors: {} },
        } as unknown as AgentRenderDefinition;
      }
      if (id !== "forge" || !extra.forge) return actual.definitionFor(id);
      return {
        ...actual.definitionFor("nex")!,
        id: "forge",
        hotOverride: "#ffffff",
        timing: { arrival: 1, fade: 0.5, pace: 1 },
        placement: {
          kind: "fixed",
          place: (_viewport: unknown, _fov: number, out: object) =>
            Object.assign(out, { x: 1, y: 2, scale: 0.5, onScreen: true }),
        },
      } as unknown as AgentRenderDefinition;
    },
  };
});

function engine(): Engine {
  const camera = new PerspectiveCamera(NEX_PARAMS.fov, 1.5, 0.1, 40);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  return { camera, width: 1200, height: 800, dpr: 2, invalidate: vi.fn() } as unknown as Engine;
}

const props = (overrides: Partial<TransitionClockProps> = {}): TransitionClockProps => ({
  agent: "nex",
  path: "/",
  motion: "full",
  hidden: false,
  ...overrides,
});

function rig() {
  const e = engine();
  const transition = createTransition("nex");
  const report = createMorphReport();
  const clock = new TransitionClock(e, { transition, report });
  const run = (seconds: number, delta = 0.016) => {
    for (let t = 0; t < seconds - 1e-9; t += delta) clock.update(e, delta);
  };
  return { e, transition, report, clock, run };
}

beforeEach(() => {
  anchor.box = { present: true, left: 600, top: 200, width: 400, height: 400 };
  anchor.version = 1;
  anchor.attached = anchor.detached = 0;
  anchor.elements.length = 0;
  extra.forge = false;
  document.body.innerHTML = '<div data-stage-anchor="nex"></div>';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("StageTransition", () => {
  it("starts idle at NEX with the registry palette (NEX's approved values)", () => {
    const transition = createTransition();
    expect(transition).toMatchObject({ state: "idle", source: "nex", target: "nex", request: 0 });
    expect(transition.palette.deep.toArray()).toEqual(rgb("#14a89c").toArray());
    expect(transition.palette.accent.toArray()).toEqual(rgb("#3fe0d0").toArray());
    expect(transition.palette.hot.toArray()).toEqual(rgb("#c9fbf5").toArray());
    expect(transition.visibility).toEqual({ fade: 0, arrival: 0, formed: 0, time: 0 });
  });

  it("refuses an agent without a WebGL definition", () => {
    expect(() => createTransition("cipher")).toThrow(/cipher/);
  });
});

describe("TransitionClock", () => {
  it("runs in the simulate phase and owns the drawn agent's single anchor tracker", () => {
    const { clock } = rig();
    expect(clock.phase).toBe("simulate");
    expect(anchor.attached).toBe(1);
    clock.setProps(props());
    expect(anchor.elements).toEqual([document.querySelector(NEX_ANCHOR)]);
    clock.setProps(props({ path: "/ai" })); // looked up again after each navigation
    expect(anchor.elements).toHaveLength(2);
    clock.dispose();
    clock.dispose();
    expect(anchor.detached).toBe(1);
  });

  it("reports a navigation or motion change (one invalidation), nothing else", () => {
    const { clock } = rig();
    expect(clock.setProps(props())).toBe(true);
    expect(clock.setProps(props())).toBe(false);
    expect(clock.setProps(props({ hidden: true }))).toBe(false);
    expect(clock.setProps(props({ motion: "reduced" }))).toBe(true);
    expect(clock.setProps(props({ motion: "reduced", path: "/ai" }))).toBe(true);
  });

  it("fades in, arrives over the agent's timing, then fades the post-arrival layer in", () => {
    const { e, clock, transition, run } = rig();
    clock.setProps(props());
    run(0.016);
    expect(transition.state).toBe("arriving");
    expect(transition.visibility.fade).toBeCloseTo(0.016 / FADE_SECONDS, 12);
    run(FADE_SECONDS);
    expect(transition.visibility.fade).toBe(1);
    run(ARRIVAL_SECONDS);
    expect(transition.visibility.arrival).toBe(ARRIVAL_SECONDS);
    expect(transition.state).toBe("idle");
    run(FADE_SECONDS + 0.05);
    expect(transition.visibility.formed).toBe(1);
    // Idle time advances at the agent's pace.
    const time = transition.visibility.time;
    clock.update(e, 0.016);
    expect(transition.visibility.time).toBeCloseTo(time + 0.016 * NEX_PACE, 12);
  });

  it("places the agent from its anchor, recomputing only when the box, viewport or fov change", () => {
    const { e, clock, transition, run } = rig();
    clock.setProps(props());
    run(0.032);
    const expected = placeNex(anchor.box, e, NEX_PARAMS.fov);
    expect(transition.placement.displayed).toEqual(expected);
    anchor.box = { ...anchor.box, top: 100 }; // moved, but the version is unchanged: not re-read
    run(0.032);
    expect(transition.placement.displayed).toEqual(expected);
    anchor.version++;
    run(0.016);
    expect(transition.placement.displayed).toEqual(placeNex(anchor.box, e, NEX_PARAMS.fov));
    Object.assign(e, { width: 800 });
    run(0.016);
    expect(transition.placement.displayed).toEqual(placeNex(anchor.box, e, NEX_PARAMS.fov));
  });

  it("clamps its own step: a long stall advances the arrival by at most MAX_STEP_SECONDS", () => {
    const { e, clock, transition } = rig();
    clock.setProps(props());
    clock.update(e, 0.016);
    const before = transition.visibility.arrival;
    clock.update(e, 5); // raw elapsed time from the engine
    expect(transition.visibility.arrival - before).toBeCloseTo(0.1, 12);
  });

  it("fades out with a vanished anchor; it arrives again when the anchor returns", () => {
    const { clock, transition, run } = rig();
    clock.setProps(props());
    run(3.5);
    anchor.box = { ...anchor.box, present: false };
    run(FADE_SECONDS + 0.05);
    expect(transition.visibility.fade).toBe(0);
    anchor.box = { ...anchor.box, present: true };
    run(0.016);
    expect(transition.visibility.arrival).toBeLessThan(0.05);
    expect(transition.state).toBe("arriving");
  });

  it("without Full Motion the agent is formed at once and its idle time stands still", () => {
    const { clock, transition, run } = rig();
    clock.setProps(props({ motion: "reduced" }));
    run(0.05);
    expect(transition.visibility).toEqual({
      fade: 1,
      arrival: ARRIVAL_SECONDS,
      formed: 1,
      time: 0,
    });
    expect(transition.state).toBe("idle");
  });

  it("keeps NEX as the drawn agent on routes whose agent has no WebGL definition", () => {
    const { clock, transition, run } = rig();
    clock.setProps(props());
    for (const agent of ["forge", "syn", "atlas", "cipher", "nex"] as const) {
      clock.setProps(props({ agent, path: `/${agent}` }));
      run(0.032);
    }
    expect(transition).toMatchObject({ source: "nex", target: "nex", generation: 0 });
  });

  it("a rebuilt clock (context restore) draws the latest destination, which arrives again", () => {
    const { clock, transition, run } = rig();
    clock.setProps(props());
    run(3.5);
    expect(transition.visibility.arrival).toBe(ARRIVAL_SECONDS);
    clock.dispose();
    const e = engine();
    const rebuilt = new TransitionClock(e, { transition, report: createMorphReport() });
    expect(transition.visibility).toEqual({ fade: 0, arrival: 0, formed: 0, time: 0 });
    rebuilt.setProps(props());
    rebuilt.update(e, 0.016);
    expect(transition.state).toBe("arriving");
    rebuilt.dispose();
  });

  describe("request numbers across context restores (Codex finding 1)", () => {
    beforeEach(() => {
      extra.forge = true;
    });

    /** Selects FORGE on a clock and returns the request it issued (left unanswered). */
    function prepare(
      clock: TransitionClock,
      e: Engine,
      transition: ReturnType<typeof createTransition>,
    ) {
      clock.setProps(props());
      clock.setProps(props({ agent: "forge", path: "/engineering" }));
      clock.update(e, 0.016);
      expect(transition.state).toBe("preparing");
      return transition.request;
    }
    /** A context restore: the clock is rebuilt; the frame and the report outlive it. */
    function restore(
      old: TransitionClock,
      transition: ReturnType<typeof createTransition>,
      report: ReturnType<typeof createMorphReport>,
    ) {
      old.dispose();
      transition.target = "nex"; // back on NEX's route when restored
      const e = engine();
      return { clock: new TransitionClock(e, { transition, report }), e };
    }

    it("a restore during preparing, before any answer (status none), never reissues the number", () => {
      const { e, clock, transition, report } = rig();
      const first = prepare(clock, e, transition);
      expect(report.status).toBe("none");
      const r = restore(clock, transition, report);
      const second = prepare(r.clock, r.e, transition);
      expect(second).not.toBe(first);
      expect(second).toBeGreaterThan(first);
      r.clock.dispose();
    });

    it("repeated restores with unanswered requests issue strictly increasing, distinct numbers", () => {
      const { e, clock, transition, report } = rig();
      const issued = [prepare(clock, e, transition)];
      let current = { clock, e };
      for (let i = 0; i < 5; i++) {
        current = restore(current.clock, transition, report);
        issued.push(prepare(current.clock, current.e, transition));
      }
      expect(new Set(issued).size).toBe(issued.length);
      expect([...issued].sort((a, b) => a - b)).toEqual(issued);
      expect(transition.issued).toBe(issued.at(-1));
      current.clock.dispose();
    });

    it("a stale answer arriving after a newer request exists is ignored", () => {
      const { e, clock, transition, report } = rig();
      const first = prepare(clock, e, transition);
      const r = restore(clock, transition, report);
      const second = prepare(r.clock, r.e, transition);
      Object.assign(report, { request: first, status: "failed" }); // late, for the old request
      r.clock.update(r.e, 0.016);
      expect([transition.state, transition.request]).toEqual(["preparing", second]);
      Object.assign(report, { request: second, status: "failed" }); // the current one
      r.clock.update(r.e, 0.016);
      expect(transition.source).toBe("forge");
      r.clock.dispose();
    });

    it("a cancelled request's number is never reused, and its late answer is ignored", () => {
      const { e, clock, transition, report } = rig();
      const first = prepare(clock, e, transition);
      clock.setProps(props()); // back to NEX: the preparation is cancelled
      clock.update(e, 0.016);
      expect(transition.state).not.toBe("preparing"); // NEX again (still arriving here)
      expect([transition.source, transition.request]).toEqual(["nex", 0]);
      clock.setProps(props({ agent: "forge", path: "/engineering" }));
      clock.update(e, 0.016);
      const second = transition.request;
      expect(second).toBeGreaterThan(first);
      Object.assign(report, { request: first, status: "failed" });
      clock.update(e, 0.016);
      expect([transition.state, transition.request]).toEqual(["preparing", second]);
      clock.dispose();
    });
  });

  describe("with a second agent (fake)", () => {
    beforeEach(() => {
      extra.forge = true;
    });

    it("a swap writes the new palette in place, bumps the generation and restarts its appearance", () => {
      const { clock, transition, report, run } = rig();
      clock.setProps(props());
      run(3.5);
      const accent = transition.palette.accent;
      clock.setProps(props({ agent: "forge", path: "/engineering" }));
      run(0.016);
      expect(transition.state).toBe("preparing");
      // AgentCore answers (here: no morph program) → the clock swaps at its next frame.
      Object.assign(report, { request: transition.request, status: "failed" });
      run(0.016);
      expect(transition).toMatchObject({ source: "forge", target: "forge", generation: 1 });
      expect(transition.palette.accent).toBe(accent);
      expect(accent.toArray()).toEqual(rgb("#FFB347").toArray());
      // The new agent's own appearance: fixed placement, its timing, a fresh arrival.
      expect(transition.placement.displayed).toEqual({ x: 1, y: 2, scale: 0.5, onScreen: true });
      expect(transition.visibility.arrival).toBeCloseTo(0.016, 12);
      expect(transition.state).toBe("arriving");
      expect(anchor.elements.at(-1)).toBeNull(); // a fixed placement uses no anchor
    });

    it("a first visit or deep link shows the route's agent at once (no morph)", () => {
      const { clock, transition, run } = rig();
      clock.setProps(props({ agent: "forge", path: "/engineering" }));
      run(0.016);
      expect(transition).toMatchObject({ source: "forge", target: "forge", state: "arriving" });
    });

    it("a selection made while hidden is applied as one swap at the first visible frame", () => {
      const { clock, transition, run } = rig();
      clock.setProps(props());
      run(0.5);
      clock.setProps(props({ hidden: true }));
      clock.setProps(props({ hidden: true, agent: "forge", path: "/engineering" }));
      expect(transition.source).toBe("nex");
      clock.setProps(props({ agent: "forge", path: "/engineering" }));
      run(0.016);
      expect(transition).toMatchObject({ source: "forge", state: "arriving" });
    });

    it("under Reduced Motion a selection swaps at once and the agent is formed and still", () => {
      const { clock, transition, run } = rig();
      clock.setProps(props({ motion: "reduced" }));
      run(0.016);
      clock.setProps(props({ motion: "reduced", agent: "forge", path: "/engineering" }));
      run(0.016);
      expect(transition).toMatchObject({ source: "forge", state: "idle" });
      expect(transition.visibility).toEqual({ fade: 1, arrival: 1, formed: 1, time: 0 });
    });

    it("Reduced Motion becoming active while preparing snaps to the destination", () => {
      const { clock, transition, run } = rig();
      clock.setProps(props());
      run(0.5);
      clock.setProps(props({ agent: "forge", path: "/engineering" }));
      run(0.016);
      expect(transition.state).toBe("preparing");
      clock.setProps(props({ agent: "forge", path: "/engineering", motion: "reduced" }));
      run(0.016);
      expect(transition).toMatchObject({ source: "forge", state: "idle" });
    });

    it("an unsupported destination is drawn as unsupported at the next frame, with no request", () => {
      const { e, clock, transition, run } = rig();
      clock.setProps(props());
      run(0.5);
      clock.setProps(props({ agent: "forge", path: "/engineering" }));
      run(0.016);
      expect(transition.state).toBe("preparing");
      const issued = transition.issued;
      clock.setProps(props({ agent: "syn", path: "/ai" }));
      clock.update(e, 0.016); // the very next frame
      expect(transition).toMatchObject({
        state: "unsupported",
        source: "syn",
        target: "syn",
        request: 0,
      });
      expect(transition.issued).toBe(issued); // no preparation for an unsupported agent
    });
  });
});
