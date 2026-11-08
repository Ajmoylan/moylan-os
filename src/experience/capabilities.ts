/**
 * Local capability detection and stage planning (ARCHITECTURE §9.2, §9.4, ADR-013).
 *
 * Deliberately dependency-free: no GPU benchmark databases or external requests (which would
 * break `connect-src 'self'` and leak visitor data to a third party). Initial tiers are a
 * conservative guess; the WebGL stage refines them at runtime from measured frame times.
 *
 * Motion is not a device capability: the effective motion mode comes from the motion preference
 * store (src/motion/, ARCHITECTURE §10) and is combined with these signals in `planStage()`.
 *
 * Imported eagerly by the root composition adapter, so it must never import Three.js.
 */

import type { EffectiveMotion } from "~/motion/policy";

export type QualityTier = 0 | 1 | 2 | 3;

export interface CapabilitySignals {
  /** A WebGL2 context can be created without a major performance caveat. */
  webgl2: boolean;
  /** Network Information API `saveData` (Chromium); undefined elsewhere. */
  saveData: boolean;
  coarsePointer: boolean;
  /** Approximate device memory in GB (Chromium only). */
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export type StageReason =
  | "motion-off"
  | "save-data"
  | "no-webgl2"
  | "low-end-device"
  | "reduced-motion"
  | "touch-or-mid-range"
  | "capable";

export interface StagePlan {
  /** 0 = static fallback only: the 3D chunk is never downloaded. */
  tier: QualityTier;
  motion: EffectiveMotion;
  /**
   * Whether pointer-driven effects (the ADR-004 flow map and cursor displacement) may run.
   * Only with full motion: never when motion is reduced or off (ADR-004 constraint).
   */
  pointerEffects: boolean;
  reason: StageReason;
}

const plan = (tier: QualityTier, motion: EffectiveMotion, reason: StageReason): StagePlan => ({
  tier,
  motion,
  pointerEffects: tier > 0 && motion === "full",
  reason,
});

/**
 * Pure policy: combine device signals with the effective motion mode. Order matters: cheapest
 * exits first.
 * - "off": tier 0 regardless of the device. The 3D chunk is not downloaded (or is unmounted).
 * - "reduced": at most tier 1, no pointer effects.
 * - "full": whatever the device allows. An explicit "Full" choice overrides the OS preference, but
 *   never Save-Data, missing WebGL2 or a low-end device.
 */
export function planStage(signals: CapabilitySignals, motion: EffectiveMotion): StagePlan {
  if (motion === "off") return plan(0, motion, "motion-off");
  if (signals.saveData) return plan(0, motion, "save-data");
  if (!signals.webgl2) return plan(0, motion, "no-webgl2");

  const lowMemory = signals.deviceMemory !== undefined && signals.deviceMemory <= 2;
  const fewCores = signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 2;
  if (lowMemory || fewCores) return plan(1, motion, "low-end-device");
  if (motion === "reduced") return plan(1, motion, "reduced-motion");

  const midMemory = signals.deviceMemory !== undefined && signals.deviceMemory <= 4;
  if (signals.coarsePointer || midMemory) return plan(2, motion, "touch-or-mid-range");

  return plan(3, motion, "capable");
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
    saveData: nav.connection?.saveData === true,
    coarsePointer: media("(pointer: coarse)"),
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
  };
}
