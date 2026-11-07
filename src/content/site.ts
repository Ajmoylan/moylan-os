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
    /** Inferred from this repository's remote. Confirm before launch. */
    github: "https://github.com/Ajmoylan" as string | null,
    linkedin: null as string | null,
    /** Public contact address, to be decided (see PRIVACY-COMPLIANCE.md §3, P2). */
    email: null as string | null,
    /** Static CV PDF under public/cv/ once approved. */
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
