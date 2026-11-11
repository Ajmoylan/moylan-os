import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { AgentId } from "~/agents/registry";
import { AmbientField } from "./ambient/AmbientField";
import { ambientLook, settingsForTier } from "./ambient/config";
import type { StagePlan } from "./capabilities";
import { AgentCore } from "./core/AgentCore";
import { ShapeCache } from "./core/shapeCache";
import { Engine, type CameraOptions, type FrameLoop } from "./engine/Engine";
import { forgetValidatedFormat } from "./flow/FlowField";
import { FlowSimulation } from "./flow/FlowSimulation";
import { createInteraction, type StageInteraction } from "./flow/interaction";
import { NEX_PARAMS } from "./nex/params";
import { CAMERA_DISTANCE } from "./nex/placement";
import {
  FULL_QUALITY,
  dprRange,
  lowerOf,
  pixelLimitedDpr,
  resolveDprCap,
  type Quality,
} from "./performance/quality";
import { createTransition, type StageTransition } from "./transition/StageTransition";
import { TransitionClock } from "./transition/TransitionClock";

export interface StageProps {
  /** Agent hosting the current URL (from the route manifest). */
  agent: AgentId;
  plan: StagePlan;
  /** Current route path: stage layers that follow page anchors (NEX) re-read them on change. */
  path?: string;
  /**
   * The WebGL stage can't continue this visit: no renderer context, a fatal frame or setup error,
   * or the context was lost for too long or too often. The composition root then records tier 0
   * for the session and the static design remains.
   */
  onUnavailable?: () => void;
}

/** Context-loss policy (ARCHITECTURE §9.4). */
export const RESTORE_TIMEOUT_MS = 3000;
export const MAX_CONTEXT_LOSSES = 2;

/** One perspective camera for the 3D agents (the ambient field draws in screen space). */
const CAMERA: CameraOptions = {
  fov: NEX_PARAMS.fov,
  near: 0.1,
  far: 40,
  position: [0, 0, CAMERA_DISTANCE],
};

const GL_OPTIONS = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: "default",
  // Software rendering is a worse experience than the static design (matches the probe).
  failIfMajorPerformanceCaveat: true,
  preserveDrawingBuffer: false,
} as const;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

type LifecycleState = "starting" | "running" | "lost";

/**
 * The stage's layers. The engine runs them in phase order (simulate: flow, transition clock;
 * update: ambient field, AgentCore), and within a phase in the order they are added.
 */
export interface StageLayers {
  flow: FlowSimulation;
  clock: TransitionClock;
  ambient: AmbientField;
  core: AgentCore;
}

/** Stage-lifetime state shared by the layers (ADR-007): it survives context restores. */
export interface StageShared {
  stage: HTMLElement;
  interaction: StageInteraction;
  transition: StageTransition;
  shapes: ShapeCache;
  onQualityStep: (next: Quality) => void;
}

/**
 * Creates the layers, then adds them to the engine. Transactional: if a constructor throws, the
 * layers already created are disposed before the error propagates, and the engine never sees a
 * partial set.
 */
export function createLayers(engine: Engine, shared: StageShared): StageLayers {
  const { stage, interaction, transition, shapes, onQualityStep } = shared;
  const created: { dispose(): void }[] = [];
  try {
    const flow = new FlowSimulation(engine, { stage, interaction });
    created.push(flow);
    const clock = new TransitionClock(engine, { transition });
    created.push(clock);
    const ambient = new AmbientField(engine, { stage, interaction, onQualityStep });
    created.push(ambient);
    const core = new AgentCore(engine, { stage, interaction, transition, shapes });
    created.push(core);
    for (const layer of [flow, clock, ambient, core]) engine.add(layer);
    return { flow, clock, ambient, core };
  } catch (error) {
    for (const layer of created.reverse()) {
      try {
        layer.dispose();
      } catch {
        // The construction error is the one to report.
      }
    }
    throw error;
  }
}

function disposeLayers(engine: Engine, layers: StageLayers): void {
  for (const layer of [layers.core, layers.ambient, layers.clock, layers.flow]) {
    engine.remove(layer);
    layer.dispose();
  }
}

/**
 * The persistent WebGL stage (ADR-002 as amended in Milestone 2.4a): one canvas, owned by a small
 * framework-free Three.js engine (engine/Engine.ts), behind the semantic DOM.
 *
 * This component is a thin React wrapper. It owns the policy (lifecycle state, adaptive quality,
 * motion, context-loss limits, the failure fallback) and forwards discrete props to the engine's
 * layers in effects; nothing here runs per frame (ADR-007).
 *
 * Lazy-loaded through src/composition/StageMount.tsx only, so Three.js lives in this chunk and
 * never in the initial application bundle. Decorative only: `aria-hidden`, `pointer-events: none`;
 * pointer input is read from `window` when allowed.
 *
 * Lifecycle (`data-stage-state`): starting → running (full motion) | static (reduced motion:
 * one still frame) | paused (tab hidden: no frames) | lost (WebGL context lost: canvas faded
 * out, no frames). The canvas fades in after its first frame, so the static design is never
 * replaced by an empty or half-initialised canvas.
 *
 * Failure policy: the renderer or engine failing to initialise, a layer failing to construct or
 * to apply its props (also when rebuilding after a context restore), or a frame throwing, all go
 * through `fail()`: the engine and its layers are disposed at once (no further frames; every GPU
 * resource, listener and the canvas released), and `onUnavailable` is called exactly once, so the
 * composition root keeps the static design for the rest of the visit.
 *
 * Adaptive quality (performance/quality.ts): the frame monitor's reductions are held here as
 * low-frequency state and the engine's DPR range is derived from them, so re-renders, tier changes
 * and context restores keep the adapted quality. It resets only when the stage unmounts (motion
 * Off, Save-Data), and is then re-learned from the tier defaults.
 */
export default function Stage({ agent, plan, path = "/", onUnavailable }: StageProps) {
  const settings = settingsForTier(plan.tier);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * The one cursor-interaction substrate (ADR-004): written by the flow simulation (the only
   * pointer listener and flow map), read by every layer. A stable mutable object (ADR-007).
   */
  const [interaction] = useState(() => createInteraction(ambientLook.cursor.radius));
  /** The shared transition frame (ADR-007): written by the transition clock, read by agents. */
  const [transition] = useState(() => createTransition("nex"));
  /** Generated agent shapes, kept for the stage's lifetime (a context restore reuses them). */
  const [shapes] = useState(() => new ShapeCache());
  const [lifecycle, setLifecycle] = useState<LifecycleState>("starting");
  const [quality, setQuality] = useState<Quality>(FULL_QUALITY);
  const onQualityStep = useCallback((next: Quality) => setQuality((q) => lowerOf(q, next)), []);
  // Backing-pixel limit: the stage fills the viewport. Floored to coarse steps, so resizing a
  // window re-renders only when the limit actually moves.
  const pixelLimit = useSyncExternalStore(
    subscribeResize,
    () => pixelLimitedDpr(window.innerWidth, window.innerHeight, settings.maxPixels),
    () => settings.dprCap,
  );
  const dprCap = resolveDprCap(settings.dprCap, quality, pixelLimit);
  const dpr = useMemo(() => dprRange(dprCap), [dprCap]);
  // Rebuilds the layers after a context restore so every GPU resource is recreated.
  const [generation, setGeneration] = useState(0);
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );

  const unavailable = useRef(onUnavailable);
  useEffect(() => {
    unavailable.current = onUnavailable;
  }, [onUnavailable]);

  const engineRef = useRef<Engine | null>(null);
  const layersRef = useRef<StageLayers | null>(null);
  /** Releases the current engine (and with it the layers and the canvas); idempotent. */
  const teardown = useRef<() => void>(() => {});
  /** Releases the current layers (not the engine); idempotent. */
  const releaseLayers = useRef<() => void>(() => {});
  const failed = useRef(false);

  /** The single failure path: stop and release everything, then report once. */
  const fail = useCallback((error: unknown) => {
    if (failed.current) return;
    failed.current = true;
    try {
      teardown.current();
    } finally {
      if (import.meta.env.DEV) console.warn("[MOYLAN//OS] WebGL stage disabled:", error);
      unavailable.current?.();
    }
  }, []);

  // The engine lives as long as this component. Context loss and restoration: Three.js itself
  // calls preventDefault() on loss so the browser may restore the context; here the canvas fades
  // out at once (no frozen frame), and if it is not restored within RESTORE_TIMEOUT_MS, or is lost
  // more than MAX_CONTEXT_LOSSES times, the stage gives up for this visit. The layers' GPU objects
  // are released at the moment of loss: WebGL calls are silent no-ops on a lost context, whereas
  // deleting them after a restore would target the new context (INVALID_OPERATION, reported as
  // console errors by WebKit). New layers are built on restore. Each engine creates its own canvas,
  // so a released context is never reused (React StrictMode replays this effect in development).
  useLayoutEffect(() => {
    const root = rootRef.current!;
    failed.current = false;
    let losses = 0;
    let timer = 0;
    let engine: Engine;
    try {
      engine = new Engine({
        container: root,
        gl: GL_OPTIONS,
        camera: CAMERA,
        onFirstFrame: () => setLifecycle("running"),
        onFatal: (error) => fail(error),
        onContextLost: (event) => {
          event.preventDefault();
          releaseLayers.current();
          losses += 1;
          setLifecycle("lost");
          window.clearTimeout(timer);
          if (losses > MAX_CONTEXT_LOSSES) {
            unavailable.current?.();
            return;
          }
          timer = window.setTimeout(() => unavailable.current?.(), RESTORE_TIMEOUT_MS);
        },
        onContextRestored: () => {
          window.clearTimeout(timer);
          // The restored context validates its flow-map format again before the rebuilt layers
          // use it (it may run on another GPU or driver).
          const restored = engineRef.current;
          if (restored) forgetValidatedFormat(restored.renderer);
          setGeneration((value) => value + 1);
          setLifecycle("starting");
        },
      });
    } catch (error) {
      // No WebGL context for the renderer (after a successful capability probe), or a setup step
      // failed: the engine has already released what it acquired, canvas included.
      fail(error);
      return;
    }
    engineRef.current = engine;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      window.clearTimeout(timer);
      layersRef.current = null;
      engineRef.current = null;
      engine.dispose();
    };
    teardown.current = release;
    return () => {
      teardown.current = () => {};
      release();
    };
  }, [fail]);

  // The layers, rebuilt with new GPU resources after each context restore (the old ones were
  // released when the context was lost).
  useLayoutEffect(() => {
    const engine = engineRef.current;
    const stage = rootRef.current;
    if (!engine || !stage) return;
    let layers: StageLayers;
    try {
      layers = createLayers(engine, { stage, interaction, transition, shapes, onQualityStep });
    } catch (error) {
      fail(error);
      return;
    }
    layersRef.current = layers;
    // Runs once: at context loss, or at cleanup (unmount, restore rebuild), whichever comes first.
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (layersRef.current === layers) layersRef.current = null;
      disposeLayers(engine, layers);
    };
    releaseLayers.current = release;
    return () => {
      if (releaseLayers.current === release) releaseLayers.current = () => {};
      release();
    };
  }, [generation, interaction, transition, shapes, onQualityStep, fail]);

  const status =
    lifecycle === "lost"
      ? "lost"
      : hidden
        ? "paused"
        : lifecycle === "starting"
          ? "starting"
          : plan.motion === "full"
            ? "running"
            : "static";
  // Full motion animates continuously; reduced motion renders on demand (resize, changes) only.
  const frameloop: FrameLoop =
    hidden || lifecycle === "lost" ? "never" : plan.motion === "full" ? "always" : "demand";

  // Discrete props, forwarded after every commit. Each layer applies only what changed and says
  // so; the engine is then invalidated once (the single on-demand path). Declared after the layer
  // effect, so new layers receive their props before their first frame. The loop mode and pixel
  // ratio are applied even while there are no layers (a lost context: the loop must stop).
  useLayoutEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const layers = layersRef.current;
      let changed = false;
      if (layers) {
        const flowChanged = layers.flow.setProps({
          pointerEffects: plan.pointerEffects,
          flowSize: settings.flowSize,
        });
        const ambientChanged = layers.ambient.setProps({
          settings,
          particleShare: quality.particleShare,
          motion: plan.motion,
        });
        const clockChanged = layers.clock.setProps({ agent });
        const coreChanged = layers.core.setProps({
          particles: settings.nex.particles,
          particleShare: quality.particleShare,
          glowLayer: settings.nex.glowLayer,
          motion: plan.motion,
          path,
        });
        changed = flowChanged || ambientChanged || clockChanged || coreChanged;
      }
      // The adapted range (display and zoom changes are followed inside the engine).
      engine.setDpr(dpr);
      engine.setLoop(frameloop);
      if (changed) engine.invalidate();
    } catch (error) {
      fail(error);
    }
  });

  return (
    <div
      ref={rootRef}
      className="os-stage"
      aria-hidden="true"
      data-agent={agent}
      data-stage-tier={plan.tier}
      data-stage-motion={plan.motion}
      data-stage-pointer={plan.pointerEffects ? "on" : "off"}
      data-stage-state={status}
    />
  );
}
