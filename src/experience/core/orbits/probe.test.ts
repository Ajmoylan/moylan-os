import type { Points } from "three";
import {
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  ShaderMaterial,
  Vector4,
  WebGLRenderTarget,
  type Scene,
  type WebGLRenderer,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetOrbitProbe,
  OrbitProbeCleanupError,
  ORBIT_PROBE_BITS,
  orbitProbeReadbackPasses,
  orbitProbeVertex,
  orbitTexturesSupported,
  probeOrbitTextures,
} from "./probe";

/**
 * The orbit-texture capability probe (Milestone 2.4b.1b) with a scripted renderer: jsdom has no
 * WebGL, so a fake renderer decides what the readback returns, whether WebGL reports an error,
 * whether the program is runnable and whether rendering throws. The real GPU path (pass, forced
 * failure, re-probe after a context restore) is covered by tests/e2e/orbits.spec.ts.
 */

type Behaviour = "ok" | "wrong-channel" | "gl-error" | "not-runnable" | "no-program" | "throws";

const GL = { NO_ERROR: 0, INVALID_OPERATION: 0x0502 };

/** Faults injected into state capture and restoration (the probe never calls `setScissor` itself). */
interface Faults {
  captureViewport?: boolean;
  restoreTarget?: boolean;
  restoreScissor?: boolean;
}

function fakeRenderer(behaviour: Behaviour = "ok", faults: Faults = {}) {
  const scene = { name: "scene target" };
  const state = {
    target: scene as unknown,
    viewport: new Vector4(0, 0, 1280, 800),
    scissor: new Vector4(10, 20, 300, 400),
    scissorTest: true,
    clear: { color: new Color(0x123456), alpha: 0.25 },
    autoClear: false,
  };
  let pendingError = GL.NO_ERROR;
  const rendered: { scene: Scene; table: Float32Array; clearAlpha: number; autoClear: boolean }[] =
    [];
  const materials = new Map<unknown, { currentProgram?: unknown }>();
  const gl = {
    ...GL,
    getError: vi.fn(() => {
      const error = pendingError;
      pendingError = GL.NO_ERROR;
      return error;
    }),
  };
  const renderer = {
    getContext: () => gl,
    getRenderTarget: () => state.target,
    setRenderTarget: vi.fn((target: unknown) => {
      if (faults.restoreTarget && target === scene) throw new Error("restore target");
      state.target = target;
    }),
    getViewport: (out: Vector4) => {
      if (faults.captureViewport) throw new Error("capture viewport");
      return out.copy(state.viewport);
    },
    setViewport: vi.fn((v: Vector4) => state.viewport.copy(v)),
    getScissor: (out: Vector4) => out.copy(state.scissor),
    setScissor: vi.fn((v: Vector4) => {
      if (faults.restoreScissor) throw new Error("restore scissor");
      state.scissor.copy(v);
    }),
    getScissorTest: () => state.scissorTest,
    setScissorTest: vi.fn((on: boolean) => {
      state.scissorTest = on;
    }),
    getClearColor: (out: Color) => out.copy(state.clear.color),
    getClearAlpha: () => state.clear.alpha,
    setClearColor: vi.fn((color: Color | number, alpha: number) => {
      state.clear.color = new Color(color);
      state.clear.alpha = alpha;
    }),
    get autoClear() {
      return state.autoClear;
    },
    set autoClear(value: boolean) {
      state.autoClear = value;
    },
    properties: { get: (material: unknown) => materials.get(material) ?? {} },
    render: vi.fn((s: Scene) => {
      if (behaviour === "throws") throw new Error("driver failure");
      const points = s.children[0] as Points<BufferGeometry, ShaderMaterial>;
      const table = points.material.uniforms.uTable!.value as DataTexture;
      rendered.push({
        scene: s,
        table: table.image.data as Float32Array,
        clearAlpha: state.clear.alpha,
        autoClear: state.autoClear,
      });
      if (behaviour !== "no-program") {
        materials.set(points.material, {
          currentProgram: { diagnostics: { runnable: behaviour !== "not-runnable" } },
        });
      }
    }),
    readRenderTargetPixels: vi.fn(
      (_t: unknown, _x: number, _y: number, w: number, h: number, out: Uint8Array) => {
        expect([w, h]).toEqual([4, 2]);
        out.fill(255);
        if (behaviour === "wrong-channel") out[13] = 0; // one channel of texel 3 mismatched
        if (behaviour === "gl-error") pendingError = GL.INVALID_OPERATION;
      },
    ),
  };
  /** Every restorable item except those whose own restore was made to fail. */
  const restoredExcept = (skip: Faults = {}) =>
    (skip.restoreTarget || state.target === scene) &&
    state.viewport.equals(new Vector4(0, 0, 1280, 800)) &&
    state.scissorTest === true &&
    state.clear.color.getHex() === 0x123456 &&
    state.clear.alpha === 0.25 &&
    state.autoClear === false;
  const restored = () =>
    state.target === scene &&
    state.viewport.equals(new Vector4(0, 0, 1280, 800)) &&
    state.scissor.equals(new Vector4(10, 20, 300, 400)) &&
    state.scissorTest === true &&
    state.clear.color.getHex() === 0x123456 &&
    state.clear.alpha === 0.25 &&
    state.autoClear === false;
  return {
    renderer: renderer as unknown as WebGLRenderer,
    gl,
    rendered,
    restored,
    restoredExcept,
    state,
  };
}

function spyDisposals() {
  return {
    texture: vi.spyOn(DataTexture.prototype, "dispose"),
    target: vi.spyOn(WebGLRenderTarget.prototype, "dispose"),
    geometry: vi.spyOn(BufferGeometry.prototype, "dispose"),
    material: vi.spyOn(ShaderMaterial.prototype, "dispose"),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("the probe's 32 channels", () => {
  it("are distinct, finite, normal or +0 float32 bit patterns (no NaN, infinity, subnormal, −0)", () => {
    expect(ORBIT_PROBE_BITS).toHaveLength(32);
    expect(new Set(ORBIT_PROBE_BITS).size).toBe(32);
    for (const bits of ORBIT_PROBE_BITS) {
      expect(bits).toBe(bits >>> 0);
      const exponent = (bits >>> 23) & 0xff;
      expect(exponent).not.toBe(0xff); // NaN or infinity
      if (exponent === 0) expect(bits).toBe(0); // only +0, never subnormal or −0
    }
  });

  it("round-trip through float32 unchanged, and the shader expects exactly these patterns", () => {
    const floats = new Float32Array(new Uint32Array(ORBIT_PROBE_BITS).buffer);
    expect(Array.from(new Uint32Array(floats.buffer))).toEqual(ORBIT_PROBE_BITS);
    const literals = [...orbitProbeVertex.matchAll(/0x([0-9a-f]{8})u/g)].map((m) =>
      Number.parseInt(m[1]!, 16),
    );
    expect(literals).toEqual(ORBIT_PROBE_BITS);
    expect(orbitProbeVertex).toContain("floatBitsToUint(sampled)");
    expect(orbitProbeVertex).toContain("texelFetch(uTable");
  });

  it("pass only when all 32 bytes read back as 255", () => {
    expect(orbitProbeReadbackPasses(new Uint8Array(32).fill(255))).toBe(true);
    for (const i of [0, 13, 31]) {
      const pixels = new Uint8Array(32).fill(255);
      pixels[i] = 254;
      expect(orbitProbeReadbackPasses(pixels)).toBe(false);
    }
    expect(orbitProbeReadbackPasses(new Uint8Array(28).fill(255))).toBe(false);
  });
});

describe("probeOrbitTextures", () => {
  it("passes when every channel compares equal: uploads the exact bits, restores state, frees all", () => {
    const disposed = spyDisposals();
    const { renderer, rendered, restored } = fakeRenderer("ok");
    expect(probeOrbitTextures(renderer)).toBe(true);
    expect(rendered).toHaveLength(1);
    // The texture holds the exact patterns as RGBA32F (FloatType), 4×2 texels.
    const table = (rendered[0]!.scene.children[0] as Points<BufferGeometry, ShaderMaterial>)
      .material.uniforms.uTable!.value as DataTexture;
    expect(table.type).toBe(FloatType);
    expect([table.image.width, table.image.height]).toEqual([4, 2]);
    expect(Array.from(new Uint32Array(rendered[0]!.table.buffer))).toEqual(ORBIT_PROBE_BITS);
    // Rendered into a cleared target (unwritten pixels read 0, never a false pass).
    expect(rendered[0]!.clearAlpha).toBe(0);
    expect(rendered[0]!.autoClear).toBe(true);
    expect(restored()).toBe(true);
    for (const spy of Object.values(disposed)) expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each<Behaviour>(["wrong-channel", "gl-error", "not-runnable", "no-program", "throws"])(
    "fails on %s, restores every changed state and frees every resource",
    (failure) => {
      const disposed = spyDisposals();
      const { renderer, restored } = fakeRenderer(failure);
      expect(probeOrbitTextures(renderer)).toBe(false);
      expect(restored()).toBe(true);
      for (const spy of Object.values(disposed)) expect(spy).toHaveBeenCalledTimes(1);
    },
  );

  it("drains earlier WebGL errors first, so they are not blamed on the probe", () => {
    const { renderer, gl } = fakeRenderer("ok");
    let earlier = 3;
    gl.getError.mockImplementation(() => (earlier-- > 0 ? GL.INVALID_OPERATION : GL.NO_ERROR));
    expect(probeOrbitTextures(renderer)).toBe(true);
  });
});

describe("orbitTexturesSupported (per-context cache)", () => {
  it("probes once per renderer, and again after forgetOrbitProbe (context restored)", () => {
    const { renderer, rendered } = fakeRenderer("ok");
    expect(orbitTexturesSupported(renderer)).toBe(true);
    expect(orbitTexturesSupported(renderer)).toBe(true);
    expect(rendered).toHaveLength(1);
    forgetOrbitProbe(renderer);
    expect(orbitTexturesSupported(renderer)).toBe(true);
    expect(rendered).toHaveLength(2);
  });

  it("caches a failure too: no repeated probing on a context that can't sample float textures", () => {
    const { renderer, rendered } = fakeRenderer("wrong-channel");
    expect(orbitTexturesSupported(renderer)).toBe(false);
    expect(orbitTexturesSupported(renderer)).toBe(false);
    expect(rendered).toHaveLength(1);
  });
});

describe("probeOrbitTextures: transactional setup and exception-safe cleanup", () => {
  it("a failure while capturing renderer state falls back (false), undoing only what was captured", () => {
    const disposed = spyDisposals();
    const { renderer, rendered, restored } = fakeRenderer("ok", { captureViewport: true });
    expect(probeOrbitTextures(renderer)).toBe(false);
    expect(rendered).toHaveLength(0);
    expect(restored()).toBe(true);
    // No GPU resource had been created yet: nothing to dispose.
    for (const spy of Object.values(disposed)) expect(spy).not.toHaveBeenCalled();
  });

  it("a failure while building resources disposes those already acquired and falls back", () => {
    const disposed = spyDisposals();
    vi.spyOn(BufferGeometry.prototype, "setAttribute").mockImplementationOnce(() => {
      throw new Error("out of memory");
    });
    const { renderer, rendered, restored } = fakeRenderer("ok");
    expect(probeOrbitTextures(renderer)).toBe(false);
    expect(rendered).toHaveLength(0);
    expect(restored()).toBe(true);
    // Texture, target and geometry existed; the material was never created.
    expect(disposed.texture).toHaveBeenCalledTimes(1);
    expect(disposed.target).toHaveBeenCalledTimes(1);
    expect(disposed.geometry).toHaveBeenCalledTimes(1);
    expect(disposed.material).not.toHaveBeenCalled();
  });

  it("a failing first restore still runs every other restore and disposal, then throws", () => {
    const disposed = spyDisposals();
    const { renderer, restoredExcept } = fakeRenderer("ok", { restoreTarget: true });
    expect(() => probeOrbitTextures(renderer)).toThrow(OrbitProbeCleanupError);
    expect(restoredExcept({ restoreTarget: true })).toBe(true);
    for (const spy of Object.values(disposed)) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a failing intermediate restore still runs the later restores and every disposal, then throws", () => {
    const disposed = spyDisposals();
    const { renderer, restoredExcept, state } = fakeRenderer("ok", { restoreScissor: true });
    let thrown: unknown;
    try {
      probeOrbitTextures(renderer);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OrbitProbeCleanupError);
    expect((thrown as Error).cause).toEqual(new Error("restore scissor"));
    expect((thrown as OrbitProbeCleanupError).probeError).toBeNull();
    // Restores after the scissor (scissor test, clear colour, autoClear) all ran.
    expect(restoredExcept()).toBe(true);
    expect(state.scissor.equals(new Vector4(10, 20, 300, 400))).toBe(true); // never changed
    for (const spy of Object.values(disposed)) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("an earlier disposal failure doesn't prevent later disposals; it is reported as unsafe", () => {
    const disposed = spyDisposals();
    disposed.texture.mockImplementationOnce(() => {
      throw new Error("delete texture");
    });
    const { renderer, restored } = fakeRenderer("ok");
    expect(() => probeOrbitTextures(renderer)).toThrow(OrbitProbeCleanupError);
    expect(restored()).toBe(true);
    expect(disposed.target).toHaveBeenCalledTimes(1);
    expect(disposed.geometry).toHaveBeenCalledTimes(1);
    expect(disposed.material).toHaveBeenCalledTimes(1);
  });

  it("precedence: a cleanup failure wins over the probe's own failure, which is kept as probeError", () => {
    const { renderer } = fakeRenderer("throws", { restoreScissor: true });
    let thrown: unknown;
    try {
      probeOrbitTextures(renderer);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OrbitProbeCleanupError);
    expect((thrown as OrbitProbeCleanupError).probeError).toEqual(new Error("driver failure"));
    expect((thrown as Error).cause).toEqual(new Error("restore scissor"));
  });

  it("safe fallback (setup or probe failure) is cached; an unsafe cleanup failure caches nothing", () => {
    const setup = fakeRenderer("ok", { captureViewport: true });
    expect(orbitTexturesSupported(setup.renderer)).toBe(false);
    expect(orbitTexturesSupported(setup.renderer)).toBe(false);

    const faults: Faults = { restoreScissor: true };
    const unsafe = fakeRenderer("ok", faults);
    expect(() => orbitTexturesSupported(unsafe.renderer)).toThrow(OrbitProbeCleanupError);
    // Nothing was cached: once restores succeed, the next request probes again.
    faults.restoreScissor = false;
    expect(orbitTexturesSupported(unsafe.renderer)).toBe(true);
    expect(unsafe.rendered).toHaveLength(2);
    expect(orbitTexturesSupported(unsafe.renderer)).toBe(true);
    expect(unsafe.rendered).toHaveLength(2);
  });
});
