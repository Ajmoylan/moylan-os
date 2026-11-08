import {
  Color,
  HalfFloatType,
  WebGLRenderTarget,
  type WebGLRenderer,
  type WebGLRenderTarget as Target,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowField } from "./FlowField";
import { expectedProbeReadback, probeReadbackMatches, validateFlowFormat } from "./probe";

/**
 * Flow-target validation with a scripted renderer: jsdom has no WebGL, so a fake renderer and
 * context decide per format whether the framebuffer is complete, what a readback returns, whether
 * WebGL reports an error and whether rendering throws. The real GPU path is covered by
 * tests/e2e/webgl.spec.ts (including a forced half-float readback failure).
 */

type Behaviour = "ok" | "wrong-value" | "nearest-filter" | "gl-error" | "incomplete" | "throws";

const GL = {
  NO_ERROR: 0,
  INVALID_OPERATION: 0x0502,
  FRAMEBUFFER: 0x8d40,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
  RGBA: 0x1908,
  FLOAT: 0x1406,
  UNSIGNED_BYTE: 0x1401,
};

function fakeRenderer(behaviour: { "half-float": Behaviour; rgba8: Behaviour }) {
  const original = { target: { name: "scene target" } as unknown as Target };
  let current: Target | null = original.target;
  let pendingError = GL.NO_ERROR;
  const clear = { color: new Color(0x123456), alpha: 0.25 };
  const formatOf = (target: Target | null) =>
    target?.texture.type === HalfFloatType ? "half-float" : "rgba8";
  const now = () => behaviour[formatOf(current)];

  const gl = {
    ...GL,
    getError: vi.fn(() => {
      const error = pendingError;
      pendingError = GL.NO_ERROR;
      return error;
    }),
    checkFramebufferStatus: vi.fn(() =>
      now() === "incomplete" ? GL.FRAMEBUFFER_INCOMPLETE_ATTACHMENT : GL.FRAMEBUFFER_COMPLETE,
    ),
    readPixels: vi.fn(
      (_x: number, _y: number, _w: number, _h: number, _f: number, type: number, out: number[]) => {
        const format = type === GL.FLOAT ? "half-float" : "rgba8";
        const [r, g] = expectedProbeReadback(format);
        const mode = behaviour[format];
        if (mode === "gl-error") pendingError = GL.INVALID_OPERATION;
        // Nearest filtering returns one texel instead of the average.
        const [nr, ng] = format === "half-float" ? [-2.5, 1.25] : [0.2 * 255, 0.8 * 255];
        out[0] = mode === "wrong-value" ? 0 : mode === "nearest-filter" ? nr : r;
        out[1] = mode === "wrong-value" ? 0 : mode === "nearest-filter" ? ng : g;
      },
    ),
  };

  const renderer = {
    extensions: { has: () => true },
    getContext: () => gl,
    getRenderTarget: () => current,
    setRenderTarget: vi.fn((target: Target | null) => {
      current = target;
    }),
    render: vi.fn(() => {
      if (now() === "throws") throw new Error("driver failure");
    }),
    clear: vi.fn(),
    getClearColor: (target: Color) => target.copy(clear.color),
    getClearAlpha: () => clear.alpha,
    setClearColor: vi.fn((color: Color, alpha: number) => {
      clear.color = color.clone();
      clear.alpha = alpha;
    }),
  };
  return {
    renderer: renderer as unknown as WebGLRenderer,
    gl,
    restored: () => current === original.target,
    clear,
  };
}

const settings = { radius: 0.09, dissipation: 0.955, advection: 0.5 };

afterEach(() => vi.restoreAllMocks());

describe("probeReadbackMatches", () => {
  it("accepts the linear average and rejects a nearest-filtered texel", () => {
    expect(probeReadbackMatches("half-float", [-0.5, 0.25])).toBe(true);
    expect(probeReadbackMatches("half-float", [-2.5, 1.25])).toBe(false);
    expect(probeReadbackMatches("rgba8", [102, 153])).toBe(true);
    expect(probeReadbackMatches("rgba8", [51, 204])).toBe(false);
  });
});

describe("validateFlowFormat", () => {
  it.each<Behaviour>(["wrong-value", "nearest-filter", "gl-error", "incomplete", "throws"])(
    "rejects half-float on %s, restores renderer state and disposes its resources",
    (failure) => {
      const dispose = vi.spyOn(WebGLRenderTarget.prototype, "dispose");
      const { renderer, restored, clear } = fakeRenderer({ "half-float": failure, rgba8: "ok" });
      expect(validateFlowFormat(renderer, "half-float")).toBe(false);
      expect(restored()).toBe(true);
      expect(clear.color.getHex()).toBe(0x123456);
      expect(clear.alpha).toBe(0.25);
      expect(dispose).toHaveBeenCalledTimes(2);
    },
  );

  it("accepts a format that renders, samples, filters and reads back correctly", () => {
    const { renderer, gl, restored } = fakeRenderer({ "half-float": "ok", rgba8: "ok" });
    expect(validateFlowFormat(renderer, "half-float")).toBe(true);
    expect(gl.readPixels).toHaveBeenCalledTimes(1);
    expect(gl.readPixels.mock.calls[0]![5]).toBe(GL.FLOAT);
    expect(restored()).toBe(true);
  });
});

describe("FlowField.create fallback with validation", () => {
  it("selects RGBA8 when half-float validation fails", () => {
    const dispose = vi.spyOn(WebGLRenderTarget.prototype, "dispose");
    const { renderer, restored } = fakeRenderer({ "half-float": "nearest-filter", rgba8: "ok" });
    const field = FlowField.create(renderer, 64, settings);
    expect(field?.format).toBe("rgba8");
    expect(field?.encoded).toBe(true);
    // Both probes' 2 tiny targets were released; the field keeps its own 2 targets.
    expect(dispose).toHaveBeenCalledTimes(4);
    expect(restored()).toBe(true);
    field?.dispose();
  });

  it("falls back to the analytic falloff when no format validates", () => {
    const { renderer } = fakeRenderer({ "half-float": "gl-error", rgba8: "wrong-value" });
    expect(FlowField.create(renderer, 64, settings)).toBeNull();
  });

  it("probes once per renderer: later fields reuse the validated format", () => {
    const { renderer, gl } = fakeRenderer({ "half-float": "wrong-value", rgba8: "ok" });
    FlowField.create(renderer, 64, settings)?.dispose();
    const readbacks = gl.readPixels.mock.calls.length;
    expect(readbacks).toBe(2); // half-float rejected, RGBA8 accepted
    const again = FlowField.create(renderer, 128, settings);
    expect(again?.format).toBe("rgba8");
    expect(gl.readPixels.mock.calls.length).toBe(readbacks);
    again?.dispose();
  });
});
