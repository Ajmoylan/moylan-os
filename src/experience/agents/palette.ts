import { agents, type AgentId } from "~/agents/registry";
import type { Palette } from "../ambient/config";

/** NEX's approved WebGL-only highlight (Milestone 2.3); not a registry or CSS token. */
export const NEX_HOT = "#c9fbf5";

/**
 * An agent's WebGL palette from the registry (the single source of truth for agent colours,
 * already checked against the CSS tokens): base = secondary, accent = primary, plus the agent's
 * WebGL-only highlight.
 */
export function registryPalette(id: AgentId, hot: string): Palette {
  const { primary, secondary } = agents[id].colours;
  return { base: secondary, accent: primary, hot };
}
