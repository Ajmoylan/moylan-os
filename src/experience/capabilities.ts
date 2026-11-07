/**
 * Local capability detection and stage planning (ARCHITECTURE §9.2, §9.4, ADR-013).
 *
 * Deliberately dependency-free: no GPU benchmark databases or external requests (which would
 * break `connect-src 'self'` and leak visitor data to a third party). Initial tiers are a
 * conservative guess; the WebGL stage refines them at runtime from measured frame times.
 *
 * Imported eagerly by the root composition adapter, so it must never import Three.js.
 */

export type QualityTier = 0 | 1 | 2 | 3;
export type StageMotion = "full" | "reduced";

export interface CapabilitySignals {
  /** A WebGL2 context can be created without a major performance caveat. */
  webgl2: boolean;
  reducedMotion: boolean;
  /** Network Information API `saveData` (Chromium); undefined elsewhere. */
  saveData: boolean;
  coarsePointer: boolean;
  /** Approximate device memory in GB (Chromium only). */
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export type StageReason =
  | "save-data"
  | "no-webgl2"
  | "low-end-device"
  | "reduced-motion"
  | "touch-or-mid-range"
  | "capable";

export interface StagePlan {
  /** 0 = static fallback only: the 3D chunk is never downloaded. */
  tier: QualityTier;
  motion: StageMotion;
  reason: StageReason;
}

/** Pure policy: map device signals to a stage plan. Order matters: cheapest exits first. */
export function planStage(signals: CapabilitySignals): StagePlan {
  const motion: StageMotion = signals.reducedMotion ? "reduced" : "full";

  if (signals.saveData) return { tier: 0, motion, reason: "save-data" };
  if (!signals.webgl2) return { tier: 0, motion, reason: "no-webgl2" };

  const lowMemory = signals.deviceMemory !== undefined && signals.deviceMemory <= 2;
  const fewCores = signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 2;
  if (lowMemory || fewCores) return { tier: 1, motion, reason: "low-end-device" };
  if (signals.reducedMotion) return { tier: 1, motion, reason: "reduced-motion" };

  const midMemory = signals.deviceMemory !== undefined && signals.deviceMemory <= 4;
  if (signals.coarsePointer || midMemory) return { tier: 2, motion, reason: "touch-or-mid-range" };

  return { tier: 3, motion, reason: "capable" };
}

/**
 * Probe for WebGL2 by creating (and immediately releasing) a context. `failIfMajorPerformanceCaveat`
 * rejects software rendering, where the static experience is the better choice. Never throws.
 */
export function probeWebGL2(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/** Read capability signals from the browser. Client-only; never throws. */
export function readCapabilitySignals(win: Window = window): CapabilitySignals {
  const nav = win.navigator as Navigator & NavigatorHints;
  const media = (query: string) => {
    try {
      return win.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  return {
    webgl2: probeWebGL2(win.document),
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    saveData: nav.connection?.saveData === true,
    coarsePointer: media("(pointer: coarse)"),
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
  };
}
