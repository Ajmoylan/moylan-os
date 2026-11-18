import type { AgentId } from "~/agents/registry";
import { notFoundRoute, pageRoutes, projectPathPrefix } from "./manifest";

const byPath = new Map<string, AgentId>(pageRoutes.map((route) => [route.path, route.agent]));

/**
 * Each project's owning agent, by slug. Kept apart from the project write-ups so every page's
 * initial load doesn't carry them (initial-JS budget); routing.test.ts checks it matches
 * content/projects-all.ts exactly.
 */
export const projectAgents: Readonly<Record<string, AgentId>> = {
  claimflow: "forge",
  "copilot-launchpad": "atlas",
  "repo-posture": "cipher",
  "ai-coding-agent": "syn",
  "mri-segmentation": "syn",
  "ai-communication-assistant": "syn",
  "moylan-os": "forge",
  skyscout: "forge",
};

/** Strip trailing slashes (SWA redirects them anyway) so "/about/" and "/about" agree. */
function normalise(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Resolve which agent hosts a URL. Total: every input returns an agent.
 *   1. a page in the manifest → that page's agent
 *   2. /projects/<slug> → the project's owning agent (NEX for unknown slugs)
 *   3. anything else → the 404 route's agent (NEX)
 */
export function agentForPath(pathname: string): AgentId {
  const path = normalise(pathname);
  const page = byPath.get(path);
  if (page) return page;

  if (path.startsWith(projectPathPrefix)) {
    const slug = path.slice(projectPathPrefix.length);
    if (slug && !slug.includes("/")) {
      return (
        (Object.hasOwn(projectAgents, slug) ? projectAgents[slug] : undefined) ??
        notFoundRoute.agent
      );
    }
  }

  return notFoundRoute.agent;
}
