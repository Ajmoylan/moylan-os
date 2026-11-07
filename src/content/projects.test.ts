import { describe, expect, it } from "vitest";
import { projects } from "./projects";

describe("projects content (truthfulness rule)", () => {
  it("has unique slugs", () => {
    expect(new Set(projects.map((p) => p.slug)).size).toBe(projects.length);
  });

  it("only marks a project completed when it links to evidence", () => {
    for (const project of projects.filter((p) => p.status === "completed")) {
      const evidence = Object.values(project.evidence).filter(Boolean);
      expect(evidence, `${project.slug} is completed without evidence`).not.toHaveLength(0);
    }
  });

  it("uses https for every evidence link", () => {
    for (const project of projects) {
      for (const url of Object.values(project.evidence)) {
        if (url) expect(url).toMatch(/^https:\/\//);
      }
    }
  });
});
