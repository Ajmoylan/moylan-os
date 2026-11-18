import { describe, expect, it } from "vitest";
import { statusLabel } from "./projects";
import { projects } from "./projects-all";

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

  it("lists no upcoming project before it is built", () => {
    expect(projects.filter((p) => p.status === "planned")).toEqual([]);
  });

  it("features the five headline projects, live demos first and CLAIMFLOW leading", () => {
    expect(projects.filter((p) => p.featured).map((p) => p.slug)).toEqual([
      "claimflow",
      "copilot-launchpad",
      "repo-posture",
      "ai-coding-agent",
      "mri-segmentation",
    ]);
    for (const slug of ["copilot-launchpad", "repo-posture"]) {
      const project = projects.find((p) => p.slug === slug)!;
      expect(project.evidence.demo).toMatch(/^https:\/\/ajmoylan\.github\.io\//);
      expect(project.demoNote).toBeTruthy();
    }
  });

  it("presents CLAIMFLOW as a live, fictional-data demo with its source and stack", () => {
    const claimflow = projects.find((p) => p.slug === "claimflow")!;
    expect(claimflow.status).toBe("completed");
    expect(claimflow.evidence).toEqual({
      demo: "https://claimflow-dqst3jxt3iyqy.azurewebsites.net",
      repo: "https://github.com/Ajmoylan/claimflow",
    });
    expect(claimflow.demoNote).toMatch(/independent demo with fictional insurance data/i);
    expect(claimflow.stack).toEqual([
      "C#",
      ".NET 10",
      "ASP.NET Core",
      "EF Core",
      "Azure SQL",
      "React",
      "TypeScript",
      "Azure",
    ]);
    for (const topic of [/workflow/, /REST API/, /audit history/, /automated tests/, /CI\/CD/]) {
      expect(claimflow.summary).toMatch(topic);
    }
    expect(claimflow.summary).toMatch(/about 60 seconds to wake/);
  });

  it("never invents a link for the MRI project, whose code isn't public", () => {
    const mri = projects.find((p) => p.slug === "mri-segmentation")!;
    expect(mri.status).toBe("unpublished");
    expect(mri.evidence).toEqual({});
  });
});
