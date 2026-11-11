import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  OneFactor,
  Points,
  ShaderMaterial,
  type Vector3,
  type IUniform,
} from "three";
import type { EffectiveMotion } from "~/motion/policy";
import type { Engine, FrameLayer } from "../engine/Engine";
import { Resources } from "../engine/resources";
import { interactionUniforms, syncInteraction, type StageInteraction } from "../flow/interaction";
import { MAX_STEP_SECONDS } from "../flow/policy";
import { FrameMonitor } from "../performance/FrameMonitor";
import { drawCount, stepDown, type Quality } from "../performance/quality";
import { ambientLook, rgb, type Palette, type TierSettings } from "./config";
import { generateParticles } from "./particles";
import { particleFragmentShader, particleVertexShader } from "./shaders";

/** Wide layouts put text on the left, so dimming fades in from the left edge there. */
const WIDE_ASPECT = 1.2;

/** Discrete inputs, forwarded by the Stage on change (ADR-007). */
export interface AmbientFieldProps {
  settings: TierSettings;
  /** Adapted share of the tier's particles to draw (Stage-owned quality state). */
  particleShare: number;
  motion: EffectiveMotion;
  palette?: Palette;
}

/** Fixed for the layer's lifetime. */
export interface AmbientFieldContext {
  /** The stage element: measurements are published on it as data attributes. */
  stage: HTMLElement;
  /** The shared cursor interaction (ADR-004), written by the flow simulation; read here. */
  interaction: StageInteraction;
  /** Sustained slowness: asks the Stage to lower quality (low-frequency React state, ADR-007). */
  onQualityStep: (next: Quality) => void;
}

function particleGeometry(count: number): BufferGeometry {
  const { base, seed } = generateParticles(count);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(base, 3));
  g.setAttribute("aSeed", new BufferAttribute(seed, 4));
  return g;
}

/**
 * The ambient particle environment: one `Points` draw call animated on the GPU, reacting to the
 * shared pointer flow like every other layer. It also runs the stage's frame monitor (adaptive
 * quality, ARCHITECTURE §9.2) and publishes the stage measurements, as it has since M2.2.
 *
 * An `update`-phase engine layer (Milestone 2.4a): props arrive through `setProps()` and only
 * changed values are applied; per-frame data (time, measurements) lives in fields and uniforms.
 * Construction and geometry rebuilds are transactional: a failure releases what was allocated.
 */
export class AmbientField implements FrameLayer {
  readonly phase = "update";
  private readonly resources = new Resources();
  private readonly flowUniforms = interactionUniforms();
  private readonly material: ShaderMaterial;
  private readonly points: Points;
  private props: AmbientFieldProps | null = null;
  private readonly monitor = new FrameMonitor();
  /** What was last published; compared each frame (two numbers, no allocation). */
  private readonly published = { dpr: 0, particles: -1 };
  private disposed = false;

  constructor(
    private readonly engine: Engine,
    private readonly context: AmbientFieldContext,
  ) {
    const own = this.resources;
    try {
      const uniforms: Record<string, IUniform> = {
        ...this.flowUniforms,
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
        uTextDim: { value: ambientLook.textDimWide },
        uTextDimFromLeft: { value: 1 },
        uInfluence: { value: ambientLook.cursor.influence },
        uGlow: { value: ambientLook.cursor.glow },
      };
      this.material = own.own(
        new ShaderMaterial({
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
        }),
      );
      this.points = new Points(new BufferGeometry(), this.material);
      // The current geometry (replaced on tier changes) is released with the layer.
      own.defer(() => this.points.geometry.dispose());
      this.points.frustumCulled = false;
      own.defer(() => engine.scene.remove(this.points));
      engine.scene.add(this.points);
    } catch (error) {
      this.disposed = true;
      throw own.rollback(error);
    }
  }

  /**
   * Applies changed props only (a tier change rebuilds the geometry; share → draw range). Returns
   * whether anything visible changed (the Stage then invalidates once). Transactional: a new
   * geometry replaces the old one only once it is complete.
   */
  setProps(next: AmbientFieldProps): boolean {
    if (this.disposed) return false;
    const prev = this.props;
    let changed = false;

    if (!prev || prev.settings.particles !== next.settings.particles) {
      const g = particleGeometry(next.settings.particles);
      const old = this.points.geometry;
      this.points.geometry = g;
      old.dispose();
      changed = true;
    }

    // Palette changes (future agents) only touch uniform values.
    const palette = next.palette ?? ambientLook.palette;
    if (!prev || (prev.palette ?? ambientLook.palette) !== palette) {
      const u = this.material.uniforms;
      (u.uBase!.value as Vector3).copy(rgb(palette.base));
      (u.uAccent!.value as Vector3).copy(rgb(palette.accent));
      (u.uHot!.value as Vector3).copy(rgb(palette.hot));
      changed = true;
    }

    // The drawn count is derived from the tier and the adapted share on every change, including
    // a new geometry after a tier change. Applied before the next frame, never during one.
    const count = drawCount(next.settings.particles, next.particleShare);
    if (this.points.geometry.drawRange.count !== count) {
      this.points.geometry.setDrawRange(0, count);
      changed = true;
    }

    // A motion change alters the workload: judge the new mode on its own frames.
    if (prev?.motion !== next.motion) {
      this.monitor.reset();
      changed = true;
    }
    this.props = next;
    return changed;
  }

  update(engine: Engine, delta: number): void {
    const props = this.props;
    if (!props) return;
    const { stage, interaction } = this.context;
    const dt = Math.min(delta, MAX_STEP_SECONDS);
    const u = this.material.uniforms;
    const { width, height } = engine;
    const aspect = width / Math.max(1, height);

    // Only full motion advances time: reduced motion renders a still, fully formed field.
    if (props.motion === "full") u.uTime!.value += dt;
    u.uPixelRatio!.value = engine.dpr;
    const wide = aspect > WIDE_ASPECT;
    u.uTextDimFromLeft!.value = wide ? 1 : 0;
    u.uTextDim!.value = wide ? ambientLook.textDimWide : ambientLook.textDimNarrow;
    // The shared interaction, as written by this frame's simulate phase.
    syncInteraction(this.flowUniforms, interaction, aspect);

    // Publish what the renderer and geometry actually use, whenever it changes (adaptation,
    // tier change, pixel limit, display or zoom change), and restart the measurement for it.
    const dpr = engine.renderer.getPixelRatio();
    const particles = Math.min(this.points.geometry.drawRange.count, props.settings.particles);
    if (dpr !== this.published.dpr || particles !== this.published.particles) {
      this.published.dpr = dpr;
      this.published.particles = particles;
      stage.dataset.stageDpr = String(dpr);
      stage.dataset.stageParticles = String(particles);
      this.monitor.reset();
    }

    if (props.motion !== "full") return;
    const report = this.monitor.record(delta);
    if (!report) return;
    stage.dataset.stageFrameMs = report.averageMs.toFixed(1);
    stage.dataset.stageFrames = String(report.totalFrames);
    // Sustained slowness (2 s): ask the Stage to step the DPR down, then the share of particles
    // drawn. The monitor restarts, so a step is never requested twice for the same slowness.
    if (report.slowWindows >= 2) {
      this.monitor.reset();
      const next = stepDown(
        { dprCap: Number.POSITIVE_INFINITY, particleShare: props.particleShare },
        dpr,
      );
      if (next) this.context.onQualityStep(next);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.release();
  }
}
