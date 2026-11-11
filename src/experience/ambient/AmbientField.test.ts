import { BufferGeometry, Scene, ShaderMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ParticlesModule from "./particles";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { AmbientField, type AmbientFieldProps } from "./AmbientField";
import { settingsForTier } from "./config";

/**
 * The ambient field as an engine layer (Milestone 2.4a): change reporting, transactional
 * construction and geometry rebuilds, and complete, idempotent disposal (fault injection with real
 * Three.js objects; no WebGL needed to create or dispose them).
 */

const faults = vi.hoisted(() => ({ particles: false }));

vi.mock("./particles", async (original) => {
  const actual = await original<typeof ParticlesModule>();
  return {
    ...actual,
    generateParticles: (count: number) => {
      if (faults.particles) throw new Error("particles");
      return actual.generateParticles(count);
    },
  };
});

let scene: Scene;
let engine: Engine;
let geometryDisposals: ReturnType<typeof vi.spyOn>;
let materialDisposals: ReturnType<typeof vi.spyOn>;

const props = (tier: 1 | 2 | 3 = 3, particleShare = 1): AmbientFieldProps => ({
  settings: settingsForTier(tier),
  particleShare,
  motion: "full",
});

function field() {
  return new AmbientField(engine, {
    stage: document.createElement("div"),
    interaction: createInteraction(0.1),
    onQualityStep: () => {},
  });
}

beforeEach(() => {
  faults.particles = false;
  scene = new Scene();
  engine = {
    scene,
    renderer: { getPixelRatio: () => 1 },
    invalidate: vi.fn(),
  } as unknown as Engine;
  geometryDisposals = vi.spyOn(BufferGeometry.prototype, "dispose");
  materialDisposals = vi.spyOn(ShaderMaterial.prototype, "dispose");
});

afterEach(() => vi.restoreAllMocks());

describe("AmbientField layer", () => {
  it("is an update-phase layer with one Points object in the scene", () => {
    const f = field();
    expect(f.phase).toBe("update");
    expect(scene.children).toHaveLength(1);
  });

  it("reports changes, applies only what changed, and never invalidates by itself", () => {
    const f = field();
    expect(f.setProps(props())).toBe(true);
    expect(f.setProps(props())).toBe(false);
    expect(f.setProps(props(3, 0.5))).toBe(true);
    expect(f.setProps({ ...props(3, 0.5), motion: "reduced" })).toBe(true);
    expect(engine.invalidate).not.toHaveBeenCalled();
  });

  it("a tier change replaces the geometry and releases the old one", () => {
    const f = field();
    f.setProps(props(3));
    geometryDisposals.mockClear();
    f.setProps(props(1));
    expect(geometryDisposals).toHaveBeenCalledTimes(1);
  });

  it("construction failure releases what was created (fault injection)", () => {
    vi.spyOn(scene, "add").mockImplementation(() => {
      throw new Error("scene");
    });
    expect(() => field()).toThrow("scene");
    expect(materialDisposals).toHaveBeenCalledTimes(1);
    expect(geometryDisposals).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });

  it("a failing geometry rebuild keeps the current geometry and leaks nothing (fault injection)", () => {
    const f = field();
    f.setProps(props(3));
    geometryDisposals.mockClear();
    faults.particles = true;
    expect(() => f.setProps(props(1))).toThrow("particles");
    expect(geometryDisposals).not.toHaveBeenCalled();
    faults.particles = false;
    f.dispose();
    expect(geometryDisposals).toHaveBeenCalledTimes(1);
  });

  it("a failing initial setProps leaves a layer that still disposes completely", () => {
    const f = field();
    faults.particles = true;
    expect(() => f.setProps(props())).toThrow("particles");
    f.dispose();
    expect(materialDisposals).toHaveBeenCalledTimes(1);
    expect(geometryDisposals).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });

  it("dispose is complete and idempotent", () => {
    const f = field();
    f.setProps(props());
    f.dispose();
    f.dispose();
    expect(materialDisposals).toHaveBeenCalledTimes(1);
    // The constructor's placeholder geometry was released when the first real one replaced it.
    expect(geometryDisposals).toHaveBeenCalledTimes(2);
    expect(scene.children).toHaveLength(0);
    expect(f.setProps(props(1))).toBe(false);
  });
});
