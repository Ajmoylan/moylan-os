import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import type { FlowFormat } from "./policy";

/**
 * Flow render-target validation (ARCHITECTURE §9.4). Framebuffer completeness alone isn't enough:
 * some drivers report a half-float target complete but render, sample or filter it incorrectly.
 * The probe therefore exercises the exact path the simulation depends on, once per renderer:
 *
 *   1. render two known texels (signed values for half-float) into a 2×1 target of the format;
 *   2. sample it with LINEAR filtering exactly between the texel centres into a 1×1 target of the
 *      same format (render-to and sample-from the format, plus linear filtering);
 *   3. read the 1×1 result back once and compare it to the average of the two texels, and check
 *      that WebGL raised no error along the way.
 *
 * Renderer state (render target, clear colour) is restored and every probe resource is disposed,
 * whether the probe passes, fails or throws. Cost: two tiny draws and one 1-pixel readback (a
 * single GPU sync) when the flow field is first created.
 */

export type TargetFormat = Exclude<FlowFormat, "analytic">;

const dataType = (format: TargetFormat) =>
  format === "half-float" ? HalfFloatType : UnsignedByteType;

export function createFlowTarget(width: number, height: number, format: TargetFormat) {
  return new WebGLRenderTarget(width, height, {
    type: dataType(format),
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

/**
 * Texel values written by the probe. Half-float uses signed values outside [0, 1], as velocities
 * are; RGBA8 uses the biased range of its encoding. The expected readback is their average.
 */
export const PROBE_TEXELS: Record<TargetFormat, [Vector4, Vector4]> = {
  "half-float": [new Vector4(-2.5, 1.25, 0, 1), new Vector4(1.5, -0.75, 0, 1)],
  rgba8: [new Vector4(0.2, 0.8, 0, 1), new Vector4(0.6, 0.4, 0, 1)],
};

/** Readback tolerance: half-float precision at these magnitudes; two RGBA8 steps. */
const TOLERANCE: Record<TargetFormat, number> = { "half-float": 0.01, rgba8: 2 / 255 };

/** Expected RG readback (the linear average), in the units `readPixels` returns. */
export function expectedProbeReadback(format: TargetFormat): [number, number] {
  const [a, b] = PROBE_TEXELS[format];
  const scale = format === "rgba8" ? 255 : 1;
  return [((a.x + b.x) / 2) * scale, ((a.y + b.y) / 2) * scale];
}

/** Does a readback match the linear average of the probe texels? */
export function probeReadbackMatches(format: TargetFormat, pixel: ArrayLike<number>): boolean {
  const [r, g] = expectedProbeReadback(format);
  const tolerance = TOLERANCE[format] * (format === "rgba8" ? 255 : 1);
  return Math.abs(pixel[0]! - r) <= tolerance && Math.abs(pixel[1]! - g) <= tolerance;
}

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uPass;
uniform vec4 uLeft;
uniform vec4 uRight;
uniform sampler2D uSource;
void main() {
  // Pass 0 writes two texels; pass 1 samples halfway between their centres (u = 0.5).
  gl_FragColor = uPass < 0.5
    ? (gl_FragCoord.x < 1.0 ? uLeft : uRight)
    : texture2D(uSource, vec2(0.5, 0.5));
}
`;

/** At most this many queued WebGL errors are drained before probing. */
const MAX_DRAINED_ERRORS = 16;

/**
 * Can the flow simulation render into, sample from and linearly filter a target of `format`?
 * Never throws; returns false on any failure.
 */
export function validateFlowFormat(renderer: WebGLRenderer, format: TargetFormat): boolean {
  const gl = renderer.getContext();
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new Color());
  const previousAlpha = renderer.getClearAlpha();

  const source = createFlowTarget(2, 1, format);
  const result = createFlowTarget(1, 1, format);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const [left, right] = PROBE_TEXELS[format];
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uPass: { value: 0 },
      uLeft: { value: left },
      uRight: { value: right },
      uSource: { value: null },
    },
  });
  const quad = new Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new Scene().add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  try {
    for (let i = 0; i < MAX_DRAINED_ERRORS && gl.getError() !== gl.NO_ERROR; i++);

    renderer.setRenderTarget(source);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
    renderer.render(scene, camera);

    material.uniforms.uPass!.value = 1;
    material.uniforms.uSource!.value = source.texture;
    renderer.setRenderTarget(result);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
    renderer.render(scene, camera);

    // RGBA/FLOAT is the readback format WebGL2 guarantees for float colour buffers.
    const pixel = format === "half-float" ? new Float32Array(4) : new Uint8Array(4);
    gl.readPixels(
      0,
      0,
      1,
      1,
      gl.RGBA,
      format === "half-float" ? gl.FLOAT : gl.UNSIGNED_BYTE,
      pixel,
    );
    if (gl.getError() !== gl.NO_ERROR) return false;
    return probeReadbackMatches(format, pixel);
  } catch {
    return false;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    source.dispose();
    result.dispose();
    geometry.dispose();
    material.dispose();
  }
}
