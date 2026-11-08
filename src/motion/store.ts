import { create } from "zustand";
import { resolveMotion, type EffectiveMotion, type MotionSetting } from "./policy";

/**
 * Motion preference store (ADR-007: low-frequency semantic state only).
 *
 * Holds the visitor's site setting, the current OS preference and the effective motion mode that
 * results from them (policy.ts). It changes only on discrete events: the visitor using the motion
 * control, or the OS preference changing. Never per frame.
 *
 * Privacy (PRIVACY-COMPLIANCE §4.3): in memory only. Nothing is written to cookies, web storage or
 * any other device storage, so a reload returns to "System".
 *
 * Readers:
 * - React components subscribe to one primitive slice through the hooks below, so they re-render
 *   only when that slice changes.
 * - The WebGL render loop (Milestone 2.2) reads `useMotionStore.getState()` without subscribing.
 */
export interface MotionState {
  setting: MotionSetting;
  systemPrefersReduced: boolean;
  effective: EffectiveMotion;
}

/**
 * Deterministic initial state, identical in the prerendered HTML and on the client, so hydration
 * never mismatches. The real OS preference is applied by `startMotionSync()` straight after.
 */
const initialMotionState: MotionState = {
  setting: "system",
  systemPrefersReduced: false,
  effective: "full",
};

export const useMotionStore = create<MotionState>()(() => initialMotionState);

function update(next: Pick<MotionState, "setting" | "systemPrefersReduced">) {
  const current = useMotionStore.getState();
  // No-op updates never notify subscribers.
  if (
    next.setting === current.setting &&
    next.systemPrefersReduced === current.systemPrefersReduced
  ) {
    return;
  }
  useMotionStore.setState({
    ...next,
    effective: resolveMotion(next.setting, next.systemPrefersReduced),
  });
}

/** Called by the motion control. Choosing "system" returns to following the OS. */
export function setMotionSetting(setting: MotionSetting): void {
  update({ ...useMotionStore.getState(), setting });
}

/** Called by the OS preference listener. */
export function setSystemPrefersReduced(systemPrefersReduced: boolean): void {
  update({ ...useMotionStore.getState(), systemPrefersReduced });
}

export const useMotionSetting = () => useMotionStore((state) => state.setting);
export const useEffectiveMotion = () => useMotionStore((state) => state.effective);
export const useSystemPrefersReduced = () => useMotionStore((state) => state.systemPrefersReduced);

/** Test-only: restore the initial state. */
export function resetMotionStore(): void {
  useMotionStore.setState(initialMotionState, true);
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Connect the store to the browser. Client-only; never throws.
 *
 * 1. Reads `prefers-reduced-motion` and follows its changes live (a `matchMedia` change listener,
 *    with the legacy `addListener` API as a fallback for older Safari).
 * 2. Mirrors the effective mode onto `<html data-motion="…">`, which the stylesheet uses so CSS
 *    transitions follow the site setting, not only the OS media query. This is a direct DOM write
 *    from a store subscription, so changing the setting doesn't re-render the React tree.
 *
 * Returns a cleanup function that removes every listener and subscription it added.
 */
export function startMotionSync(win: Window = window): () => void {
  let query: MediaQueryList | null = null;
  try {
    query = typeof win.matchMedia === "function" ? win.matchMedia(REDUCED_MOTION_QUERY) : null;
  } catch {
    query = null;
  }

  const onQueryChange = (event: { matches: boolean }) => setSystemPrefersReduced(event.matches);
  let detachQuery = () => {};
  if (query) {
    setSystemPrefersReduced(query.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onQueryChange);
      const attached = query;
      detachQuery = () => attached.removeEventListener("change", onQueryChange);
    } else if (typeof query.addListener === "function") {
      query.addListener(onQueryChange);
      const attached = query;
      detachQuery = () => attached.removeListener(onQueryChange);
    }
  }

  const root = win.document.documentElement;
  root.setAttribute("data-motion", useMotionStore.getState().effective);
  const unsubscribe = useMotionStore.subscribe((state, previous) => {
    if (state.effective !== previous.effective) root.setAttribute("data-motion", state.effective);
  });

  return () => {
    detachQuery();
    unsubscribe();
    root.removeAttribute("data-motion");
  };
}
