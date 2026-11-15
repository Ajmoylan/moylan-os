import type { AgentId } from "~/agents/registry";

/**
 * Project index. Truthfulness rule (DESIGN-BRIEF §10): every project carries a visible status,
 * and a project may only be "completed" if it links to evidence (enforced by projects.test.ts).
 * Only add a project here once its real status is confirmed.
 */
export type ProjectStatus = "completed" | "in-progress" | "planned";

export interface Project {
  slug: string;
  title: string;
  agent: Exclude<AgentId, "nex">;
  status: ProjectStatus;
  summary: string;
  /** Main technologies, as the project's own README lists them. */
  stack?: readonly string[];
  /** Shown in the homepage's featured work. */
  featured?: boolean;
  evidence: { repo?: string; demo?: string; writeup?: string; credential?: string };
}

/**
 * Summaries follow each project's public README (github.com/Ajmoylan). "Completed" means a public
 * repository shows the working features described (status to be confirmed by Alex before launch).
 */
export const projects: readonly Project[] = [
  {
    slug: "ai-communication-assistant",
    title: "AI Communication Assistant",
    agent: "syn",
    status: "completed",
    summary:
      "A full-stack AI tool that helps communication teams process unstructured text: it summarises long messages, rewrites content in a professional tone and extracts key actions and next steps.",
    stack: ["Python", "FastAPI", "OpenAI API", "JavaScript"],
    featured: true,
    evidence: { repo: "https://github.com/Ajmoylan/ai-comms-assistant" },
  },
  {
    slug: "ai-coding-agent",
    title: "AI Coding Agent",
    agent: "syn",
    status: "completed",
    summary:
      "An autonomous coding agent: the LLM chooses tools through structured tool calls (list, read and write files, run Python) and Python executes them, feeding results back in an iterative loop to diagnose and fix bugs. Built as part of the Boot.dev AI Agent project.",
    stack: ["Python", "LLM tool calling", "OpenAI-compatible APIs"],
    featured: true,
    evidence: { repo: "https://github.com/Ajmoylan/ai-agent" },
  },
  {
    slug: "skyscout",
    title: "SkyScout weather app",
    agent: "forge",
    status: "completed",
    summary:
      "A cross-platform weather app for iOS and the web from one codebase: location-aware weather, favourite cities with drag-and-drop reordering, and sound and haptic feedback.",
    stack: ["React Native", "Expo", "JavaScript", "Open-Meteo API"],
    featured: true,
    evidence: { repo: "https://github.com/Ajmoylan/skyscout-weather-app" },
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
    slug: "insurance-claims-dotnet",
    title: "Insurance claims management (C#/.NET)",
    agent: "forge",
    status: "planned",
    summary:
      "A separate, tested and deployed C#/.NET and Azure demonstration application. Not yet built; it will only be presented as finished once it works.",
    stack: ["C#", ".NET", "Azure"],
    evidence: {},
  },
];

/** Projects whose case studies are being prepared (status to be confirmed by Alex). */
export const caseStudiesInPreparation = ["Bowel MRI segmentation (university project)"] as const;

export const statusLabel: Record<ProjectStatus, string> = {
  completed: "Completed",
  "in-progress": "In progress",
  planned: "Planned",
};
