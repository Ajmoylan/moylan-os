import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  Group,
  LineSegments,
  Mesh,
  OneFactor,
  Euler,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type IUniform,
  type Object3D,
} from "three";
import type { EffectiveMotion } from "~/motion/policy";
import type { AgentView, AgentViewContext, MorphRole, OrbitTransport } from "../agents/types";
import { encodedPresence } from "../core/morph/light";
import type { ParticleAttributes } from "../core/morphSlot";
import { particleFragmentShader } from "../ambient/shaders";
import { OrbitTexture } from "../core/orbits/texture";
import { createShapeSlot } from "../core/slots";
import type { Engine } from "../engine/Engine";
import { Resources } from "../engine/resources";
import { interactionUniforms, syncInteraction } from "../flow/interaction";
import { drawCount } from "../performance/quality";
import {
  ARRIVAL_NOD,
  CURIOSITY,
  PERK,
  TWIRL,
  curiosityRoll,
  damp,
  glanceAt,
  twirlAt,
  ATTENTION_GLOW,
  CORE_LEAN_UNITS,
  CORE_SPRING,
  leanTarget,
  lookTarget,
  LOOK_SPRING,
  PULSE,
  pulseAt,
  spring,
  VITALITY,
  type Look,
  type Spring,
} from "./look";
import { NexMotion } from "./motion";
import { NEX_PARAMS } from "./params";
import { CAMERA_DISTANCE } from "./placement";
import {
  nexAtmosphereFragment,
  nexBillboardVertex,
  nexGlowFragment,
  nexLineVertex,
  nexLineVertexTexture,
  nexPointVertex,
  nexPointVertexTexture,
  nexShellFragment,
  nexShellVertex,
  nexSolidFragment,
  NEX_GLOW_SHARE,
  withPersonality,
} from "./shaders";
import { NEX_FIRST_RING, NEX_FRAMES } from "./shape";

/** The page marks NEX's place with a layout-only element carrying this attribute. */
export const NEX_ANCHOR = '[data-stage-anchor="nex"]';
/** Approved pacing: 0.7 × the reference timing. */
export const NEX_PACE = 0.7;
export const ARRIVAL_SECONDS = 2.4;
export const FADE_SECONDS = 0.6;

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
 * NEX's renderer, hosted by AgentCore (Milestones 2.4a, 2.4b). The scene graph, materials, uniforms
 * and per-frame visual logic are unchanged from Milestone 2.3. Since 2.4b.2 its appearance (anchor,
 * fade, arrival, post-arrival fade, idle time) and placement come from `TransitionClock`, the
 * stage's single transition timeline, which computes them with NEX's original arithmetic earlier in
 * the same frame (ADR-007). It reads the shared interaction written by the flow simulation. On
 * routes without NEX's layout-only DOM anchor it fades out and stops drawing.
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
  /** The orbit-texture transport's table (null with the approved uniform transport). */
  private readonly orbitTexture: OrbitTexture | null;
  private props: NexAvatarProps | null = null;
  private disposed = false;
  /** Its part in a morph (Milestone 2.4b.2); `none` is NEX's own, unchanged rendering. */
  private role: MorphRole = "none";
  /** NEX's fade as its morph module reads it (unscaled by presence). */
  private readonly morphFade: IUniform<number> = { value: 0 };
  /** A table kept only for a texture-transport morph from the uniform transport. */
  private extraTable: OrbitTexture | null = null;
  private presence = 1;
  private formedOverride = false;
  private readonly published: Record<Published, string> = {
    nexState: "",
    nexFlow: "",
    nexFormed: "",
  };
  private readonly facing = new Quaternion();
  private readonly view = new Quaternion(...NEX_PARAMS.view);
  private readonly dir = new Vector3();
  /** Launch sprint: NEX's sprung turn towards the cursor (exactly zero at rest). */
  private readonly look: Look = { yaw: 0, pitch: 0 };
  private readonly springs = {
    yaw: { x: 0, v: 0 } as Spring,
    pitch: { x: 0, v: 0 } as Spring,
    leanX: { x: 0, v: 0 } as Spring,
    leanY: { x: 0, v: 0 } as Spring,
    roll: { x: 0, v: 0 } as Spring,
  };
  /**
   * Personality 2.0 (Full Motion only, NEX's own role): the curious tilt (sprung, like the turn),
   * the pointer's last position and how long it has rested (0 … 1), the twirl after an activation
   * (its start in NEX's idle time, −1 when none), and the glide state seen last frame (an arrival
   * nod when a glide ends). All exactly zero at rest.
   */
  private roll = 0;
  private readonly lastCursor = { x: 0, y: 0, valid: false };
  private dwell = 0;
  private readonly twirl = { roll: 0, lift: 0 };
  private twirlStart = -1;
  private plays = 0;
  private wasGliding = false;
  /** The energy pulse: wavefront radius and strength (uPulse), and the glow's swell. */
  private readonly pulse = { radius: 0, strength: 0, swell: 0 };
  private readonly pulseUniform: IUniform<Vector2> = { value: new Vector2() };
  private readonly lookAim: Look = { yaw: 0, pitch: 0 };
  private readonly lookEuler = new Euler();
  private readonly lookTurn = new Quaternion();
  /** Launch sprint: the core's damped lean (screen space, 0 … 1) and its NEX-local shift. */
  private readonly lean = { x: 0, y: 0 };
  private readonly leanAim = { x: 0, y: 0 };
  private readonly coreShift: IUniform<Vector3> = { value: new Vector3() };
  private readonly inverse = new Quaternion();
  /** The core's glow billboard and shell (they lean with the core particles). */
  private readonly coreMeshes: Object3D[];
  /** Personality enabled (Stage); off, NEX renders exactly its approved idle look. */
  private readonly personal: boolean;

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
      // Orbit frames: the approved uniform arrays, or (Milestone 2.4b.1b) the same matrices in an
      // RGBA32F table, owned and released with the layer (flow speeds stay a uniform array).
      const texture = context.orbitTransport === "texture";
      this.orbitTexture = texture ? own.own(new OrbitTexture(NEX_FRAMES)) : null;
      this.orbitTexture?.write(this.frames.frames);
      const orbits: Record<string, IUniform> = this.orbitTexture
        ? {
            uOrbitTable: { value: this.orbitTexture.texture },
            uOrbitFlow: { value: this.frames.flow },
          }
        : { uFrames: { value: this.frames.frames }, uOrbitFlow: { value: this.frames.flow } };
      this.personal = context.personality === true;
      const approvedPoint = texture ? nexPointVertexTexture : nexPointVertex;
      const pointVertex = this.personal ? withPersonality(approvedPoint) : approvedPoint;
      const lineVertex = texture ? nexLineVertexTexture : nexLineVertex;
      // Shared uniform objects: one write per frame updates every layer.
      this.common = {
        ...orbits,
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
        ...(this.personal ? { uCoreShift: this.coreShift, uPulse: this.pulseUniform } : {}),
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
          pointVertex,
          particleFragmentShader,
        ),
        glowPoints: material(
          { ...this.pointsUniforms, uGlowLayer: { value: 1 }, uGlowFade: { value: 0 } },
          pointVertex,
          particleFragmentShader,
        ),
        lines: material(this.common, lineVertex, nexSolidFragment),
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
      const shell = new Mesh(sphere, m.shell);
      const glow = new Mesh(quad, m.glow);
      this.coreMeshes = [shell, glow];
      const children: Object3D[] = [
        new Mesh(quad, m.atmosphere),
        new LineSegments(lineGeometry, m.lines),
        this.points,
        this.glowPoints,
        shell,
        glow,
      ];
      for (const child of children) child.frustumCulled = false;
      this.root.add(...children);
      this.root.visible = false;
      own.defer(() => engine.scene.remove(this.root));
      engine.scene.add(this.root);
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

    // A navigation can move or remove NEX's anchor (TransitionClock looks it up again).
    if (!prev || prev.path !== next.path) changed = true;
    if (prev?.motion !== next.motion) changed = true;
    this.props = next;
    return changed;
  }

  /** The published visibility state ("hidden" | "visible"; "" before the first frame). */
  get state(): string {
    return this.published.nexState;
  }

  /**
   * The uniforms NEX's slot-A morph module reads for `transport`: the same objects its own point
   * programs use (so its per-frame writes reach the morph), except `uFade`, which in a morph is
   * NEX's own fade, never scaled by its presence (only the overlays are). A transport other than
   * NEX's idle one gets the same frames: the matrix array, or a table this view then keeps written.
   */
  morphUniforms(transport: OrbitTransport): Record<string, IUniform> {
    const uniforms: Record<string, IUniform> = {
      ...this.pointsUniforms,
      uFade: this.morphFade,
      uGlowLayer: { value: 0 },
      uGlowFade: { value: 0 },
    };
    delete uniforms.uFrames;
    delete uniforms.uOrbitTable;
    if (transport === "uniforms") uniforms.uFrames = { value: this.frames.frames };
    else uniforms.uOrbitTable = { value: this.morphTable().texture };
    return uniforms;
  }

  /** The orbit table for a texture-transport morph: NEX's own, or one made for the morph. */
  private morphTable(): OrbitTexture {
    if (this.orbitTexture) return this.orbitTexture;
    if (!this.extraTable) {
      this.extraTable = this.resources.own(new OrbitTexture(NEX_FRAMES));
      this.extraTable.write(this.frames.frames);
    }
    return this.extraTable;
  }

  /** NEX's group: its morph module's `modelViewMatrix` is this group's. */
  morphHost(): Object3D {
    return this.root;
  }

  /** NEX's scene object (its programs are compiled ahead of a morph that ends on NEX). */
  object(): Object3D {
    return this.root;
  }

  setMorphRole(role: MorphRole, presence: number, formed: boolean): void {
    this.presence = presence;
    this.formedOverride = formed;
    if (role === this.role) return;
    this.role = role;
    // In a morph NEX's particles are drawn by the morph program; its glow layer (tier 3) stays,
    // faded with its presence, so the first and last morph frames match its idle frames. Its own
    // point layer stays in the scene with its material hidden: Three.js still registers (and owns)
    // its geometry, so the buffers the morph uploads are released with this view, never orphaned.
    this.materials.points.visible = role !== "morph";
  }

  /** NEX's particle attributes (its own GPU buffers), for a morph geometry to borrow. */
  particles(): ParticleAttributes | null {
    if (!this.props) return null;
    const g = this.points.geometry;
    return {
      position: g.getAttribute("position") as BufferAttribute,
      orbit: g.getAttribute("aOrbit") as BufferAttribute,
      seed: g.getAttribute("aSeed") as BufferAttribute,
    };
  }

  private publish(key: Published, value: string): void {
    if (this.published[key] === value) return;
    this.published[key] = value;
    this.context.stage.dataset[key] = value;
  }

  update(engine: Engine, delta = 0): void {
    if (!this.props) return;
    const root = this.root;
    // Built for a morph that hasn't started: not drawn yet.
    if (this.role === "hidden") {
      root.visible = false;
      return;
    }
    // Appearance and placement, computed earlier in this frame by TransitionClock.
    const { fade, arrival, formed, time } = this.context.visibility;
    if (fade === 0) {
      root.visible = false;
      this.publish("nexState", "hidden");
      return;
    }
    const camera = engine.camera;
    const { x, y, scale, onScreen } = this.context.placement.displayed;
    root.visible = onScreen;
    this.publish("nexState", "visible");
    if (!onScreen) return;

    this.publish("nexFormed", arrival >= ARRIVAL_SECONDS || this.formedOverride ? "true" : "false");
    this.frames.update(time);
    this.orbitTexture?.write(this.frames.frames);
    this.extraTable?.write(this.frames.frames);

    // Place, scale and turn NEX so its three-quarter view faces the camera from its anchor.
    root.position.set(x, y, 0);
    // Personality 2.0: NEX perks up with the visitor's attention (0 without Full Motion) and lifts a
    // little as he twirls; exactly his placement's scale at rest.
    const perk = this.personal ? PERK * this.context.visibility.attention + this.twirl.lift : 0;
    root.scale.setScalar(perk === 0 ? scale : scale * (1 + perk));
    this.dir.copy(camera.position).sub(root.position).normalize();
    this.facing.setFromUnitVectors(UNIT_Z, this.dir);
    // Launch sprint (personality): the rings turn towards the cursor, in the camera-facing frame,
    // and the core leans towards it (Full Motion with pointer effects only; NEX's own role only).
    // At rest both are exactly zero and skipped, so NEX's approved idle transform is unchanged.
    if (this.personal) this.followCursor(engine, x, y, delta);
    const roll = this.roll + this.twirl.roll;
    if (this.look.yaw !== 0 || this.look.pitch !== 0 || roll !== 0) {
      this.lookEuler.set(this.look.pitch, this.look.yaw, roll);
      this.facing.multiply(this.lookTurn.setFromEuler(this.lookEuler));
    }
    root.quaternion.copy(this.facing.multiply(this.view));
    if (this.personal) this.leanCore();

    const u = this.common;
    const m = this.materials;
    u.uTime!.value = time;
    u.uArrive!.value = arrival / ARRIVAL_SECONDS;
    u.uFade!.value = fade;
    u.uScale!.value = scale;
    // Breathing: the approved core scale, plus (personality) the vitality amplitude on the same
    // phase, so the pulse is visible; both are 1 at the cycle's rest phase.
    const phase = this.frames.breathPhase;
    const vital = this.personal ? 1 : 0;
    u.uBreath!.value = vital ? this.frames.breath + VITALITY.breath * phase : this.frames.breath;
    // The glow layer fades in once the arrival is complete (TransitionClock's post-arrival fade).
    m.glowPoints.uniforms.uGlowFade!.value = formed;
    if (this.role === "morph") {
      // NEX's own light in a morph (its halo, shell, glow billboards, ring lines and tier-3 glow
      // layer) is scaled by one factor: its presence (the linear phase, in linear light), encoded
      // once through the shared uFade. The particles' light is the morph program's. A destination
      // is drawn fully formed.
      this.morphFade.value = fade;
      u.uFade!.value = fade * encodedPresence(this.presence);
      if (this.formedOverride) u.uArrive!.value = 1;
    }
    const glowIntensity = 0.9 + 0.2 * phase;
    if (this.personal) {
      // Personality: the breathing made visible (vitality, same phase), the core's energy pulse
      // (Full Motion only; it starts once NEX has formed) and the visitor's attention; all 0 at rest.
      const live = this.props.motion === "full" ? formed : 0;
      pulseAt(time, this.pulse);
      this.pulseUniform.value.set(this.pulse.radius, this.pulse.strength * live);
      const attention = this.context.visibility.attention;
      const extra = ATTENTION_GLOW * attention + PULSE.glow * this.pulse.swell * live;
      m.glow.uniforms.uIntensity!.value = glowIntensity + VITALITY.glow * phase + extra;
      m.atmosphere.uniforms.uIntensity!.value = glowIntensity + VITALITY.atmosphere * phase + extra;
      m.shell.uniforms.uIntensity!.value =
        (0.45 + 0.15 * phase + VITALITY.shell * phase + 0.5 * extra) * 0.8;
    } else {
      // The approved breathing glow, exactly.
      m.glow.uniforms.uIntensity!.value = glowIntensity;
      m.atmosphere.uniforms.uIntensity!.value = glowIntensity;
      m.shell.uniforms.uIntensity!.value = (0.45 + 0.15 * this.frames.breathPhase) * 0.8;
    }
    this.pointsUniforms.uProjScale.value =
      (engine.height * engine.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // Cursor (ADR-004): copy the shared interaction (flow map, analytic fallback or none). Under
    // reduced or off motion its mode is "none", so every pointer uniform is zeroed.
    syncInteraction(this.flow, this.context.interaction, engine.width / Math.max(1, engine.height));
    this.publish("nexFlow", this.context.interaction.mode);
  }

  /**
   * Advances the damped ring turn and core lean towards the cursor (or back to rest) by `delta`
   * seconds, and Personality 2.0's reactions: the curious tilt when the pointer rests, an idle
   * glance when there is no pointer, a twirl after an activation and a nod when a glide arrives.
   * All of them need Full Motion, NEX's own role and a formed NEX; otherwise they ease to rest.
   */
  private followCursor(engine: Engine, x: number, y: number, delta: number): void {
    const { interaction, visibility, placement } = this.context;
    const aim = this.lookAim;
    const lean = this.leanAim;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const lively = this.role === "none" && this.props?.motion === "full" && visibility.formed >= 1;
    const cursor = this.lastCursor;
    let rollAim = 0;
    if (this.role === "none" && interaction.mode !== "none" && interaction.cursorActive) {
      // NEX's centre in NDC: world (x, y) on the z = 0 plane, CAMERA_DISTANCE from the camera.
      const aspect = engine.width / Math.max(1, engine.height);
      const halfHeight = CAMERA_DISTANCE * Math.tan((engine.camera.fov * Math.PI) / 360);
      const nx = x / (halfHeight * aspect);
      const ny = y / halfHeight;
      const { x: cx, y: cy } = interaction.cursor;
      lookTarget(cx, cy, nx, ny, aspect, aim);
      leanTarget(cx, cy, nx, ny, aspect, lean);
      // Curiosity: a resting pointer earns a quizzical tilt towards its side.
      const speed =
        cursor.valid && dt > 0 ? Math.hypot(cx - cursor.x, cy - cursor.y) / dt : Infinity;
      this.dwell = damp(this.dwell, speed < CURIOSITY.still ? 1 : 0, dt, CURIOSITY.settle);
      if (lively) rollAim = curiosityRoll((cx - nx) * aspect, this.dwell);
      cursor.x = cx;
      cursor.y = cy;
      cursor.valid = true;
    } else {
      lean.x = lean.y = 0;
      this.dwell = 0;
      cursor.valid = false;
      // Idle presence: with no pointer (phones, or the pointer elsewhere), an occasional glance.
      if (lively) glanceAt(visibility.time, aim);
      else aim.yaw = aim.pitch = 0;
    }
    const s = this.springs;
    // Arrival: a small nod as a glide into his spot ends (the glide itself is untouched).
    if (this.wasGliding && !placement.gliding && lively) s.pitch.v -= ARRIVAL_NOD;
    this.wasGliding = placement.gliding;
    this.look.yaw = spring(s.yaw, aim.yaw, dt, LOOK_SPRING);
    this.look.pitch = spring(s.pitch, aim.pitch, dt, LOOK_SPRING);
    this.roll = spring(s.roll, rollAim, dt, LOOK_SPRING);
    this.lean.x = spring(s.leanX, lean.x, dt, CORE_SPRING);
    this.lean.y = spring(s.leanY, lean.y, dt, CORE_SPRING);
    // Playfulness: a twirl for each new activation of his launcher.
    if (visibility.plays !== this.plays) {
      this.plays = visibility.plays;
      if (lively) this.twirlStart = visibility.time;
    }
    if (this.twirlStart >= 0) {
      const progress = (visibility.time - this.twirlStart) / TWIRL.seconds;
      if (progress >= 1 || !lively) {
        this.twirlStart = -1;
        this.twirl.roll = this.twirl.lift = 0;
      } else twirlAt(progress, this.twirl);
    }
  }

  /**
   * The core's lean as a NEX-local shift: the screen-space lean (x right, y up; the camera looks
   * down −z) turned into NEX's frame, so the core moves towards the cursor on screen however the
   * rings are turned. The core particles take it in their shader, the glow and shell as position.
   */
  private leanCore(): void {
    const shift = this.coreShift.value;
    if (this.lean.x === 0 && this.lean.y === 0) shift.set(0, 0, 0);
    else {
      shift
        .set(this.lean.x * CORE_LEAN_UNITS, this.lean.y * CORE_LEAN_UNITS, 0)
        .applyQuaternion(this.inverse.copy(this.root.quaternion).invert());
    }
    for (const mesh of this.coreMeshes) mesh.position.copy(shift);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.release();
  }
}
