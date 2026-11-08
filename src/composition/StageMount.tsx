import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import {
  planStage,
  readCapabilitySignals,
  type CapabilitySignals,
} from "~/experience/capabilities";
import { useEffectiveMotion } from "~/motion/store";
import { agentForPath } from "~/routing/agent-for-path";

/**
 * Root-level composition adapter for the WebGL stage (ARCHITECTURE §3, ADR-002).
 *
 * The only module outside src/experience/ that may reference the 3D layer (lint-enforced).
 * It decides *whether* and *when* to load the stage; routes and UI components never know it
 * exists. Loading sequence:
 *   1. Prerendered HTML paints and hydrates with no 3D code at all.
 *   2. When the browser is idle, local capability signals are read once per page load.
 *   3. The stage plan combines those signals with the effective motion mode from the motion store
 *      (ARCHITECTURE §10). It is recomputed whenever the motion mode changes, without re-probing.
 *   4. Tier 0 (motion Off, Save-Data, no WebGL2, software rendering): nothing is downloaded and the
 *      static design stays. Switching to Off later unmounts a loaded stage.
 *   5. Otherwise the stage chunk is imported. Any load or render failure, or the stage reporting
 *      that WebGL is unavailable (context lost for too long or too often), falls back to static
 *      for the rest of the visit.
 *
 * Re-renders only on route changes and effective-motion changes (one primitive store slice).
 */
const Stage = lazy(() => import("~/experience/Stage"));

class StageBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn("[MOYLAN//OS] WebGL stage disabled:", error);
    this.props.onFail();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 200);
  return () => window.clearTimeout(handle);
}

interface NetworkConnection extends EventTarget {
  saveData?: boolean;
}

export function StageMount() {
  const { pathname } = useLocation();
  const motion = useEffectiveMotion();
  const [signals, setSignals] = useState<CapabilitySignals | null>(null);
  // A stage failure disables the stage for the rest of the session (in memory only), so toggling
  // motion Off and back on never retries a stage that has already failed.
  const [failed, setFailed] = useState(false);

  // Probe the device once, when idle. With motion Off nothing is probed until the visitor turns
  // motion back on: "Off" means no 3D work at all, including creating a probe WebGL context.
  const needsSignals = signals === null && motion !== "off";
  useEffect(() => {
    if (!needsSignals) return;
    return whenIdle(() => setSignals(readCapabilitySignals()));
  }, [needsSignals]);

  // Save-Data can change during a visit. Where the browser reports it (the Network Information
  // API's `change` event, Chromium-based browsers), switching it on drops to tier 0, which
  // unmounts the stage and releases its GPU resources; switching it off allows the stage again.
  // Elsewhere it stays as sampled at initial detection.
  const probed = signals !== null;
  useEffect(() => {
    if (!probed) return;
    const connection = (navigator as Navigator & { connection?: NetworkConnection }).connection;
    if (typeof connection?.addEventListener !== "function") return;
    const onChange = () =>
      setSignals((current) => {
        const saveData = connection.saveData === true;
        return current && current.saveData !== saveData ? { ...current, saveData } : current;
      });
    connection.addEventListener("change", onChange);
    return () => connection.removeEventListener("change", onChange);
  }, [probed]);

  const markFailed = useCallback(() => setFailed(true), []);

  // Memoised so the stage receives a stable plan object between unrelated renders.
  const plan = useMemo(() => (signals ? planStage(signals, motion) : null), [signals, motion]);

  if (failed || !plan || plan.tier === 0) return null;

  return (
    <StageBoundary onFail={markFailed}>
      <Suspense fallback={null}>
        <Stage agent={agentForPath(pathname)} plan={plan} onUnavailable={markFailed} />
      </Suspense>
    </StageBoundary>
  );
}
