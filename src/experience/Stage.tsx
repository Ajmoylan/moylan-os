import type { AgentId } from "~/agents/registry";
import type { StagePlan } from "./capabilities";

export interface StageProps {
  /** Agent hosting the current URL (from the route manifest). */
  agent: AgentId;
  plan: StagePlan;
}

/**
 * Placeholder for the persistent WebGL stage (Milestone 2).
 *
 * This module is the lazy-loaded 3D entry point: it is only reachable through the dynamic import
 * in src/composition/StageMount.tsx, so Three.js and React Three Fiber (added in Milestone 2)
 * will live in this chunk and never in the initial application bundle. It currently renders an
 * empty, decorative layer so the loading pipeline, capability gating, motion policy and budgets
 * can be tested. Its data attributes are the contract the Milestone 2.2 renderer must honour:
 * pointer-driven effects only when `plan.pointerEffects` is true.
 */
export default function Stage({ agent, plan }: StageProps) {
  return (
    <div
      className="os-stage"
      aria-hidden="true"
      data-agent={agent}
      data-stage-tier={plan.tier}
      data-stage-motion={plan.motion}
      data-stage-pointer={plan.pointerEffects ? "on" : "off"}
    />
  );
}
