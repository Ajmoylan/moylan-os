import type { AgentId } from "~/agents/registry";
import { nexDefinition } from "./nex";
import type { AgentRenderDefinition, StageAgent } from "./types";

/**
 * Agents AgentCore can draw. Milestone 2.4b.1a: NEX only. Specialists are added in their own
 * milestones; an agent without a definition is not drawn by the stage (its route shows no agent).
 */
const definitions: Partial<Record<StageAgent, AgentRenderDefinition>> = { nex: nexDefinition };

export function definitionFor(id: StageAgent): AgentRenderDefinition | undefined {
  return definitions[id];
}

/**
 * Registers the diagnostic TEST definition (Milestone 2.4b.2), only ever called by the Stage after
 * lazily loading it behind the explicit `?morph=test` switch. Never used for ordinary visits.
 */
export function registerDiagnosticDefinition(definition: AgentRenderDefinition): void {
  if (definition.id !== "test") throw new Error("Only the diagnostic TEST shape may be registered");
  definitions.test = definition;
}

/**
 * The agent the stage draws for a route's agent. With the diagnostic TEST shape registered, FORGE's
 * route (`/engineering`) draws TEST, so the first morph runs on real navigation; otherwise the
 * route's own agent (FORGE has no WebGL definition yet, so NEX stays drawn and fades out).
 */
export function stageAgentFor(agent: AgentId): StageAgent {
  return agent === "forge" && definitions.test ? "test" : agent;
}
