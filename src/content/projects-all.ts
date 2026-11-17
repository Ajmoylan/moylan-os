import { featuredProjects, type Project } from "./projects";

/**
 * Every project: the featured ones (projects.ts, loaded by the homepage) and the rest, which only the
 * Projects page and the stage's routing need. Same truthfulness rule (projects.test.ts).
 */
const moreProjects: readonly Project[] = [
  {
    slug: "ai-communication-assistant",
    title: "AI Communication Assistant",
    agent: "syn",
    status: "completed",
    summary:
      "A tested full-stack application that uses LLM APIs for communication workflows: summarisation, rewriting and action extraction, with prompt engineering, a FastAPI backend and external AI services integrated end to end.",
    stack: ["Python", "FastAPI", "OpenAI API"],
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

export const projects: readonly Project[] = [...featuredProjects, ...moreProjects];
