import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  type Texture,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { dissipationFor, selectFlowFormat, type FlowFormat } from "./policy";
import type { PointerSample } from "./PointerTracker";
import { createFlowTarget, validateFlowFormat, type TargetFormat } from "./probe";

/**
 * Shared pointer flow map (ADR-004): one low-resolution ping-pong render target that every
 * environment (the ambient field now; NEX and the specialist agents later) can sample.
 *
 * Each frame, one full-screen pass does inject → advect → dissipate:
 *   - advect: semi-Lagrangian back-trace through the previous velocity field;
 *   - dissipate: multiply by pow(d, Δt·60), so decay is frame-rate independent;
 *   - inject: add a Gaussian splat of the pointer's velocity at its position.
 * No pressure solve or divergence projection (no Jacobi iterations; ADR-004 constraint).
 *
 * Render-target format falls back half-float → RGBA8 (velocity encoded around 0.5) → none, in
 * which case `FlowField.create` returns null and callers use the analytic pointer falloff. Each
 * format is validated by rendering, sampling and reading back (probe.ts), once per renderer.
 * Independent of React: it is created and disposed by the scene that uses it.
 */

/** Velocity range (NDC units per second) representable in the RGBA8 encoding; also a clamp. */
export const FLOW_RANGE = 8;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uPrev;
uniform float uDt;
uniform float uDissipation;
uniform float uAdvection;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform float uRadius;
uniform float uAspect;
uniform float uInject;
uniform float uEncoded;
uniform float uRange;
uniform float uDeadZone;
varying vec2 vUv;

vec2 decodeFlow(vec4 c) {
  vec2 v = uEncoded > 0.5 ? (c.xy - 0.5) * 2.0 * uRange : c.xy;
  // RGBA8 can't represent exactly zero; snap the quantisation floor to rest.
  return v * step(vec2(uDeadZone), abs(v));
}

vec4 encodeFlow(vec2 v) {
  return uEncoded > 0.5 ? vec4(v / (2.0 * uRange) + 0.5, 0.0, 1.0) : vec4(v, 0.0, 1.0);
}

void main() {
  vec2 here = decodeFlow(texture2D(uPrev, vUv));
  // Velocity is in NDC units per second; NDC → UV is a factor of 0.5.
  vec2 from = vUv - here * 0.5 * uDt * uAdvection;
  vec2 v = decodeFlow(texture2D(uPrev, from)) * uDissipation;
  vec2 d = vUv - uPointer;
  d.x *= uAspect;
  v += uVelocity * exp(-dot(d, d) / (uRadius * uRadius)) * uInject;
  gl_FragColor = encodeFlow(clamp(v, -uRange, uRange));
}
`;

export interface FlowSettings {
  radius: number;
  dissipation: number;
  advection: number;
}

/**
 * The validated format per renderer: probing needs a GPU readback, so it runs once per context.
 * A restored context counts as new (it may run on another GPU or driver after a reset): see
 * `forgetValidatedFormat()`.
 */
const validatedFormat = new WeakMap<WebGLRenderer, FlowFormat>();

/**
 * Forgets the format validated for a renderer, so the next flow map probes again (once). Called
 * when the renderer's context is restored; the half-float → RGBA8 → analytic order is unchanged.
 */
export function forgetValidatedFormat(renderer: WebGLRenderer): void {
  validatedFormat.delete(renderer);
}

/** Completeness of a full-size target (the probe validated the format on tiny targets). */
function isComplete(renderer: WebGLRenderer, target: WebGLRenderTarget): boolean {
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    const gl = renderer.getContext();
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    return false;
  } finally {
    renderer.setRenderTarget(previous);
  }
}

export class FlowField {
  readonly format: TargetFormat;
  readonly encoded: boolean;
  private readonly targets: [WebGLRenderTarget, WebGLRenderTarget];
  private readIndex = 0;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;

  /** Returns null when no render-target format works (use the analytic fallback). */
  static create(renderer: WebGLRenderer, size: number, settings: FlowSettings): FlowField | null {
    const hasHalfFloatExtension =
      renderer.extensions.has("EXT_color_buffer_half_float") ||
      renderer.extensions.has("EXT_color_buffer_float");
    const known = validatedFormat.get(renderer);
    let targets: [WebGLRenderTarget, WebGLRenderTarget] | null = null;
    const format = selectFlowFormat(hasHalfFloatExtension, (candidate) => {
      // Skip formats already rejected for this renderer; validate unknown ones once.
      if (known && known !== candidate) return false;
      if (!known && !validateFlowFormat(renderer, candidate)) return false;
      const pair: [WebGLRenderTarget, WebGLRenderTarget] = [
        createFlowTarget(size, size, candidate),
        createFlowTarget(size, size, candidate),
      ];
      if (pair.every((target) => isComplete(renderer, target))) {
        targets = pair;
        return true;
      }
      for (const target of pair) target.dispose();
      return false;
    });
    validatedFormat.set(renderer, format);
    const pair = targets as [WebGLRenderTarget, WebGLRenderTarget] | null;
    if (format === "analytic" || !pair) return null;
    try {
      return new FlowField(renderer, format, pair, settings);
    } catch (error) {
      // Construction failed part-way (Milestone 2.4a rollback): release the targets it was given.
      for (const target of pair) target.dispose();
      throw error;
    }
  }

  private constructor(
    renderer: WebGLRenderer,
    format: TargetFormat,
    targets: [WebGLRenderTarget, WebGLRenderTarget],
    private readonly settings: FlowSettings,
  ) {
    this.format = format;
    this.encoded = format === "rgba8";
    this.targets = targets;

    this.geometry = new BufferGeometry();
    // One oversized triangle covers the whole target with no diagonal seam.
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null },
        uDt: { value: 0 },
        uDissipation: { value: settings.dissipation },
        uAdvection: { value: settings.advection },
        uPointer: { value: new Vector2(0.5, 0.5) },
        uVelocity: { value: new Vector2() },
        uRadius: { value: settings.radius },
        uAspect: { value: 1 },
        uInject: { value: 0 },
        uEncoded: { value: this.encoded ? 1 : 0 },
        uRange: { value: FLOW_RANGE },
        uDeadZone: { value: this.encoded ? ((2 * FLOW_RANGE) / 255) * 1.01 : 0 },
      },
    });
    const quad = new Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);

    // Start at rest: zero velocity is 0.5 in the RGBA8 encoding.
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(new Color());
    const previousAlpha = renderer.getClearAlpha();
    try {
      renderer.setClearColor(this.encoded ? new Color(0.5, 0.5, 0) : new Color(0, 0, 0), 1);
      for (const target of this.targets) {
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
      }
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
    } catch (error) {
      // The caller releases the targets; this pass's own resources are released here.
      this.geometry.dispose();
      this.material.dispose();
      throw error;
    }
  }

  /** The current velocity field, for sampling in other shaders. */
  get texture(): Texture {
    return this.targets[this.readIndex]!.texture;
  }

  /** One inject → advect → dissipate pass. `dt` in seconds; `aspect` = width / height. */
  step(renderer: WebGLRenderer, dt: number, pointer: PointerSample, aspect: number): void {
    const read = this.targets[this.readIndex]!;
    const write = this.targets[1 - this.readIndex]!;
    const u = this.material.uniforms;
    u.uPrev!.value = read.texture;
    u.uDt!.value = dt;
    u.uDissipation!.value = dissipationFor(this.settings.dissipation, dt);
    u.uAspect!.value = aspect;
    (u.uPointer!.value as Vector2).set(pointer.u, pointer.v);
    (u.uVelocity!.value as Vector2).set(pointer.vx, pointer.vy);
    // Injection scales with frame time so the splat strength is frame-rate independent.
    u.uInject!.value = pointer.active ? Math.min(dt * 60, 3) * 0.08 : 0;

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(write);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previous);
    this.readIndex = 1 - this.readIndex;
  }

  dispose(): void {
    for (const target of this.targets) target.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
