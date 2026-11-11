import type { AgentId } from "~/agents/registry";
import { nexDefinition } from "./nex";
import type { AgentRenderDefinition } from "./types";

/**
 * Agents AgentCore can draw. Milestone 2.4b.1a: NEX only. Specialists are added in their own
 * milestones; an agent without a definition is not drawn by the stage (its route shows no agent).
 */
const definitions: Partial<Record<AgentId, AgentRenderDefinition>> = { nex: nexDefinition };

export function definitionFor(id: AgentId): AgentRenderDefinition | undefined {
  return definitions[id];
}
