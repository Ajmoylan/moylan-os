import { BufferGeometry, PerspectiveCamera, Scene, ShaderMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ShapeModule from "./shape";
import { nexPalette, rgb } from "../ambient/config";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { NexAvatar, type NexAvatarProps } from "./NexAvatar";
import { generateNexShape } from "./shape";

/**
 * NEX as an engine layer (Milestone 2.4a): change reporting, transactional construction and
 * geometry rebuilds, complete and idempotent disposal (fault injection with real Three.js objects).
 * The V3 look itself is covered by the shader/shape tests and the visual comparisons.
 */

const faults = vi.hoisted(() => ({ anchorAttach: false, shape: false }));
const anchors = vi.hoisted(() => ({ attached: 0, detached: 0, elements: [] as unknown[] }));

vi.mock("./anchor", () => ({
  AnchorTracker: class {
    version = 0;
    attach() {
      anchors.attached++;
      if (faults.anchorAttach) throw new Error("anchor");
    }
    detach() {
      anchors.detached++;
    }
    setElement(element: unknown) {
      anchors.elements.push(element);
    }
    read() {
      return { present: false, left: 0, top: 0, width: 0, height: 0 };
    }
  },
}));

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
  });

beforeEach(() => {
  faults.anchorAttach = false;
  faults.shape = false;
  anchors.attached = anchors.detached = 0;
  anchors.elements.length = 0;
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
  it("is an update-phase layer: one group in the scene, the anchor attached", () => {
    const n = nex();
    expect(n.phase).toBe("update");
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]!.children).toHaveLength(6); // atmosphere, lines, points ×2, shell, glow
    expect(anchors.attached).toBe(1);
  });

  it("reports changes, applies only what changed, and never invalidates by itself", () => {
    const n = nex();
    expect(n.setProps(props())).toBe(true);
    expect(stage.dataset.nexParticles).toBe("1200");
    expect(n.setProps(props())).toBe(false);
    expect(n.setProps(props({ particleShare: 0.5 }))).toBe(true);
    expect(stage.dataset.nexParticles).toBe("600");
    expect(n.setProps(props({ particleShare: 0.5, glowLayer: false }))).toBe(true);
    expect(n.setProps(props({ particleShare: 0.5, glowLayer: false, path: "/ai" }))).toBe(true);
    expect(anchors.elements).toHaveLength(2); // looked up again after the navigation
    expect(engine.invalidate).not.toHaveBeenCalled();
  });

  it("construction failure releases everything created before it (fault injection)", () => {
    faults.anchorAttach = true;
    expect(() => nex()).toThrow("anchor");
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES);
    expect(scene.children).toHaveLength(0);
    expect(anchors.detached).toBe(1);
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
    expect(anchors.detached).toBe(1);
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
    expect(anchors.detached).toBe(1);
    expect(stage.dataset.nexParticles).toBeUndefined();
    expect(n.setProps(props({ particles: 2_400 }))).toBe(false);
  });
});
