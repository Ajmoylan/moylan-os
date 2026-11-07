import type { AgentId } from "~/agents/registry";

/**
 * Route manifest: the single authoritative source for which pages exist and which agent hosts
 * each one (ARCHITECTURE §4, ADR-012).
 *
 * - `src/routes.ts` builds React Router's route config from this list.
 * - `agentForPath()` resolves any URL (including unknown URLs and project slugs) to an agent.
 * - The registry's `route` field for each agent is type-checked against these paths.
 *
 * This module must stay free of runtime imports: React Router's build tooling evaluates it.
 */

export interface PageRoute {
  /** URL path without a trailing slash ("/" for the home page). */
  path: `/${string}`;
  /** Route module, relative to src/. */
  file: `routes/${string}.tsx`;
  /** Agent hosting this page; drives the WebGL stage and accent colour. */
  agent: AgentId;
}

export const pageRoutes = [
  { path: "/", file: "routes/home.tsx", agent: "nex" },
  { path: "/engineering", file: "routes/engineering.tsx", agent: "forge" },
  { path: "/ai", file: "routes/ai.tsx", agent: "syn" },
  { path: "/advisory", file: "routes/advisory.tsx", agent: "atlas" },
  { path: "/cloud-security", file: "routes/cloud-security.tsx", agent: "cipher" },
  { path: "/projects", file: "routes/projects.tsx", agent: "nex" },
  { path: "/experience", file: "routes/experience.tsx", agent: "atlas" },
  { path: "/about", file: "routes/about.tsx", agent: "nex" },
  { path: "/contact", file: "routes/contact.tsx", agent: "nex" },
  { path: "/privacy", file: "routes/privacy.tsx", agent: "nex" },
] as const satisfies readonly PageRoute[];

export type AppPath = (typeof pageRoutes)[number]["path"];

/** Catch-all for unknown URLs: prerendered as /404.html, hosted by NEX. */
export const notFoundRoute = {
  path: "*",
  file: "routes/not-found.tsx",
  agent: "nex",
} as const satisfies Omit<PageRoute, "path"> & { path: "*" };

/**
 * Future project case-study pages (`/projects/:slug`, Phase 4). Their agent comes from the
 * project's own `agent` field in src/content/projects.ts, so adding a project (including the
 * C#/.NET application) never requires a routing change.
 */
export const projectPathPrefix = "/projects/";
