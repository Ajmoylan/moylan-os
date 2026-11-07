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
  evidence: { repo?: string; demo?: string; writeup?: string; credential?: string };
}

export const projects: readonly Project[] = [
  {
    slug: "moylan-os",
    title: "MOYLAN//OS",
    agent: "forge",
    status: "in-progress",
    summary:
      "This website: a prerendered React Router application with an accessible, security-hardened static foundation and a WebGL agent system in development.",
    evidence: {},
  },
  {
    slug: "insurance-claims-dotnet",
    title: "Insurance claims management (C#/.NET)",
    agent: "forge",
    status: "planned",
    summary:
      "A separate, tested and deployed C#/.NET demonstration application. Not yet built; it will only be presented as finished once it works.",
    evidence: {},
  },
];

/** Projects whose case studies are being prepared (status to be confirmed by Alex). */
export const caseStudiesInPreparation = [
  "Bowel MRI segmentation (university project)",
  "AI Communications Assistant",
] as const;

export const statusLabel: Record<ProjectStatus, string> = {
  completed: "Completed",
  "in-progress": "In progress",
  planned: "Planned",
};
