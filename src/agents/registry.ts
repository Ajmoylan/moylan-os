/**
 * Agent registry: the single source of truth for every MOYLAN//OS agent.
 * Used by the DOM layer now, and by the WebGL layer from Milestone 2 onward.
 * Colours must match the @theme tokens in src/styles/app.css (enforced by registry.test.ts).
 * Which agent hosts which URL is defined by the route manifest (src/routing/manifest.ts);
 * each agent's `route` here is its home environment and is checked against that manifest.
 * See docs/AGENT-PROFILES.md.
 */

import type { AppPath } from "~/routing/manifest";

export type AgentId = "nex" | "forge" | "syn" | "atlas" | "cipher";

export interface AgentDefinition {
  id: AgentId;
  /** Display name, e.g. "FORGE". */
  name: string;
  /** Epithet shown as `// THE ENGINEER`. */
  epithet: string;
  /** Domain label used in navigation, e.g. "Engineering". */
  domain: string;
  /** The agent's home environment (must be hosted by this agent in the route manifest). */
  route: AppPath;
  colours: { primary: `#${string}`; secondary: `#${string}` };
  /** Approved introduction line, first person (AGENT-PROFILES voice rule). */
  introLine: string;
  /** One-sentence summary of what the agent covers, third person about Alex. */
  summary: string;
  /** What visitors will find in this environment (from the approved content ownership). */
  contents: { label: string; planned?: boolean }[];
  /** Accessible text equivalent of the agent's visual form. */
  visualDescription: string;
}

export const agents = {
  nex: {
    id: "nex",
    name: "NEX",
    epithet: "Primary Intelligence",
    domain: "Home",
    route: "/",
    colours: { primary: "#3FE0D0", secondary: "#14A89C" },
    introLine: "Welcome to MOYLAN//OS. What would you like to explore?",
    summary:
      "The host of MOYLAN//OS, guiding you to Alex Moylan's work in engineering, AI, advisory and cloud security.",
    contents: [
      { label: "Guided navigation across every environment" },
      { label: "Featured work and all projects" },
      { label: "About, CV and contact" },
    ],
    visualDescription:
      "NEX, the MOYLAN//OS host: a glowing cyan sphere of orbiting light filaments.",
  },
  forge: {
    id: "forge",
    name: "FORGE",
    epithet: "The Engineer",
    domain: "Engineering",
    route: "/engineering",
    colours: { primary: "#FFB347", secondary: "#FF7A1A" },
    introLine: "Let me show you how the systems are built.",
    summary:
      "Software engineering: the systems Alex builds with C#/.NET, Python, React, TypeScript and APIs, and the architecture behind them.",
    contents: [
      { label: "Project gallery and engineering case studies" },
      { label: "Technical walkthroughs, API and architecture diagrams" },
      { label: "GitHub repositories and working demos" },
      { label: "C#/.NET insurance-claims management application", planned: true },
    ],
    visualDescription:
      "FORGE, the engineering guide: an amber crystal of interlocking wireframe shards.",
  },
  syn: {
    id: "syn",
    name: "SYN",
    epithet: "The AI Specialist",
    domain: "AI & Machine Learning",
    route: "/ai",
    colours: { primary: "#B98CFF", secondary: "#E05CFF" },
    introLine: "Explore how ideas become intelligent systems.",
    summary:
      "Applied AI and machine learning: Alex's medical-imaging research, AI assistants, methodology and honest evaluation.",
    contents: [
      { label: "Bowel MRI segmentation (university project)" },
      { label: "AI Communications Assistant" },
      { label: "Machine-learning methods, evaluation metrics and limitations" },
    ],
    visualDescription: "SYN, the AI guide: a violet sphere of connected, pulsing neural nodes.",
  },
  atlas: {
    id: "atlas",
    name: "ATLAS",
    epithet: "The Strategist",
    domain: "Technology Advisory",
    route: "/advisory",
    colours: { primary: "#5CB8FF", secondary: "#2F7BFF" },
    introLine: "Great technology matters when it solves a real problem.",
    summary:
      "Technology advisory: how Alex connects technology to people, strategy and measurable business outcomes.",
    contents: [
      { label: "Enterprise technology experience" },
      { label: "Stakeholder engagement and customer experience" },
      { label: "Solution design and commercial impact" },
    ],
    visualDescription:
      "ATLAS, the advisory guide: a blue wireframe globe circled by orbital rings and network arcs.",
  },
  cipher: {
    id: "cipher",
    name: "CIPHER",
    epithet: "The Security Specialist",
    domain: "Cloud & Security",
    route: "/cloud-security",
    colours: { primary: "#3DDC97", secondary: "#13A86B" },
    introLine: "Let us look at the systems that keep everything connected and protected.",
    summary:
      "Cloud and security: Alex's Microsoft Azure foundations, cloud architecture knowledge and security principles, with learning in progress clearly labelled.",
    contents: [
      { label: "Microsoft Azure Fundamentals (AZ-900)" },
      { label: "Cloud architecture, identity and authentication" },
      { label: "Security principles in practice" },
      { label: "Future cyber-security studies and projects", planned: true },
    ],
    visualDescription:
      "CIPHER, the cloud and security guide: an emerald shield made of a glowing hexagonal mesh.",
  },
} as const satisfies Record<AgentId, AgentDefinition>;

export const agentList: readonly AgentDefinition[] = Object.values(agents);

/** The four specialists, in the order NEX presents them. */
export const specialists: readonly AgentDefinition[] = [
  agents.forge,
  agents.syn,
  agents.atlas,
  agents.cipher,
];
