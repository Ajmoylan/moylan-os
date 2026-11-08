import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  type Group,
  OneFactor,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type IUniform,
} from "three";
import type { EffectiveMotion } from "~/motion/policy";
import { nexPalette, rgb } from "../ambient/config";
import { particleFragmentShader } from "../ambient/shaders";
import { interactionUniforms, syncInteraction, type StageInteraction } from "../flow/interaction";
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
import { generateNexShape, NEX_FIRST_RING } from "./shape";

/** The page marks NEX's place with a layout-only element carrying this attribute. */
export const NEX_ANCHOR = '[data-stage-anchor="nex"]';
/** Approved pacing: 0.7 × the reference timing. */
export const NEX_PACE = 0.7;
export const ARRIVAL_SECONDS = 2.4;
const FADE_SECONDS = 0.6;

export interface NexAvatarProps {
  /** NEX particle count N for the tier (fixed per tier, as for every future agent shape). */
  particles: number;
  /** Adapted share drawn (Stage-owned quality state, shared with the ambient field). */
  particleShare: number;
  /** Tier 3: a faint duplicate point layer gives a bloom-like glow (ARCHITECTURE §6.3). */
  glowLayer: boolean;
  motion: EffectiveMotion;
  /**
   * The stage's shared cursor-interaction substrate (ADR-004), written by the ambient field: NEX
   * samples the same flow map (or analytic fallback) and attaches no listener of its own.
   */
  interaction: StageInteraction;
  /** The stage element: NEX state is published on it as data attributes. */
  statsRef: RefObject<HTMLElement | null>;
  /** Current route: the anchor is looked up again after every navigation. */
  path: string;
}

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

interface LiveState {
  time: number;
  fade: number;
  arrival: number;
  shown: boolean;
  /** Published data attributes, compared before writing (no per-frame DOM writes). */
  state: string;
  flow: string;
  formed: string;
  /** Inputs of the cached placement: anchor version, viewport and field of view. */
  version: number;
  width: number;
  height: number;
  fov: number;
  placement: Placement;
}

/** Writes a data attribute on the stage element only when its value changes. */
function publish(
  live: LiveState,
  stage: HTMLElement | null,
  key: "state" | "flow" | "formed",
  value: string,
): void {
  if (live[key] === value) return;
  live[key] = value;
  if (!stage) return;
  if (key === "state") stage.dataset.nexState = value;
  else if (key === "flow") stage.dataset.nexFlow = value;
  else stage.dataset.nexFormed = value;
}

/**
 * NEX, the host agent (Milestone 2.3): the approved V3 form drawn by one shared-format particle
 * system plus light overlays (ring hairlines, core glow, shell, atmosphere), in the persistent
 * stage alongside the ambient field.
 *
 * ADR-007: React renders this on discrete changes only (tier, share, motion, route). Time,
 * placement, arrival, fade and pointer live in refs and uniforms. NEX follows a layout-only DOM
 * anchor: on routes without one it fades out and stops drawing.
 *
 * Motion: full = arrival from drifting particles, living idle and cursor response; reduced = the
 * fully formed NEX as a still frame (rendered on demand), no pointer and no arrival.
 */
export function NexAvatar({
  particles,
  particleShare,
  glowLayer,
  motion,
  interaction,
  statsRef,
  path,
}: NexAvatarProps) {
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<Group>(null);

  const frames = useMemo(() => new NexMotion(), []);
  const geometry = useMemo(() => {
    const shape = generateNexShape(particles);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(shape.positions, 3));
    g.setAttribute("aOrbit", new BufferAttribute(shape.orbits, 1));
    g.setAttribute("aSeed", new BufferAttribute(shape.seeds, 4));
    return g;
  }, [particles]);

  const scene = useMemo(() => {
    const colours = {
      uDeep: { value: rgb(nexPalette.base) },
      uAccent: { value: rgb(nexPalette.accent) },
      uHot: { value: rgb(nexPalette.hot) },
    };
    // Shared uniform objects: one write per frame updates every layer.
    const common: Record<string, IUniform> = {
      uFrames: { value: frames.frames },
      uOrbitFlow: { value: frames.flow },
      uTime: { value: 0 },
      uArrive: { value: 0 },
      uFade: { value: 0 },
      uScale: { value: 1 },
      uBreath: { value: 1 },
      ...colours,
    };
    // Shared-flow uniforms (ADR-004), one object for both particle layers.
    const flow = interactionUniforms();
    const pointsUniforms = {
      ...common,
      ...flow,
      uCoreRadius: { value: NEX_PARAMS.coreRadius },
      uProjScale: { value: 1000 },
    };
    const material = (
      uniforms: Record<string, IUniform>,
      vertexShader: string,
      fragmentShader: string,
    ) => new ShaderMaterial({ uniforms, vertexShader, fragmentShader, ...additive });
    const intensity = () => ({ uIntensity: { value: 1 } });
    return {
      common,
      flow,
      points: material(
        { ...pointsUniforms, uGlowLayer: { value: 0 }, uGlowFade: { value: 0 } },
        nexPointVertex,
        particleFragmentShader,
      ),
      glowPoints: material(
        { ...pointsUniforms, uGlowLayer: { value: 1 }, uGlowFade: { value: 0 } },
        nexPointVertex,
        particleFragmentShader,
      ),
      lines: material(common, nexLineVertex, nexSolidFragment),
      glow: material(
        { ...common, ...intensity(), uRadius: { value: NEX_PARAMS.coreRadius * 6 } },
        nexBillboardVertex,
        nexGlowFragment,
      ),
      atmosphere: material(
        { ...common, ...intensity(), uRadius: { value: 2.6 } },
        nexBillboardVertex,
        nexAtmosphereFragment,
      ),
      shell: material({ ...common, ...intensity() }, nexShellVertex, nexShellFragment),
      pointsUniforms,
      lineGeometry: ringLines(),
      quad: new PlaneGeometry(2, 2),
      sphere: new SphereGeometry(NEX_PARAMS.coreRadius * 1.22, 48, 32),
    };
  }, [frames]);

  // The glow layer draws a prefix of the same particles from the same GPU buffers (the shape is
  // shuffled, so a prefix is an even sample): a second geometry only for its own draw range.
  const glowGeometry = useMemo(() => {
    const g = new BufferGeometry();
    for (const name of ["position", "aOrbit", "aSeed"])
      g.setAttribute(name, geometry.getAttribute(name));
    return g;
  }, [geometry]);

  useEffect(
    () => () => {
      geometry.dispose();
      glowGeometry.dispose();
    },
    [geometry, glowGeometry],
  );
  useEffect(
    () => () => {
      for (const resource of [
        scene.points,
        scene.glowPoints,
        scene.lines,
        scene.glow,
        scene.atmosphere,
        scene.shell,
        scene.lineGeometry,
        scene.quad,
        scene.sphere,
      ]) {
        resource.dispose();
      }
      const stage = statsRef.current;
      if (stage) {
        delete stage.dataset.nexState;
        delete stage.dataset.nexParticles;
        delete stage.dataset.nexFlow;
        delete stage.dataset.nexFormed;
      }
    },
    [scene, statsRef],
  );

  // Adapted share (shared quality state): the shuffled shape thins evenly.
  const count = drawCount(particles, particleShare);
  useLayoutEffect(() => {
    geometry.setDrawRange(0, count);
    glowGeometry.setDrawRange(0, Math.floor(count * NEX_GLOW_SHARE));
    if (statsRef.current) statsRef.current.dataset.nexParticles = String(count);
    invalidate();
  }, [geometry, glowGeometry, count, statsRef, invalidate]);

  // The anchor's box is measured only after layout can have changed (scroll, resize, observed
  // size changes, fonts, navigation), never on every frame; each change also draws a new frame
  // when rendering on demand (reduced motion).
  const anchor = useMemo(() => new AnchorTracker(window, invalidate), [invalidate]);
  useEffect(() => {
    anchor.attach();
    return () => anchor.detach();
  }, [anchor]);
  // The anchor is looked up after each navigation (the route's DOM has committed by then).
  useEffect(() => {
    anchor.setElement(document.querySelector(NEX_ANCHOR));
  }, [path, anchor]);

  const live = useRef<LiveState>({
    time: 0,
    fade: 0,
    arrival: 0,
    shown: false,
    state: "",
    flow: "",
    formed: "",
    version: -1,
    width: 0,
    height: 0,
    fov: 0,
    placement: { x: 0, y: 0, scale: 0, onScreen: false },
  });
  const tmp = useMemo(
    () => ({
      facing: new Quaternion(),
      view: new Quaternion(...NEX_PARAMS.view),
      dir: new Vector3(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const root = group.current;
    if (!root) return;
    const s = live.current;
    const stage = statsRef.current;
    const dt = Math.min(delta, MAX_STEP_SECONDS);
    const full = motion === "full";
    const box = anchor.read();
    const present = box.present;

    // Appear / disappear with the anchor; the arrival replays each time NEX appears. Without full
    // motion NEX is always fully formed (also when motion is reduced during an arrival).
    s.fade = full
      ? Math.min(1, Math.max(0, s.fade + (present ? dt : -dt) / FADE_SECONDS))
      : present
        ? 1
        : 0;
    if (present && !s.shown) {
      s.shown = true;
      s.arrival = 0;
    }
    if (!full) s.arrival = ARRIVAL_SECONDS;
    if (!present && s.fade === 0) s.shown = false;
    if (s.fade === 0) {
      root.visible = false;
      publish(s, stage, "state", "hidden");
      return;
    }

    // Placement is recomputed only when the anchor box, viewport or field of view changed.
    const camera = state.camera as PerspectiveCamera;
    const { size } = state;
    if (
      present &&
      (anchor.version !== s.version ||
        size.width !== s.width ||
        size.height !== s.height ||
        camera.fov !== s.fov)
    ) {
      placeNex(box, size, camera.fov, s.placement);
      s.version = anchor.version;
      s.width = size.width;
      s.height = size.height;
      s.fov = camera.fov;
    }
    const { x, y, scale, onScreen } = s.placement;
    root.visible = onScreen;
    publish(s, stage, "state", "visible");
    if (!onScreen) return;

    if (full) {
      s.time += dt * NEX_PACE;
      s.arrival = Math.min(ARRIVAL_SECONDS, s.arrival + dt);
    }
    publish(s, stage, "formed", s.arrival >= ARRIVAL_SECONDS ? "true" : "false");
    frames.update(s.time);

    // Place, scale and turn NEX so its three-quarter view faces the camera from its anchor.
    root.position.set(x, y, 0);
    root.scale.setScalar(scale);
    tmp.dir.copy(camera.position).sub(root.position).normalize();
    root.quaternion.copy(tmp.facing.setFromUnitVectors(UNIT_Z, tmp.dir).multiply(tmp.view));

    const u = scene.common;
    u.uTime!.value = s.time;
    u.uArrive!.value = s.arrival / ARRIVAL_SECONDS;
    u.uFade!.value = s.fade;
    u.uScale!.value = scale;
    u.uBreath!.value = frames.breath;
    // The glow layer fades in once the arrival is complete.
    const glowFade = scene.glowPoints.uniforms.uGlowFade!;
    glowFade.value = full
      ? s.arrival >= ARRIVAL_SECONDS
        ? Math.min(1, (glowFade.value as number) + dt / FADE_SECONDS)
        : 0
      : 1;
    const glowIntensity = 0.9 + 0.2 * frames.breathPhase;
    scene.glow.uniforms.uIntensity!.value = glowIntensity;
    scene.atmosphere.uniforms.uIntensity!.value = glowIntensity;
    scene.shell.uniforms.uIntensity!.value = (0.45 + 0.15 * frames.breathPhase) * 0.8;
    scene.pointsUniforms.uProjScale.value =
      (size.height * state.viewport.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // Cursor (ADR-004): copy the shared interaction (flow map, analytic fallback or none). Under
    // reduced or off motion its mode is "none", so every pointer uniform is zeroed.
    syncInteraction(scene.flow, interaction, size.width / Math.max(1, size.height));
    publish(s, stage, "flow", interaction.mode);
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={scene.quad} material={scene.atmosphere} frustumCulled={false} />
      <lineSegments geometry={scene.lineGeometry} material={scene.lines} frustumCulled={false} />
      <points geometry={geometry} material={scene.points} frustumCulled={false} />
      {glowLayer && (
        <points geometry={glowGeometry} material={scene.glowPoints} frustumCulled={false} />
      )}
      <mesh geometry={scene.sphere} material={scene.shell} frustumCulled={false} />
      <mesh geometry={scene.quad} material={scene.glow} frustumCulled={false} />
    </group>
  );
}
