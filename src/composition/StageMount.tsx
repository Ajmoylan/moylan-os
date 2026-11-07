import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { planStage, readCapabilitySignals, type StagePlan } from "~/experience/capabilities";
import { agentForPath } from "~/routing/agent-for-path";

/**
 * Root-level composition adapter for the WebGL stage (ARCHITECTURE §3, ADR-002).
 *
 * The only module outside src/experience/ that may reference the 3D layer (lint-enforced).
 * It decides *whether* and *when* to load the stage; routes and UI components never know it
 * exists. Loading sequence:
 *   1. Prerendered HTML paints and hydrates with no 3D code at all.
 *   2. When the browser is idle, local capability signals are read and a stage plan is made.
 *   3. Tier 0 (Save-Data, no WebGL2, software rendering): nothing is downloaded; static design stays.
 *   4. Otherwise the stage chunk is imported. Any load or render failure falls back to static.
 */
const Stage = lazy(() => import("~/experience/Stage"));

class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn("[MOYLAN//OS] WebGL stage disabled:", error);
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

export function StageMount() {
  const { pathname } = useLocation();
  const [plan, setPlan] = useState<StagePlan | null>(null);

  useEffect(() => whenIdle(() => setPlan(planStage(readCapabilitySignals()))), []);

  if (!plan || plan.tier === 0) return null;

  return (
    <StageBoundary>
      <Suspense fallback={null}>
        <Stage agent={agentForPath(pathname)} plan={plan} />
      </Suspense>
    </StageBoundary>
  );
}
