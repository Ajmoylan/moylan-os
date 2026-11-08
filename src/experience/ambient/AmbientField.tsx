import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  OneFactor,
  ShaderMaterial,
  Vector2,
  Vector3,
  type IUniform,
} from "three";
import type { EffectiveMotion } from "~/motion/policy";
import { FLOW_RANGE, FlowField } from "../flow/FlowField";
import { MAX_STEP_SECONDS } from "../flow/policy";
import { PointerTracker } from "../flow/PointerTracker";
import { FrameMonitor } from "../performance/FrameMonitor";
import { drawCount, stepDown, type Quality } from "../performance/quality";
import { ambientLook, type Palette, type TierSettings } from "./config";
import { generateParticles } from "./particles";
import { particleFragmentShader, particleVertexShader } from "./shaders";

/** sRGB hex → raw RGB vector (bypasses colour management: the shader outputs these values as-is). */
function rgb(hex: string): Vector3 {
  const value = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

/** Wide layouts put text on the left, so dimming fades in from the left edge there. */
const WIDE_ASPECT = 1.2;

export interface AmbientFieldProps {
  settings: TierSettings;
  /** Adapted share of the tier's particles to draw (Stage-owned quality state). */
  particleShare: number;
  /**
   * Sustained slowness: asks the Stage to lower quality (low-frequency React state, ADR-007).
   * Receives the next step; the Stage applies the DPR cap and passes the new share back down.
   */
  onQualityStep: (next: Quality) => void;
  motion: EffectiveMotion;
  pointerEffects: boolean;
  palette?: Palette;
  /** The stage element: measurements are published on it as data attributes (once per second). */
  statsRef: RefObject<HTMLElement | null>;
  /** Called once, after the first frame has rendered. */
  onFirstFrame: () => void;
}

/**
 * The ambient particle environment: one `Points` draw call animated on the GPU, plus the shared
 * pointer flow map when pointer effects are allowed.
 *
 * ADR-007: React renders this component on discrete changes only (tier, motion, palette). All
 * per-frame data (time, pointer, flow texture, measurements) lives in refs, uniforms and the
 * FlowField's render targets.
 */
export function AmbientField({
  settings,
  particleShare,
  onQualityStep,
  motion,
  pointerEffects,
  palette = ambientLook.palette,
  statsRef,
  onFirstFrame,
}: AmbientFieldProps) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  const geometry = useMemo(() => {
    const { base, seed } = generateParticles(settings.particles);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(base, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 4));
    return g;
  }, [settings.particles]);

  const material = useMemo(() => {
    const uniforms: Record<string, IUniform> = {
      uTime: { value: 0 },
      uDrift: { value: ambientLook.drift },
      uMeander: { value: ambientLook.meander },
      uTwinkle: { value: ambientLook.twinkle },
      uSize: { value: ambientLook.size },
      uPixelRatio: { value: 1 },
      uBrightness: { value: ambientLook.brightness },
      uHotFraction: { value: ambientLook.hotFraction },
      uBase: { value: rgb(ambientLook.palette.base) },
      uAccent: { value: rgb(ambientLook.palette.accent) },
      uHot: { value: rgb(ambientLook.palette.hot) },
      uAspect: { value: 1 },
      uTextDim: { value: ambientLook.textDimWide },
      uTextDimFromLeft: { value: 1 },
      uFlowMode: { value: 0 },
      uFlow: { value: null },
      uFlowEncoded: { value: 0 },
      uFlowRange: { value: FLOW_RANGE },
      uPointer: { value: new Vector2() },
      uPointerVelocity: { value: new Vector2() },
      uPointerRadius: { value: ambientLook.cursor.radius },
      uInfluence: { value: ambientLook.cursor.influence },
      uGlow: { value: ambientLook.cursor.glow },
    };
    return new ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
    });
  }, []);

  // Palette changes (future agents) only touch uniform values.
  useEffect(() => {
    const u = material.uniforms;
    (u.uBase!.value as Vector3).copy(rgb(palette.base));
    (u.uAccent!.value as Vector3).copy(rgb(palette.accent));
    (u.uHot!.value as Vector3).copy(rgb(palette.hot));
  }, [material, palette]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // Pointer flow (ADR-004): allocated only while pointer effects are allowed. Switching to
  // reduced/off at runtime disposes the render targets and detaches the listeners.
  const tracker = useRef<PointerTracker | null>(null);
  const flow = useRef<FlowField | null>(null);
  useEffect(() => {
    const stage = statsRef.current;
    const u = material.uniforms;
    if (!pointerEffects) {
      u.uFlowMode!.value = 0;
      if (stage) stage.dataset.stageFlow = "none";
      return;
    }
    const pointer = new PointerTracker(window);
    pointer.attach();
    const field = FlowField.create(gl, settings.flowSize, ambientLook.cursor);
    tracker.current = pointer;
    flow.current = field;
    u.uFlowMode!.value = field ? 1 : 2;
    u.uFlowEncoded!.value = field?.encoded ? 1 : 0;
    if (stage) stage.dataset.stageFlow = field?.format ?? "analytic";
    return () => {
      pointer.detach();
      field?.dispose();
      tracker.current = null;
      flow.current = null;
      u.uFlowMode!.value = 0;
      u.uFlow!.value = null;
    };
  }, [pointerEffects, gl, settings.flowSize, material, statsRef]);

  // The drawn count is derived from the tier and the adapted share on every change, including
  // a new geometry after a tier change. A layout effect, so no frame draws the full range first.
  const count = drawCount(settings.particles, particleShare);
  useLayoutEffect(() => {
    geometry.setDrawRange(0, count);
    invalidate();
  }, [geometry, count, invalidate]);

  // Measurements and quality adaptation.
  const monitor = useMemo(() => new FrameMonitor(), []);
  const firstFrame = useRef(false);
  /** What was last published; compared each frame (two numbers, no allocation). */
  const published = useRef({ dpr: 0, particles: -1 });

  // A motion change alters the workload: judge the new mode on its own frames.
  useEffect(() => monitor.reset(), [monitor, motion]);

  useEffect(() => {
    const stage = statsRef.current;
    if (stage) stage.dataset.stageDrawCalls = pointerEffects ? "2" : "1";
  }, [pointerEffects, statsRef]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, MAX_STEP_SECONDS);
    const u = material.uniforms;
    const { width, height } = state.size;
    const aspect = width / Math.max(1, height);

    // Only full motion advances time: reduced motion renders a still, fully formed field.
    if (motion === "full") u.uTime!.value += dt;
    u.uAspect!.value = aspect;
    u.uPixelRatio!.value = state.viewport.dpr;
    const wide = aspect > WIDE_ASPECT;
    u.uTextDimFromLeft!.value = wide ? 1 : 0;
    u.uTextDim!.value = wide ? ambientLook.textDimWide : ambientLook.textDimNarrow;

    const pointer = tracker.current;
    if (pointer) {
      const sample = pointer.update(dt);
      const field = flow.current;
      if (field) {
        field.step(state.gl, dt, sample, aspect);
        u.uFlow!.value = field.texture;
      } else {
        (u.uPointer!.value as Vector2).set(sample.u * 2 - 1, sample.v * 2 - 1);
        (u.uPointerVelocity!.value as Vector2).set(sample.smoothVx, sample.smoothVy);
      }
    }

    const stage = statsRef.current;
    // Publish what the renderer and geometry actually use, whenever it changes (adaptation,
    // tier change, pixel limit, display or zoom change), and restart the measurement for it.
    const dpr = state.gl.getPixelRatio();
    const particles = Math.min(geometry.drawRange.count, settings.particles);
    if (dpr !== published.current.dpr || particles !== published.current.particles) {
      published.current.dpr = dpr;
      published.current.particles = particles;
      if (stage) {
        stage.dataset.stageDpr = String(dpr);
        stage.dataset.stageParticles = String(particles);
      }
      monitor.reset();
    }
    if (!firstFrame.current) {
      firstFrame.current = true;
      onFirstFrame();
    }

    if (motion !== "full") return;
    const report = monitor.record(delta);
    if (!report) return;
    if (stage) {
      stage.dataset.stageFrameMs = report.averageMs.toFixed(1);
      stage.dataset.stageFrames = String(report.totalFrames);
    }
    // Sustained slowness (2 s): ask the Stage to step the DPR down, then the share of particles
    // drawn. The monitor restarts, so a step is never requested twice for the same slowness.
    if (report.slowWindows >= 2) {
      monitor.reset();
      const next = stepDown({ dprCap: Number.POSITIVE_INFINITY, particleShare }, dpr);
      if (next) onQualityStep(next);
    }
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
