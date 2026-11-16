import { describe, expect, it } from "vitest";
import { projects, statusLabel } from "./projects";

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

  it("finished work without public evidence says so, and links to nothing", () => {
    for (const project of projects.filter((p) => p.status === "unpublished")) {
      const evidence = Object.values(project.evidence).filter(Boolean);
      expect(evidence, `${project.slug} has evidence: mark it completed`).toHaveLength(0);
    }
    expect(statusLabel.unpublished).toMatch(/not yet public/);
  });

  it("uses https for every evidence link", () => {
    for (const project of projects) {
      for (const url of Object.values(project.evidence)) {
        if (url) expect(url).toMatch(/^https:\/\//);
      }
    }
  });

  it("lists no upcoming project before it is built (COPILOT // LAUNCHPAD, insurance claims)", () => {
    expect(projects.filter((p) => p.status === "planned")).toEqual([]);
    expect(projects.map((p) => p.title).join(" ")).not.toMatch(/launchpad|insurance/i);
  });
});
