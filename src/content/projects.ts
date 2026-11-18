import type { AgentId } from "~/agents/registry";

/**
 * Project index. Truthfulness rule (DESIGN-BRIEF §10): every project carries a visible status,
 * and a project may only be "completed" if it links to public evidence; finished work without
 * public evidence yet is "unpublished" (enforced by projects.test.ts). Only add a project here once
 * its real status is confirmed.
 */
export type ProjectStatus = "completed" | "unpublished" | "in-progress" | "planned";

export interface Project {
  slug: string;
  title: string;
  agent: Exclude<AgentId, "nex">;
  status: ProjectStatus;
  summary: string;
  /** Main technologies, as the project's CV entry (or README) lists them. */
  stack?: readonly string[];
  /** Shown in the homepage's featured work, in this order; the first two most prominently. */
  featured?: boolean;
  /** What a live demo shows, when it isn't real customer data (e.g. "fictional data"). */
  demoNote?: string;
  evidence: { repo?: string; demo?: string; writeup?: string; credential?: string };
}

/**
 * Summaries follow Alex's CV (version of 17 November 2026) where it describes the project, else the
 * project's public README (github.com/Ajmoylan). Repository and demo links are public only. The
 * other projects live in projects-all.ts, so the homepage doesn't load them (initial-JS budget).
 */
/** The homepage's featured work, in order (the live demos first, CLAIMFLOW leading). */
export const featuredProjects: readonly Project[] = [
  {
    slug: "claimflow",
    title: "CLAIMFLOW",
    agent: "forge",
    status: "completed",
    summary:
      "An insurance claims management application: a claims workflow enforced by the backend (submitted, under review, approved or rejected), a REST API documented with OpenAPI, a full audit history of every status change, search and a dashboard. 130 automated tests, including SQL Server integration tests, run in CI/CD with CodeQL before each approved deployment to Azure. An independent demonstration with fictional insurance data, not affiliated with any insurer. Its free Azure database can take about 60 seconds to wake after inactivity.",
    stack: [
      "C#",
      ".NET 10",
      "ASP.NET Core",
      "EF Core",
      "Azure SQL",
      "React",
      "TypeScript",
      "Azure",
    ],
    featured: true,
    demoNote: "Independent demo with fictional insurance data",
    evidence: {
      demo: "https://claimflow-dqst3jxt3iyqy.azurewebsites.net",
      repo: "https://github.com/Ajmoylan/claimflow",
    },
  },
  {
    slug: "copilot-launchpad",
    title: "COPILOT // LAUNCHPAD",
    agent: "atlas",
    status: "completed",
    summary:
      "A GitHub Copilot partner-enablement dashboard: customer pipeline, revenue calculator, adoption tracking and a 30/60/90-day roadmap, with 42 tests, CI/CD and CodeQL.",
    stack: ["React", "TypeScript", "Vite", "GitHub Actions", "GitHub Pages"],
    featured: true,
    demoNote: "Live demo with clearly labelled fictional data",
    evidence: {
      demo: "https://ajmoylan.github.io/copilot-launchpad/",
      repo: "https://github.com/Ajmoylan/copilot-launchpad",
    },
  },
  {
    slug: "repo-posture",
    title: "Repo Posture",
    agent: "cipher",
    status: "completed",
    summary:
      "A read-only GitHub security scanner and dashboard: 13 controls, a weighted posture score and prioritised fixes. Its own repository went from 85 to 100; 35 tests at 99% coverage.",
    stack: ["Python", "JavaScript", "GitHub API", "GitHub Actions"],
    featured: true,
    demoNote: "Live dashboard of saved scan reports",
    evidence: {
      demo: "https://ajmoylan.github.io/repo-posture/",
      repo: "https://github.com/Ajmoylan/repo-posture",
    },
  },
  {
    slug: "ai-coding-agent",
    title: "AI Coding Agent",
    agent: "syn",
    status: "completed",
    summary:
      "An LLM-powered coding agent in Python that inspects files, executes code and modifies a software project, using function calling for its tools and an iterative feedback loop to work through coding tasks over several steps.",
    stack: ["Python", "OpenAI SDK", "Function calling"],
    featured: true,
    evidence: { repo: "https://github.com/Ajmoylan/ai-agent" },
  },
  {
    slug: "mri-segmentation",
    title: "Medical Image Segmentation for MRI",
    agent: "syn",
    status: "unpublished",
    summary:
      "An end-to-end PyTorch pipeline for multi-class segmentation of gastrointestinal structures in MRI scans: a ResNet18-UNet with data augmentation and class-aware losses, reaching a validation Dice score of 0.76 across 11 classes.",
    stack: ["Python", "PyTorch", "Deep learning"],
    featured: true,
    evidence: {},
  },
];

/** Case studies being prepared (none listed now: each project's own entry says where it stands). */
export const caseStudiesInPreparation: readonly string[] = [];

export const statusLabel: Record<ProjectStatus, string> = {
  completed: "Completed",
  unpublished: "Completed · not yet public",
  "in-progress": "In progress",
  planned: "Planned",
};
