import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  Group,
  LineSegments,
  Mesh,
  OneFactor,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type IUniform,
  type Object3D,
} from "three";
import type { EffectiveMotion } from "~/motion/policy";
import type { AgentView, AgentViewContext } from "../agents/types";
import { particleFragmentShader } from "../ambient/shaders";
import { createShapeSlot } from "../core/slots";
import type { Engine } from "../engine/Engine";
import { Resources } from "../engine/resources";
import { interactionUniforms, syncInteraction } from "../flow/interaction";
import { MAX_STEP_SECONDS } from "../flow/policy";
import { drawCount } from "../performance/quality";
import { AnchorTracker } from "./anchor";
import { NexMotion } from "./motion";
import { NEX_PARAMS } from "./params";
import { placeNex, type Placement } from "./placement";
import {
  nexAtmosphereFragment,
  nexBillboardVertex,
  nexGlowFragment,
  nexLineVertex,
  nexPointVertex,
  nexShellFragment,
  nexShellVertex,
  nexSolidFragment,
  NEX_GLOW_SHARE,
} from "./shaders";
import { NEX_FIRST_RING } from "./shape";

/** The page marks NEX's place with a layout-only element carrying this attribute. */
export const NEX_ANCHOR = '[data-stage-anchor="nex"]';
/** Approved pacing: 0.7 × the reference timing. */
export const NEX_PACE = 0.7;
export const ARRIVAL_SECONDS = 2.4;
const FADE_SECONDS = 0.6;

/** Discrete inputs, forwarded by the Stage on change (ADR-007). */
export interface NexAvatarProps {
  /** NEX particle count N for the tier (fixed per tier, as for every future agent shape). */
  particles: number;
  /** Adapted share drawn (Stage-owned quality state, shared with the ambient field). */
  particleShare: number;
  /** Tier 3: a faint duplicate point layer gives a bloom-like glow (ARCHITECTURE §6.3). */
  glowLayer: boolean;
  motion: EffectiveMotion;
  /** Current route: the anchor is looked up again after every navigation. */
  path: string;
}

/**
 * Fixed for the layer's lifetime, lent by AgentCore (Milestone 2.4b.1a): the stage element, the
 * shared cursor interaction (ADR-004: written by the flow simulation in the simulate phase, before
 * NEX updates; NEX attaches no listener of its own), the shared colour values and the shape cache.
 */
export type NexAvatarContext = AgentViewContext;

const additive = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
} as const;

/** Hairlines on every ring band: one LineSegments draw for all nine rings. */
function ringLines(): BufferGeometry {
  const segments = 192;
  const position: number[] = [];
  const frame: number[] = [];
  const glow: number[] = [];
  NEX_PARAMS.rings.forEach((ring, index) => {
    for (const [radius, bandGlow] of ring.bands) {
      for (let s = 0; s < segments; s++) {
        for (const k of [s, s + 1]) {
          const a = (k / segments) * Math.PI * 2;
          position.push(radius * Math.cos(a), 0, -radius * Math.sin(a));
          frame.push(NEX_FIRST_RING + index);
          glow.push(bandGlow);
        }
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute("aFrame", new BufferAttribute(new Float32Array(frame), 1));
  g.setAttribute("aGlow", new BufferAttribute(new Float32Array(glow), 1));
  return g;
}

const UNIT_Z = new Vector3(0, 0, 1);

/** Stage data attributes NEX publishes, written only when their value changes. */
type Published = "nexState" | "nexFlow" | "nexFormed";

/**
 * NEX, the host agent (Milestone 2.3): the approved V3 form drawn by one shared-format particle
 * system plus light overlays (ring hairlines, core glow, shell, atmosphere), in the persistent
 * stage alongside the ambient field.
 *
 * An `update`-phase engine layer (Milestone 2.4a; no React). The scene graph, materials, uniforms
 * and per-frame logic are unchanged from Milestone 2.3; time, placement, arrival, fade and pointer
 * live in fields and uniforms (ADR-007). It reads the shared interaction written by the flow
 * simulation earlier in the same frame. NEX follows a layout-only DOM anchor: on routes without
 * one it fades out and stops drawing.
 *
 * Motion: full = arrival from drifting particles, living idle and cursor response; reduced = the
 * fully formed NEX as a still frame (rendered on demand), no pointer and no arrival.
 */
export class NexAvatar implements AgentView {
  readonly phase = "update";
  private readonly resources = new Resources();
  private readonly frames = new NexMotion();
  private readonly root = new Group();
  private readonly common: Record<string, IUniform>;
  private readonly flow = interactionUniforms();
  private readonly pointsUniforms: Record<string, IUniform> & { uProjScale: IUniform<number> };
  private readonly materials: {
    points: ShaderMaterial;
    glowPoints: ShaderMaterial;
    lines: ShaderMaterial;
    glow: ShaderMaterial;
    atmosphere: ShaderMaterial;
    shell: ShaderMaterial;
  };
  private readonly points: Points;
  /** The glow layer draws a prefix of the same particles from the same GPU buffers. */
  private readonly glowPoints: Points;
  private readonly anchor: AnchorTracker;
  private props: NexAvatarProps | null = null;
  private disposed = false;

  // Live state, per frame (ADR-007).
  private time = 0;
  private fade = 0;
  private arrival = 0;
  private shown = false;
  /** Inputs of the cached placement: anchor version, viewport and field of view. */
  private version = -1;
  private width = 0;
  private height = 0;
  private fov = 0;
  private readonly placement: Placement = { x: 0, y: 0, scale: 0, onScreen: false };
  private readonly published: Record<Published, string> = {
    nexState: "",
    nexFlow: "",
    nexFormed: "",
  };
  private readonly facing = new Quaternion();
  private readonly view = new Quaternion(...NEX_PARAMS.view);
  private readonly dir = new Vector3();

  /**
   * Transactional: every material, geometry, scene entry and listener is registered for release
   * as it is created, so a failure part-way through releases what came before it.
   */
  constructor(
    private readonly engine: Engine,
    private readonly context: NexAvatarContext,
  ) {
    const own = this.resources;
    try {
      // The stage attributes NEX publishes are removed with it.
      own.defer(() => {
        const { dataset } = context.stage;
        delete dataset.nexState;
        delete dataset.nexParticles;
        delete dataset.nexFlow;
        delete dataset.nexFormed;
      });
      // The registry palette, held by the Stage-lifetime transition frame (values as before).
      const colours = {
        uDeep: { value: context.colours.deep },
        uAccent: { value: context.colours.accent },
        uHot: { value: context.colours.hot },
      };
      // Shared uniform objects: one write per frame updates every layer.
      this.common = {
        uFrames: { value: this.frames.frames },
        uOrbitFlow: { value: this.frames.flow },
        uTime: { value: 0 },
        uArrive: { value: 0 },
        uFade: { value: 0 },
        uScale: { value: 1 },
        uBreath: { value: 1 },
        ...colours,
      };
      // Shared-flow uniforms (ADR-004), one object for both particle layers.
      this.pointsUniforms = {
        ...this.common,
        ...this.flow,
        uCoreRadius: { value: NEX_PARAMS.coreRadius },
        uProjScale: { value: 1000 },
      };
      const material = (
        uniforms: Record<string, IUniform>,
        vertexShader: string,
        fragmentShader: string,
      ) => own.own(new ShaderMaterial({ uniforms, vertexShader, fragmentShader, ...additive }));
      const intensity = () => ({ uIntensity: { value: 1 } });
      this.materials = {
        points: material(
          { ...this.pointsUniforms, uGlowLayer: { value: 0 }, uGlowFade: { value: 0 } },
          nexPointVertex,
          particleFragmentShader,
        ),
        glowPoints: material(
          { ...this.pointsUniforms, uGlowLayer: { value: 1 }, uGlowFade: { value: 0 } },
          nexPointVertex,
          particleFragmentShader,
        ),
        lines: material(this.common, nexLineVertex, nexSolidFragment),
        glow: material(
          { ...this.common, ...intensity(), uRadius: { value: NEX_PARAMS.coreRadius * 6 } },
          nexBillboardVertex,
          nexGlowFragment,
        ),
        atmosphere: material(
          { ...this.common, ...intensity(), uRadius: { value: 2.6 } },
          nexBillboardVertex,
          nexAtmosphereFragment,
        ),
        shell: material({ ...this.common, ...intensity() }, nexShellVertex, nexShellFragment),
      };
      const lineGeometry = own.own(ringLines());
      const quad = own.own(new PlaneGeometry(2, 2));
      const sphere = own.own(new SphereGeometry(NEX_PARAMS.coreRadius * 1.22, 48, 32));

      // The Milestone 2.3 scene graph, in the same order (draw order and object ids unchanged).
      const m = this.materials;
      this.points = new Points(new BufferGeometry(), m.points);
      this.glowPoints = new Points(new BufferGeometry(), m.glowPoints);
      // The current particle geometries (replaced on tier changes) are released with the layer.
      own.defer(() => {
        this.points.geometry.dispose();
        this.glowPoints.geometry.dispose();
      });
      const children: Object3D[] = [
        new Mesh(quad, m.atmosphere),
        new LineSegments(lineGeometry, m.lines),
        this.points,
        this.glowPoints,
        new Mesh(sphere, m.shell),
        new Mesh(quad, m.glow),
      ];
      for (const child of children) child.frustumCulled = false;
      this.root.add(...children);
      this.root.visible = false;
      own.defer(() => engine.scene.remove(this.root));
      engine.scene.add(this.root);

      // The anchor's box is measured only after layout can have changed (scroll, resize, observed
      // size changes, fonts, navigation), never on every frame; each change requests a frame
      // through the engine's single invalidation path (needed when rendering on demand).
      this.anchor = new AnchorTracker(window, engine.invalidate);
      own.defer(() => this.anchor.detach());
      this.anchor.attach();
    } catch (error) {
      this.disposed = true;
      throw own.rollback(error);
    }
  }

  /**
   * Applies changed props only. Returns whether anything visible may have changed (the Stage then
   * invalidates once). Transactional: new particle geometries replace the old ones only once both
   * are complete.
   */
  setProps(next: NexAvatarProps): boolean {
    if (this.disposed) return false;
    const prev = this.props;
    let changed = false;

    if (!prev || prev.particles !== next.particles) {
      // Shape slot A from the Stage-lifetime cache (generated synchronously on first use).
      const g = createShapeSlot(this.context.shape(next.particles));
      // A second geometry only for the glow layer's own draw range (shared buffers; the shape is
      // shuffled, so a prefix is an even sample).
      const glow = new BufferGeometry();
      for (const name of ["position", "aOrbit", "aSeed"])
        glow.setAttribute(name, g.getAttribute(name));
      const old = [this.points.geometry, this.glowPoints.geometry];
      this.points.geometry = g;
      this.glowPoints.geometry = glow;
      for (const geometry of old) geometry.dispose();
      changed = true;
    }
    // The glow layer is drawn on tier 3 only (one draw call; absent from the frame otherwise).
    if (this.glowPoints.visible !== next.glowLayer) {
      this.glowPoints.visible = next.glowLayer;
      changed = true;
    }

    // Adapted share (shared quality state): the shuffled shape thins evenly.
    if (!prev || prev.particles !== next.particles || prev.particleShare !== next.particleShare) {
      const count = drawCount(next.particles, next.particleShare);
      this.points.geometry.setDrawRange(0, count);
      this.glowPoints.geometry.setDrawRange(0, Math.floor(count * NEX_GLOW_SHARE));
      this.context.stage.dataset.nexParticles = String(count);
      changed = true;
    }

    // The anchor is looked up after each navigation (the route's DOM has committed by then).
    if (!prev || prev.path !== next.path) {
      this.anchor.setElement(document.querySelector(NEX_ANCHOR));
      changed = true;
    }
    if (prev?.motion !== next.motion) changed = true;
    this.props = next;
    return changed;
  }

  /** The published visibility state ("hidden" | "visible"; "" before the first frame). */
  get state(): string {
    return this.published.nexState;
  }

  private publish(key: Published, value: string): void {
    if (this.published[key] === value) return;
    this.published[key] = value;
    this.context.stage.dataset[key] = value;
  }

  update(engine: Engine, delta: number): void {
    const props = this.props;
    if (!props) return;
    const root = this.root;
    const dt = Math.min(delta, MAX_STEP_SECONDS);
    const full = props.motion === "full";
    const box = this.anchor.read();
    const present = box.present;

    // Appear / disappear with the anchor; the arrival replays each time NEX appears. Without full
    // motion NEX is always fully formed (also when motion is reduced during an arrival).
    this.fade = full
      ? Math.min(1, Math.max(0, this.fade + (present ? dt : -dt) / FADE_SECONDS))
      : present
        ? 1
        : 0;
    if (present && !this.shown) {
      this.shown = true;
      this.arrival = 0;
    }
    if (!full) this.arrival = ARRIVAL_SECONDS;
    if (!present && this.fade === 0) this.shown = false;
    if (this.fade === 0) {
      root.visible = false;
      this.publish("nexState", "hidden");
      return;
    }

    // Placement is recomputed only when the anchor box, viewport or field of view changed.
    const camera = engine.camera;
    if (
      present &&
      (this.anchor.version !== this.version ||
        engine.width !== this.width ||
        engine.height !== this.height ||
        camera.fov !== this.fov)
    ) {
      placeNex(box, engine, camera.fov, this.placement);
      this.version = this.anchor.version;
      this.width = engine.width;
      this.height = engine.height;
      this.fov = camera.fov;
    }
    const { x, y, scale, onScreen } = this.placement;
    root.visible = onScreen;
    this.publish("nexState", "visible");
    if (!onScreen) return;

    if (full) {
      this.time += dt * NEX_PACE;
      this.arrival = Math.min(ARRIVAL_SECONDS, this.arrival + dt);
    }
    this.publish("nexFormed", this.arrival >= ARRIVAL_SECONDS ? "true" : "false");
    this.frames.update(this.time);

    // Place, scale and turn NEX so its three-quarter view faces the camera from its anchor.
    root.position.set(x, y, 0);
    root.scale.setScalar(scale);
    this.dir.copy(camera.position).sub(root.position).normalize();
    root.quaternion.copy(this.facing.setFromUnitVectors(UNIT_Z, this.dir).multiply(this.view));

    const u = this.common;
    const m = this.materials;
    u.uTime!.value = this.time;
    u.uArrive!.value = this.arrival / ARRIVAL_SECONDS;
    u.uFade!.value = this.fade;
    u.uScale!.value = scale;
    u.uBreath!.value = this.frames.breath;
    // The glow layer fades in once the arrival is complete.
    const glowFade = m.glowPoints.uniforms.uGlowFade!;
    glowFade.value = full
      ? this.arrival >= ARRIVAL_SECONDS
        ? Math.min(1, (glowFade.value as number) + dt / FADE_SECONDS)
        : 0
      : 1;
    const glowIntensity = 0.9 + 0.2 * this.frames.breathPhase;
    m.glow.uniforms.uIntensity!.value = glowIntensity;
    m.atmosphere.uniforms.uIntensity!.value = glowIntensity;
    m.shell.uniforms.uIntensity!.value = (0.45 + 0.15 * this.frames.breathPhase) * 0.8;
    this.pointsUniforms.uProjScale.value =
      (engine.height * engine.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // Cursor (ADR-004): copy the shared interaction (flow map, analytic fallback or none). Under
    // reduced or off motion its mode is "none", so every pointer uniform is zeroed.
    syncInteraction(this.flow, this.context.interaction, engine.width / Math.max(1, engine.height));
    this.publish("nexFlow", this.context.interaction.mode);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.release();
  }
}
