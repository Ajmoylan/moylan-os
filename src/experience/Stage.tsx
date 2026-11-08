import { Canvas, type RootState } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AgentId } from "~/agents/registry";
import { AmbientField } from "./ambient/AmbientField";
import { ambientLook, settingsForTier } from "./ambient/config";
import type { StagePlan } from "./capabilities";
import { createInteraction } from "./flow/interaction";
import { NexAvatar } from "./nex/NexAvatar";
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

export interface StageProps {
  /** Agent hosting the current URL (from the route manifest). */
  agent: AgentId;
  plan: StagePlan;
  /** Current route path: stage layers that follow page anchors (NEX) re-read them on change. */
  path?: string;
  /**
   * The WebGL stage can't continue this visit (context lost for too long or too often). The
   * composition root then records tier 0 for the session and the static design remains.
   */
  onUnavailable?: () => void;
}

/** Context-loss policy (ARCHITECTURE §9.4). */
export const RESTORE_TIMEOUT_MS = 3000;
export const MAX_CONTEXT_LOSSES = 2;

/** One perspective camera for the 3D agents (the ambient field draws in screen space). */
const CAMERA = {
  fov: NEX_PARAMS.fov,
  near: 0.1,
  far: 40,
  position: [0, 0, CAMERA_DISTANCE] as [number, number, number],
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
 * The persistent WebGL stage (ADR-002): one R3F canvas behind the semantic DOM.
 *
 * Lazy-loaded through src/composition/StageMount.tsx only, so Three.js and React Three Fiber live
 * in this chunk and never in the initial application bundle. Decorative only: `aria-hidden`,
 * `pointer-events: none`; pointer input is read from `window` when allowed.
 *
 * Lifecycle (`data-stage-state`): starting → running (full motion) | static (reduced motion:
 * one still frame) | paused (tab hidden: no frames) | lost (WebGL context lost: canvas faded
 * out, no frames). The canvas fades in after its first frame, so the static design is never
 * replaced by an empty or half-initialised canvas.
 *
 * Adaptive quality (performance/quality.ts): the frame monitor's reductions are held here as
 * low-frequency state and the Canvas `dpr` is derived from them, so re-renders, tier changes and
 * context restores keep the adapted quality. It resets only when the stage unmounts (motion Off,
 * Save-Data), and is then re-learned from the tier defaults.
 */
export default function Stage({ agent, plan, path = "/", onUnavailable }: StageProps) {
  const settings = settingsForTier(plan.tier);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * The one cursor-interaction substrate (ADR-004): written by the ambient field (the only pointer
   * listener and flow simulation), sampled by every layer. A stable mutable object (ADR-007).
   */
  const [interaction] = useState(() => createInteraction(ambientLook.cursor.radius));
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
  // Remounts the scene after a context restore so every GPU resource is rebuilt.
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

  // Context loss and restoration. Three.js itself calls preventDefault() on loss so the browser
  // may restore the context; here the canvas fades out at once (no frozen frame), and if it is
  // not restored within RESTORE_TIMEOUT_MS, or is lost more than MAX_CONTEXT_LOSSES times, the
  // stage gives up for this visit.
  const detachContextListeners = useRef<() => void>(() => {});
  const onCreated = useCallback(({ gl }: RootState) => {
    gl.setClearColor(0x000000, 0);
    const canvas = gl.domElement;
    let losses = 0;
    let timer = 0;
    const onLost = (event: Event) => {
      event.preventDefault();
      losses += 1;
      setLifecycle("lost");
      window.clearTimeout(timer);
      if (losses > MAX_CONTEXT_LOSSES) {
        unavailable.current?.();
        return;
      }
      timer = window.setTimeout(() => unavailable.current?.(), RESTORE_TIMEOUT_MS);
    };
    const onRestored = () => {
      window.clearTimeout(timer);
      setGeneration((value) => value + 1);
      setLifecycle("starting");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    detachContextListeners.current = () => {
      window.clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);
  useEffect(() => () => detachContextListeners.current(), []);

  const onFirstFrame = useCallback(() => setLifecycle("running"), []);

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
  const frameloop =
    hidden || lifecycle === "lost" ? "never" : plan.motion === "full" ? "always" : "demand";

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
    >
      <Canvas
        // Events are sourced from this pointer-events: none layer, so R3F never intercepts input.
        eventSource={rootRef}
        // The adapted range: R3F re-applies it on every render and display change.
        dpr={dpr}
        frameloop={frameloop}
        gl={GL_OPTIONS}
        camera={CAMERA}
        flat
        linear
        onCreated={onCreated}
      >
        <AmbientField
          key={generation}
          settings={settings}
          particleShare={quality.particleShare}
          onQualityStep={onQualityStep}
          motion={plan.motion}
          pointerEffects={plan.pointerEffects}
          statsRef={rootRef}
          onFirstFrame={onFirstFrame}
          interaction={interaction}
        />
        <NexAvatar
          key={`nex-${generation}`}
          particles={settings.nex.particles}
          particleShare={quality.particleShare}
          glowLayer={settings.nex.glowLayer}
          motion={plan.motion}
          interaction={interaction}
          statsRef={rootRef}
          path={path}
        />
      </Canvas>
    </div>
  );
}
