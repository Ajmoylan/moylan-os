import {
  AddEquation,
  BufferGeometry,
  CustomBlending,
  Group,
  Matrix3,
  Matrix4,
  OneFactor,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferAttribute,
  type IUniform,
} from "three";
import { particleFragmentShader } from "../../ambient/shaders";
import type { ParticleAttributes } from "../../core/morphSlot";
import { createShapeSlot } from "../../core/slots";
import type { Engine } from "../../engine/Engine";
import { Resources } from "../../engine/resources";
import { drawCount } from "../../performance/quality";
import type { AgentView, AgentViewContext, AgentViewProps, MorphRole } from "../types";
import { testPointVertex } from "./shaders";
import { TEST_FRAMES } from "./shape";

/** TEST's arrival and fade (diagnostic values) and its idle pace. */
export const TEST_TIMING = { arrival: 1.0, fade: 0.5, pace: 1 } as const;

/** The two tori: spin rates (rad/s) and the second torus's tilt (rad). */
const SPIN = [0.35, -0.5] as const;
const TILT = 1.1;

/** A three-quarter view, so both tori read as rings. */
const VIEW = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.42);

const additive = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
} as const;

/**
 * The diagnostic TEST renderer (Milestone 2.4b.2, `?morph=test` only): one point draw, no overlays.
 * Like every view it reads the clock's visibility and placement, owns its particle attributes (the
 * shape cache's arrays, never written) and lends them to a morph geometry. Its uniforms are
 * TEST-prefixed and shared with the morph program (slot B), so its per-frame writes reach both.
 */
export class TestView implements AgentView {
  readonly phase = "update";
  private readonly resources = new Resources();
  private readonly root = new Group();
  private readonly points: Points;
  private readonly material: ShaderMaterial;
  private readonly frames = Array.from({ length: TEST_FRAMES }, () => new Matrix3());
  private readonly tilt = new Matrix4().makeRotationX(TILT);
  private readonly m = new Matrix4();
  private readonly modelView = new Matrix4();
  private readonly uniforms: Record<string, IUniform>;
  private props: AgentViewProps | null = null;
  private disposed = false;
  private role: MorphRole = "none";
  private formedOverride = false;
  private published = "";

  constructor(
    private readonly engine: Engine,
    private readonly context: AgentViewContext,
  ) {
    const own = this.resources;
    try {
      own.defer(() => {
        delete context.stage.dataset.testState;
        delete context.stage.dataset.testParticles;
      });
      this.uniforms = {
        uTFrames: { value: this.frames },
        uTModelView: { value: this.modelView },
        uTTime: { value: 0 },
        uTArrive: { value: 0 },
        uTFade: { value: 0 },
        uTScale: { value: 1 },
        uTProjScale: { value: 1000 },
        uTDeep: { value: context.colours.deep },
        uTAccent: { value: context.colours.accent },
        uTHot: { value: context.colours.hot },
      };
      this.material = own.own(
        new ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: testPointVertex,
          fragmentShader: particleFragmentShader,
          ...additive,
        }),
      );
      this.points = new Points(new BufferGeometry(), this.material);
      this.points.frustumCulled = false;
      own.defer(() => this.points.geometry.dispose());
      this.root.add(this.points);
      this.root.visible = false;
      own.defer(() => engine.scene.remove(this.root));
      engine.scene.add(this.root);
    } catch (error) {
      this.disposed = true;
      throw own.rollback(error);
    }
  }

  setProps(next: AgentViewProps): boolean {
    if (this.disposed) return false;
    const prev = this.props;
    let changed = false;
    if (!prev || prev.particles !== next.particles) {
      const old = this.points.geometry;
      this.points.geometry = createShapeSlot(this.context.shape(next.particles));
      old.dispose();
      changed = true;
    }
    if (!prev || prev.particles !== next.particles || prev.particleShare !== next.particleShare) {
      const count = drawCount(next.particles, next.particleShare);
      this.points.geometry.setDrawRange(0, count);
      this.context.stage.dataset.testParticles = String(count);
      changed = true;
    }
    if (!prev || prev.path !== next.path || prev.motion !== next.motion) changed = true;
    this.props = next;
    return changed;
  }

  get state(): string {
    return this.published;
  }

  particles(): ParticleAttributes | null {
    if (!this.props) return null;
    const g = this.points.geometry;
    return {
      position: g.getAttribute("position") as BufferAttribute,
      orbit: g.getAttribute("aOrbit") as BufferAttribute,
      seed: g.getAttribute("aSeed") as BufferAttribute,
    };
  }

  morphUniforms(): Record<string, IUniform> {
    return this.uniforms;
  }

  morphHost(): null {
    return null;
  }

  object(): Group {
    return this.root;
  }

  /** TEST has no overlays, so its presence in a morph changes nothing of its own. */
  setMorphRole(role: MorphRole, _presence: number, formed: boolean): void {
    this.formedOverride = formed;
    if (role === this.role) return;
    this.role = role;
    // In a morph its particles are the morph program's (slot B). Its point layer stays in the scene
    // with the material hidden, so Three.js registers its geometry while the morph uploads its
    // buffers (they are then released with this view, never orphaned).
    this.material.visible = role !== "morph";
  }

  private publish(value: string): void {
    if (this.published === value) return;
    this.published = value;
    this.context.stage.dataset.testState = value;
  }

  update(engine: Engine): void {
    if (!this.props) return;
    const root = this.root;
    if (this.role === "hidden") {
      root.visible = false;
      return;
    }
    const { fade, arrival, time } = this.context.visibility;
    if (fade === 0) {
      root.visible = false;
      this.publish("hidden");
      return;
    }
    const { x, y, scale, onScreen } = this.context.placement.displayed;
    // In a morph its group is always in the scene (its geometry registered; nothing is drawn).
    root.visible = onScreen || this.role === "morph";
    this.publish("visible");
    if (!onScreen) return;

    for (let k = 0; k < TEST_FRAMES; k++) {
      this.m.makeRotationY(SPIN[k]! * time);
      if (k === 1) this.m.premultiply(this.tilt);
      this.frames[k]!.setFromMatrix4(this.m);
    }
    root.position.set(x, y, 0);
    root.scale.setScalar(scale);
    root.quaternion.copy(VIEW);
    // The module's own model-view matrix (in the morph program `modelViewMatrix` is NEX's).
    const camera = engine.camera;
    root.updateMatrixWorld();
    camera.updateMatrixWorld();
    this.modelView.multiplyMatrices(camera.matrixWorldInverse, root.matrixWorld);

    const u = this.uniforms;
    u.uTTime!.value = time;
    u.uTArrive!.value = this.formedOverride ? 1 : Math.min(1, arrival / TEST_TIMING.arrival);
    // Alone, TEST draws at its fade; in a morph its particles are the morph program's (slot B).
    u.uTFade!.value = fade;
    u.uTScale!.value = scale;
    u.uTProjScale!.value =
      (engine.height * engine.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.release();
  }
}
