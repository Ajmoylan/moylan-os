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
  /** Shown in the homepage's featured work. */
  featured?: boolean;
  evidence: { repo?: string; demo?: string; writeup?: string; credential?: string };
}

/**
 * Summaries follow Alex's CV (version of 16 November 2026) where it describes the project, else the
 * project's public README (github.com/Ajmoylan). Repository links are the public repositories only.
 * COPILOT // LAUNCHPAD and the insurance claims application are not listed until they are built.
 */
export const projects: readonly Project[] = [
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
  {
    slug: "ai-communication-assistant",
    title: "AI Communication Assistant",
    agent: "syn",
    status: "completed",
    summary:
      "A tested full-stack application that uses LLM APIs for communication workflows: summarisation, rewriting and action extraction, with prompt engineering, a FastAPI backend and external AI services integrated end to end.",
    stack: ["Python", "FastAPI", "OpenAI API"],
    featured: true,
    evidence: { repo: "https://github.com/Ajmoylan/ai-comms-assistant" },
  },
  {
    slug: "moylan-os",
    title: "MOYLAN//OS",
    agent: "forge",
    status: "in-progress",
    summary:
      "This website: a prerendered React Router application with a persistent Three.js WebGL stage, a GPU particle host and a strict, accessible, privacy-first foundation.",
    stack: ["TypeScript", "React", "Three.js", "WebGL"],
    featured: true,
    evidence: { repo: "https://github.com/Ajmoylan/moylan-os" },
  },
  {
    slug: "skyscout",
    title: "SkyScout weather app",
    agent: "forge",
    status: "completed",
    summary:
      "A cross-platform weather app for iOS and the web from one codebase: location-aware weather, favourite cities with drag-and-drop reordering, and sound and haptic feedback.",
    stack: ["React Native", "Expo", "JavaScript", "Open-Meteo API"],
    evidence: { repo: "https://github.com/Ajmoylan/skyscout-weather-app" },
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
