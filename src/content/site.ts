/**
 * Site-wide content and links. Links set to `null` are not rendered.
 * Fill them in as the real details become available. Never place secrets here:
 * everything in src/ ships to the browser.
 */

export const site = {
  name: "MOYLAN//OS",
  url: "https://moylanos.dev",
  owner: "Alex Moylan",
  tagline: "Explore the systems. Meet the mind behind them.",
  positioning: "Software engineering · Applied AI · Cloud & security · Technology advisory",
  description:
    "MOYLAN//OS is the immersive, agent-guided portfolio of Alex Moylan: software engineering, applied AI, cloud security and technology advisory.",
  links: {
    /** Alex's CV (16 November 2026) and instructions. */
    github: "https://github.com/Ajmoylan" as string | null,
    linkedin: "https://www.linkedin.com/in/alex-moylan" as string | null,
    /** The public contact address (PRIVACY-COMPLIANCE.md §3, P2). Alex's backup address and phone
     * number are deliberately never published. */
    email: "alex@moylanos.dev" as string | null,
    /** Static CV PDF under public/cv/ once Alex approves a final version (not yet). */
    cv: null as string | null,
  },
} as const;

/** Primary navigation (global access, DESIGN-BRIEF §4). */
export const primaryNav = [
  { label: "Projects", to: "/projects" },
  { label: "Experience", to: "/experience" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
] as const;

/** Build a page title in the house style. */
export function pageTitle(title?: string): string {
  return title ? `${title} · ${site.name}` : `${site.owner} · ${site.name}`;
}
