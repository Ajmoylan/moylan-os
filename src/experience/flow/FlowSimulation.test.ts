import type { WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import { FlowSimulation } from "./FlowSimulation";
import { createInteraction } from "./interaction";

/**
 * The shared flow as the engine's simulate phase (Milestone 2.4a, ADR-004): allocation only with
 * pointer effects, one pointer listener, the analytic fallback, and transactional start-up.
 */

const flow = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("./FlowField", () => ({
  FLOW_RANGE: 8,
  FlowField: { create: flow.create },
}));

function fakeField(format: "half-float" | "rgba8" = "half-float") {
  return { format, texture: { isTexture: true }, step: vi.fn(), dispose: vi.fn() };
}

let stage: HTMLElement;
let engine: Engine;
let pointerListeners: number;

beforeEach(() => {
  stage = document.createElement("div");
  engine = { renderer: {} as WebGLRenderer, width: 1200, height: 800 } as unknown as Engine;
  pointerListeners = 0;
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, ...rest) => {
    if (type === "pointermove") pointerListeners++;
    add(type, ...(rest as [EventListener]));
  });
  vi.spyOn(window, "removeEventListener").mockImplementation((type, ...rest) => {
    if (type === "pointermove") pointerListeners--;
    remove(type, ...(rest as [EventListener]));
  });
  flow.create.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("FlowSimulation", () => {
  it("runs in the simulate phase, before every agent", () => {
    expect(new FlowSimulation(engine, { stage, interaction: createInteraction(0.1) }).phase).toBe(
      "simulate",
    );
  });

  it("allocates nothing and attaches no listener without pointer effects", () => {
    const interaction = createInteraction(0.1);
    const sim = new FlowSimulation(engine, { stage, interaction });
    expect(sim.setProps({ pointerEffects: false, flowSize: 256 })).toBe(true);
    expect(flow.create).not.toHaveBeenCalled();
    expect(pointerListeners).toBe(0);
    expect(interaction.mode).toBe("none");
    expect(stage.dataset.stageFlow).toBe("none");
    expect(stage.dataset.stageDrawCalls).toBe("1");
    expect(sim.setProps({ pointerEffects: false, flowSize: 256 })).toBe(false);
  });

  it("owns the only pointer listener and writes the flow texture each frame", () => {
    const field = fakeField();
    flow.create.mockReturnValue(field);
    const interaction = createInteraction(0.1);
    const sim = new FlowSimulation(engine, { stage, interaction });
    sim.setProps({ pointerEffects: true, flowSize: 256 });
    expect(pointerListeners).toBe(1);
    expect(interaction.mode).toBe("half-float");
    expect(stage.dataset.stageFlow).toBe("half-float");
    expect(stage.dataset.stageDrawCalls).toBe("2");
    sim.update(engine, 0.016);
    expect(field.step).toHaveBeenCalledTimes(1);
    expect(interaction.texture).toBe(field.texture);
  });

  it("falls back to the analytic pointer when no render-target format validates", () => {
    flow.create.mockReturnValue(null);
    const interaction = createInteraction(0.1);
    const sim = new FlowSimulation(engine, { stage, interaction });
    sim.setProps({ pointerEffects: true, flowSize: 64 });
    expect(interaction.mode).toBe("analytic");
    expect(stage.dataset.stageFlow).toBe("analytic");
    sim.update(engine, 0.016);
    expect(interaction.texture).toBeNull();
  });

  it("turning pointer effects off releases the flow map and the listener", () => {
    const field = fakeField("rgba8");
    flow.create.mockReturnValue(field);
    const interaction = createInteraction(0.1);
    const sim = new FlowSimulation(engine, { stage, interaction });
    sim.setProps({ pointerEffects: true, flowSize: 256 });
    sim.setProps({ pointerEffects: false, flowSize: 64 });
    expect(field.dispose).toHaveBeenCalledTimes(1);
    expect(pointerListeners).toBe(0);
    expect(interaction.mode).toBe("none");
    expect(interaction.texture).toBeNull();
  });

  it("a failing flow-map creation leaves nothing attached and propagates (fault injection)", () => {
    flow.create.mockImplementation(() => {
      throw new Error("render target");
    });
    const interaction = createInteraction(0.1);
    const sim = new FlowSimulation(engine, { stage, interaction });
    expect(() => sim.setProps({ pointerEffects: true, flowSize: 256 })).toThrow("render target");
    expect(pointerListeners).toBe(0);
    expect(interaction.mode).toBe("none");
    sim.dispose();
    expect(pointerListeners).toBe(0);
  });

  it("a failing listener attachment releases the new flow map (fault injection)", () => {
    const field = fakeField();
    flow.create.mockReturnValue(field);
    vi.mocked(window.addEventListener).mockImplementation(() => {
      throw new Error("listener");
    });
    const sim = new FlowSimulation(engine, { stage, interaction: createInteraction(0.1) });
    expect(() => sim.setProps({ pointerEffects: true, flowSize: 256 })).toThrow("listener");
    expect(field.dispose).toHaveBeenCalledTimes(1);
  });

  it("dispose is idempotent and stops updates", () => {
    const field = fakeField();
    flow.create.mockReturnValue(field);
    const interaction = createInteraction(0.1);
    const sim = new FlowSimulation(engine, { stage, interaction });
    sim.setProps({ pointerEffects: true, flowSize: 256 });
    sim.dispose();
    sim.dispose();
    expect(field.dispose).toHaveBeenCalledTimes(1);
    expect(pointerListeners).toBe(0);
    sim.update(engine, 0.016);
    expect(field.step).not.toHaveBeenCalled();
    expect(sim.setProps({ pointerEffects: true, flowSize: 256 })).toBe(false);
  });
});
