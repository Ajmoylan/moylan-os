import { describe, expect, it, vi } from "vitest";
import type { AgentId } from "~/agents/registry";
import { rgb } from "../ambient/config";
import type * as Definitions from "../agents/definitions";
import type { AgentRenderDefinition } from "../agents/types";
import type { Engine } from "../engine/Engine";
import { createTransition } from "./StageTransition";
import { TransitionClock } from "./TransitionClock";

/**
 * The single writer of the shared transition frame (Milestone 2.4b.1a, ADR-007): simulate phase,
 * idle only, NEX only; a change of the drawn agent lands at a frame boundary, never in a commit.
 */

const extra = vi.hoisted(() => ({ forge: false }));

vi.mock("../agents/definitions", async (original) => {
  const actual = await original<typeof Definitions>();
  return {
    definitionFor: (id: AgentId) =>
      id === "forge" && extra.forge
        ? ({ id: "forge", hotOverride: "#ffffff" } as AgentRenderDefinition)
        : actual.definitionFor(id),
  };
});

const engine = {} as Engine;

describe("StageTransition", () => {
  it("starts idle at NEX with the registry palette (NEX's approved values)", () => {
    const transition = createTransition();
    expect(transition).toMatchObject({ state: "idle", source: "nex", target: "nex" });
    expect(transition.palette.deep.toArray()).toEqual(rgb("#14a89c").toArray());
    expect(transition.palette.accent.toArray()).toEqual(rgb("#3fe0d0").toArray());
    expect(transition.palette.hot.toArray()).toEqual(rgb("#c9fbf5").toArray());
  });

  it("refuses an agent without a WebGL definition", () => {
    expect(() => createTransition("cipher")).toThrow(/cipher/);
  });
});

describe("TransitionClock", () => {
  it("runs in the simulate phase, before every agent", () => {
    expect(new TransitionClock(engine, { transition: createTransition() }).phase).toBe("simulate");
  });

  it("keeps NEX as the drawn agent on routes whose agent has no WebGL definition (1a)", () => {
    const transition = createTransition();
    const deep = transition.palette.deep;
    const before = deep.toArray();
    const clock = new TransitionClock(engine, { transition });
    for (const agent of ["nex", "forge", "syn", "atlas", "cipher"] as const) {
      expect(clock.setProps({ agent })).toBe(false); // nothing visible changes in a commit
      clock.update();
    }
    expect(transition).toMatchObject({
      state: "idle",
      source: "nex",
      target: "nex",
      generation: 0,
    });
    expect(transition.palette.deep).toBe(deep); // the same shared values, unchanged
    expect(deep.toArray()).toEqual(before);
  });

  it("applies a change of the drawn agent at the next frame, in place (the writer path)", () => {
    extra.forge = true;
    try {
      const transition = createTransition();
      const accent = transition.palette.accent;
      const clock = new TransitionClock(engine, { transition });
      clock.setProps({ agent: "forge" });
      expect(transition.source).toBe("nex"); // not inside the commit
      clock.update();
      expect(transition).toMatchObject({ source: "forge", target: "forge", generation: 1 });
      expect(transition.palette.accent).toBe(accent);
      expect(accent.toArray()).toEqual(rgb("#FFB347").toArray()); // FORGE primary (registry)
      clock.update();
      expect(transition.generation).toBe(1);
    } finally {
      extra.forge = false;
    }
  });

  it("a rebuilt clock (context restore) resets the frame to idle at the drawn agent", () => {
    const transition = createTransition();
    transition.target = "forge"; // as if a later phase had left a target behind
    new TransitionClock(engine, { transition });
    expect(transition).toMatchObject({ state: "idle", source: "nex", target: "nex" });
  });

  it("a disposed clock writes nothing", () => {
    extra.forge = true;
    try {
      const transition = createTransition();
      const clock = new TransitionClock(engine, { transition });
      clock.setProps({ agent: "forge" });
      clock.dispose();
      clock.update();
      expect(clock.setProps({ agent: "forge" })).toBe(false);
      expect(transition.source).toBe("nex");
    } finally {
      extra.forge = false;
    }
  });
});
