import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  Points,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

/**
 * Orbit-texture capability probe (Milestone 2.4b.1b; proposal §6.2).
 *
 * The orbit-texture transport needs one capability: a **vertex** shader reading exact float32
 * values from an RGBA32F texture with `texelFetch`. That is sampling, not rendering to a float
 * target, so `EXT_color_buffer_float` is not required and not checked. The probe exercises exactly
 * that path on the current context:
 *
 *   1. upload 32 known float32 bit patterns into a 4×2 RGBA32F `DataTexture` (NEAREST, no mipmaps);
 *   2. draw 8 points into a 4×2 RGBA8 target; each vertex `texelFetch`es its texel and compares
 *      every channel bit for bit (`floatBitsToUint`, no decimal literal parsed) with the expected
 *      pattern, writing 1 or 0 per channel;
 *   3. read the 32 bytes back (RGBA / UNSIGNED_BYTE, always readable for RGBA8) and require 255 in
 *      every byte and no WebGL error. A shader that fails to compile or link draws nothing, so it
 *      fails too (and its diagnostics are checked).
 *
 * The renderer state it changes is restored, and every probe resource is disposed, whether it
 * passes, fails or throws (each restore and disposal is attempted even if another one throws). A
 * failure of that cleanup itself is not an "unsupported" verdict: it throws
 * `OrbitProbeCleanupError` (see `probeOrbitTextures`). Cost: one tiny program, one draw and one
 * 32-byte readback, once per context (the result is cached per renderer and forgotten when the
 * context is restored).
 */

/**
 * The 32 channels, as float32 bit patterns: finite, normal or +0 (no NaN, infinity, subnormal or
 * −0, which drivers may canonicalise or flush). Both signs, exponents 2⁻⁶⁰ … 2⁶⁰, 24-bit integers,
 * the last-bit neighbours of 1, float32 roundings of rotation entries and alternating mantissas.
 */
export const ORBIT_PROBE_BITS: readonly number[] = [
  // texel 0: 1, +0, −1, 0.5
  0x3f800000, 0x00000000, 0xbf800000, 0x3f000000,
  // texel 1: −1.25, 3, 1024, 65504
  0xbfa00000, 0x40400000, 0x44800000, 0x477fe000,
  // texel 2: 1 + 2⁻²³, −(1 + 2⁻²³), 2 − 2⁻²³, 1 − 2⁻²⁴
  0x3f800001, 0xbf800001, 0x3fffffff, 0x3f7fffff,
  // texel 3: 2⁻¹⁵, −2⁻²⁴, 2⁻⁶⁰, 2⁶⁰
  0x38000000, 0xb3800000, 0x21800000, 0x5d800000,
  // texel 4: 16 777 215, −16 777 215, 123 456.7890625, −2⁻¹³
  0x4b7fffff, 0xcb7fffff, 0x47f12065, 0xb9000000,
  // texel 5: f32(0.1), f32(1/3), −f32(π), f32(e)
  0x3dcccccd, 0x3eaaaaab, 0xc0490fdb, 0x402df854,
  // texel 6: f32(cos 30°), −f32(√½), f32(√½), −(0.5 + 2⁻²³)
  0x3f5db3d7, 0xbf3504f3, 0x3f3504f3, 0xbf000002,
  // texel 7: alternating mantissa bit patterns
  0x3faaaaaa, 0xc0555555, 0x3e555555, 0xbf7fffff,
];

const hex = (bits: number) => `0x${bits.toString(16).padStart(8, "0")}u`;

/** Exported for tests: the probe's vertex shader (GLSL ES 3.00 via Three.js on WebGL2). */
export const orbitProbeVertex = /* glsl */ `
uniform highp sampler2D uTable;
varying vec4 vResult;
const uvec4 EXPECTED[8] = uvec4[8](
${Array.from(
  { length: 8 },
  (_, t) =>
    `  uvec4(${ORBIT_PROBE_BITS.slice(t * 4, t * 4 + 4)
      .map(hex)
      .join(", ")})`,
).join(",\n")}
);
void main() {
  highp vec4 sampled = texelFetch(uTable, ivec2(gl_VertexID % 4, gl_VertexID / 4), 0);
  vResult = vec4(equal(floatBitsToUint(sampled), EXPECTED[gl_VertexID]));
  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

const orbitProbeFragment = /* glsl */ `
varying vec4 vResult;
void main() {
  gl_FragColor = vResult;
}
`;

/** At most this many queued WebGL errors are drained before probing. */
const MAX_DRAINED_ERRORS = 16;

/** Did every one of the 32 channels compare equal (every byte 255)? */
export function orbitProbeReadbackPasses(pixels: ArrayLike<number>): boolean {
  if (pixels.length !== 32) return false;
  for (let i = 0; i < 32; i++) if (pixels[i] !== 255) return false;
  return true;
}

/**
 * The probe could not put the renderer back as it found it (a state restore or a resource disposal
 * threw). Unlike an unsupported texture, this is not a capability verdict: the renderer's state may
 * be wrong, so it must not keep rendering. It propagates out of AgentCore's construction to the
 * Stage's single `fail()` path (static fallback for the visit). `cause` is the first cleanup error;
 * `probeError` is the probe's own error, if one occurred before cleanup.
 */
export class OrbitProbeCleanupError extends Error {
  constructor(
    cause: unknown,
    readonly probeError: unknown,
  ) {
    super("Orbit-texture probe could not restore the renderer", { cause });
    this.name = "OrbitProbeCleanupError";
  }
}

/**
 * Can a vertex shader on this renderer's context read RGBA32F texels exactly?
 *
 * Transactional, with this error policy:
 * - **Setup or probe failure** (capturing state, creating a resource, rendering, reading back,
 *   a wrong value, a WebGL error, an unrunnable program): returns `false`, so the agent uses the
 *   uniform transport. Each piece of renderer state is captured with its own restore, and each
 *   GPU resource is registered for disposal as soon as it exists, so a failure part-way through
 *   undoes exactly what was done.
 * - **Cleanup:** every registered restore is attempted (in capture order), then every registered
 *   disposal, each even if an earlier one threw.
 * - **Cleanup failure:** throws `OrbitProbeCleanupError`, which takes precedence over any probe
 *   result or probe error (attached as `probeError`). A renderer that may not be in its previous
 *   state must not be treated as merely lacking float textures.
 */
export function probeOrbitTextures(renderer: WebGLRenderer): boolean {
  const restores: (() => void)[] = [];
  const resources: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  let supported = false;
  let probeError: unknown = null;

  try {
    supported = runProbe(renderer, restores, own);
  } catch (error) {
    probeError = error;
    supported = false;
  }

  let cleanupError: { error: unknown } | null = null;
  for (const undo of [...restores, ...resources.map((r) => () => r.dispose())]) {
    try {
      undo();
    } catch (error) {
      cleanupError ??= { error };
    }
  }
  if (cleanupError) throw new OrbitProbeCleanupError(cleanupError.error, probeError);
  return supported;
}

/** The probe itself: captures state and acquires resources through the caller's registries. */
function runProbe(
  renderer: WebGLRenderer,
  restores: (() => void)[],
  own: <T extends { dispose(): void }>(resource: T) => T,
): boolean {
  const gl = renderer.getContext();
  // Renderer state the probe changes, each with its restore registered as it is captured (the
  // restores run in this order: render target first, as before).
  const previousTarget = renderer.getRenderTarget();
  restores.push(() => renderer.setRenderTarget(previousTarget));
  const previousViewport = renderer.getViewport(new Vector4());
  restores.push(() => renderer.setViewport(previousViewport));
  const previousScissor = renderer.getScissor(new Vector4());
  restores.push(() => renderer.setScissor(previousScissor));
  const previousScissorTest = renderer.getScissorTest();
  restores.push(() => renderer.setScissorTest(previousScissorTest));
  const previousColor = renderer.getClearColor(new Color());
  const previousAlpha = renderer.getClearAlpha();
  restores.push(() => renderer.setClearColor(previousColor, previousAlpha));
  const previousAutoClear = renderer.autoClear;
  restores.push(() => {
    renderer.autoClear = previousAutoClear;
  });

  const table = own(
    new DataTexture(
      new Float32Array(new Uint32Array(ORBIT_PROBE_BITS).buffer),
      4,
      2,
      RGBAFormat,
      FloatType,
    ),
  );
  table.minFilter = NearestFilter;
  table.magFilter = NearestFilter;
  table.generateMipmaps = false;
  table.needsUpdate = true;
  const target = own(
    new WebGLRenderTarget(4, 2, {
      type: UnsignedByteType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    }),
  );
  // One point per pixel centre of the 4×2 target, in vertex order (texel i ↔ pixel i).
  const centres = new Float32Array(8 * 3);
  for (let i = 0; i < 8; i++) {
    centres[i * 3] = ((i % 4) + 0.5) / 2 - 1;
    centres[i * 3 + 1] = Math.floor(i / 4) + 0.5 - 1;
  }
  const geometry = own(new BufferGeometry());
  geometry.setAttribute("position", new BufferAttribute(centres, 3));
  const material = own(
    new ShaderMaterial({
      vertexShader: orbitProbeVertex,
      fragmentShader: orbitProbeFragment,
      uniforms: { uTable: { value: table } },
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const scene = new Scene().add(points);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  for (let i = 0; i < MAX_DRAINED_ERRORS && gl.getError() !== gl.NO_ERROR; i++);
  renderer.setRenderTarget(target);
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  const program = (
    renderer.properties.get(material) as {
      currentProgram?: { diagnostics?: { runnable: boolean } };
    }
  ).currentProgram;
  if (!program || program.diagnostics?.runnable === false) return false;
  const pixels = new Uint8Array(32);
  renderer.readRenderTargetPixels(target, 0, 0, 4, 2, pixels);
  if (gl.getError() !== gl.NO_ERROR) return false;
  return orbitProbeReadbackPasses(pixels);
}

/** The probe result per renderer: it needs a GPU readback, so it runs once per context. */
const probed = new WeakMap<WebGLRenderer, boolean>();

/**
 * Cached `probeOrbitTextures()` for this renderer's current context. A verdict (true or false,
 * including a setup failure) is cached until `forgetOrbitProbe()`; an `OrbitProbeCleanupError`
 * propagates and caches nothing.
 */
export function orbitTexturesSupported(renderer: WebGLRenderer): boolean {
  let supported = probed.get(renderer);
  if (supported === undefined) {
    supported = probeOrbitTextures(renderer);
    probed.set(renderer, supported);
  }
  return supported;
}

/**
 * Forgets the result for a renderer, so the next use probes again (once). Called when the context
 * is restored: the new context may run on another GPU or driver (the same as the flow format).
 */
export function forgetOrbitProbe(renderer: WebGLRenderer): void {
  probed.delete(renderer);
}
