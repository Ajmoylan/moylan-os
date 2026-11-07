import { describe, expect, it } from "vitest";
import routes from "~/routes";
import { agents } from "~/agents/registry";
import { projects } from "~/content/projects";
import { agentForPath } from "./agent-for-path";
import { notFoundRoute, pageRoutes } from "./manifest";

describe("route manifest", () => {
  it("has unique paths and files", () => {
    expect(new Set(pageRoutes.map((r) => r.path)).size).toBe(pageRoutes.length);
    expect(new Set(pageRoutes.map((r) => r.file)).size).toBe(pageRoutes.length);
  });

  it("generates the React Router config: every page plus the catch-all", () => {
    expect(routes).toHaveLength(pageRoutes.length + 1);
    const configured = routes.map((r) => (r.index ? "/" : `/${r.path}`));
    expect(configured).toEqual([...pageRoutes.map((r) => r.path), `/${notFoundRoute.path}`]);
    expect(routes.at(-1)?.file).toBe(notFoundRoute.file);
  });

  it("assigns each specialist exactly one home environment", () => {
    for (const id of ["forge", "syn", "atlas", "cipher"] as const) {
      expect(pageRoutes.filter((r) => r.path === agents[id].route)).toHaveLength(1);
    }
  });
});

describe("agentForPath", () => {
  it.each(pageRoutes.map((r) => [r.path, r.agent] as const))("%s → %s", (path, agent) => {
    expect(agentForPath(path)).toBe(agent);
  });

  it("ignores trailing slashes", () => {
    expect(agentForPath("/engineering/")).toBe("forge");
    expect(agentForPath("/ai///")).toBe("syn");
    expect(agentForPath("")).toBe("nex");
  });

  it("routes unknown URLs to the 404 host (NEX)", () => {
    expect(agentForPath("/does-not-exist")).toBe("nex");
    expect(agentForPath("/engineering/deeper")).toBe("nex");
  });

  it("routes project case studies to the project's owning agent", () => {
    for (const project of projects) {
      expect(agentForPath(`/projects/${project.slug}`)).toBe(project.agent);
    }
    expect(agentForPath("/projects/insurance-claims-dotnet")).toBe("forge");
  });

  it("falls back to NEX for unknown or malformed project paths", () => {
    expect(agentForPath("/projects/unknown-slug")).toBe("nex");
    expect(agentForPath("/projects/moylan-os/extra")).toBe("nex");
  });
});
