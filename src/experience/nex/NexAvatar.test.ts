import { BufferGeometry, PerspectiveCamera, Scene, ShaderMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ShapeModule from "./shape";
import { nexPalette, rgb } from "../ambient/config";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { createTransition } from "../transition/StageTransition";
import { NexAvatar, type NexAvatarProps } from "./NexAvatar";
import { generateNexShape } from "./shape";

/**
 * NEX's renderer (Milestone 2.4a; hosted by AgentCore since 2.4b): change reporting, transactional
 * construction and geometry rebuilds, complete and idempotent disposal (fault injection with real
 * Three.js objects). Since 2.4b.2 its appearance and placement come from TransitionClock (tested in
 * transition/TransitionClock.test.ts and, frame by frame against 2ceeff8, nex/appearance.test.ts).
 */

const faults = vi.hoisted(() => ({ shape: false }));

vi.mock("./shape", async (original) => {
  const actual = await original<typeof ShapeModule>();
  return {
    ...actual,
    generateNexShape: (count: number) => {
      if (faults.shape) throw new Error("shape");
      return actual.generateNexShape(count);
    },
  };
});

/** Materials and geometries a NEX layer creates: 6 materials; rings, quad, sphere, 2 particle. */
const MATERIALS = 6;
const GEOMETRIES = 5;

let scene: Scene;
let engine: Engine;
let stage: HTMLElement;
let geometryDisposals: ReturnType<typeof vi.spyOn>;
let materialDisposals: ReturnType<typeof vi.spyOn>;

const props = (overrides: Partial<NexAvatarProps> = {}): NexAvatarProps => ({
  particles: 1_200,
  particleShare: 1,
  glowLayer: true,
  motion: "full",
  path: "/",
  ...overrides,
});

const nex = () =>
  new NexAvatar(engine, {
    stage,
    interaction: createInteraction(0.1),
    colours: {
      deep: rgb(nexPalette.base),
      accent: rgb(nexPalette.accent),
      hot: rgb(nexPalette.hot),
    },
    shape: (count) => generateNexShape(count),
    orbitTransport: "uniforms",
    visibility: transition.visibility,
    placement: transition.placement,
  });

let transition = createTransition("nex");

beforeEach(() => {
  faults.shape = false;
  transition = createTransition("nex");
  scene = new Scene();
  stage = document.createElement("div");
  engine = {
    scene,
    camera: new PerspectiveCamera(20, 1.5, 0.1, 40),
    invalidate: vi.fn(),
  } as unknown as Engine;
  geometryDisposals = vi.spyOn(BufferGeometry.prototype, "dispose");
  materialDisposals = vi.spyOn(ShaderMaterial.prototype, "dispose");
});

afterEach(() => vi.restoreAllMocks());

describe("NexAvatar layer", () => {
  it("is an update-phase layer: one group in the scene", () => {
    const n = nex();
    expect(n.phase).toBe("update");
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]!.children).toHaveLength(6); // atmosphere, lines, points ×2, shell, glow
  });

  it("draws what the transition clock decided: hidden at fade 0, placed and visible on screen", () => {
    const n = nex();
    n.setProps(props());
    const root = scene.children[0]!;
    n.update(engine);
    expect(root.visible).toBe(false);
    expect(stage.dataset.nexState).toBe("hidden");
    Object.assign(transition.visibility, { fade: 0.5, arrival: 1.2, formed: 0, time: 3 });
    Object.assign(transition.placement.displayed, { x: 0.25, y: -0.5, scale: 0.8, onScreen: true });
    n.update(engine);
    expect(root.visible).toBe(true);
    expect(root.position.toArray()).toEqual([0.25, -0.5, 0]);
    expect(root.scale.x).toBe(0.8);
    expect(stage.dataset.nexState).toBe("visible");
    expect(stage.dataset.nexFormed).toBe("false");
    transition.placement.displayed.onScreen = false;
    n.update(engine);
    expect(root.visible).toBe(false);
    expect(stage.dataset.nexState).toBe("visible"); // fading, merely off screen
  });

  it("reports changes, applies only what changed, and never invalidates by itself", () => {
    const n = nex();
    expect(n.setProps(props())).toBe(true);
    expect(stage.dataset.nexParticles).toBe("1200");
    expect(n.setProps(props())).toBe(false);
    expect(n.setProps(props({ particleShare: 0.5 }))).toBe(true);
    expect(stage.dataset.nexParticles).toBe("600");
    expect(n.setProps(props({ particleShare: 0.5, glowLayer: false }))).toBe(true);
    // A navigation can move NEX's anchor (the transition clock looks it up again).
    expect(n.setProps(props({ particleShare: 0.5, glowLayer: false, path: "/ai" }))).toBe(true);
    expect(engine.invalidate).not.toHaveBeenCalled();
  });

  it("construction failure releases everything created before it (fault injection)", () => {
    vi.spyOn(scene, "add").mockImplementation(() => {
      throw new Error("scene");
    });
    expect(() => nex()).toThrow("scene");
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES);
    expect(scene.children).toHaveLength(0);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });

  it("a failing geometry rebuild keeps the current geometries and leaks nothing", () => {
    const n = nex();
    n.setProps(props());
    geometryDisposals.mockClear();
    faults.shape = true;
    expect(() => n.setProps(props({ particles: 2_400 }))).toThrow("shape");
    expect(geometryDisposals).not.toHaveBeenCalled();
    expect(stage.dataset.nexParticles).toBe("1200");
  });

  it("a failing initial setProps leaves a layer that still disposes completely", () => {
    const n = nex();
    faults.shape = true;
    expect(() => n.setProps(props())).toThrow("shape");
    n.dispose();
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES);
    expect(scene.children).toHaveLength(0);
  });

  it("dispose is complete and idempotent, and removes NEX's stage attributes", () => {
    const n = nex();
    n.setProps(props());
    n.dispose();
    n.dispose();
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    // + the two placeholder particle geometries replaced by the first real shape.
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES + 2);
    expect(scene.children).toHaveLength(0);
    expect(stage.dataset.nexParticles).toBeUndefined();
    expect(n.setProps(props({ particles: 2_400 }))).toBe(false);
  });
});
