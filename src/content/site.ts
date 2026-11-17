/**
 * Site-wide content and links. Links set to `null` are not rendered.
 * Fill them in as the real details become available. Never place secrets here:
 * everything in src/ ships to the browser.
 */

export const site = {
  name: "MOYLAN//OS",
  url: "https://moylanos.dev",
  owner: "Alex Moylan",
  /** Alex's CV headline: his professional positioning (homepage hero, About). */
  headline: "AI Technology Advisory | Applied AI & Enterprise Solutions",
  tagline: "Explore the systems. Meet the mind behind them.",
  positioning: "Software engineering · Applied AI · Cloud & security · Technology advisory",
  description:
    "MOYLAN//OS is the immersive, agent-guided portfolio of Alex Moylan: software engineering, applied AI, cloud security and technology advisory.",
  links: {
    /** Alex's CV and instructions (17 November 2026). */
    github: "https://github.com/Ajmoylan" as string | null,
    linkedin: "https://www.linkedin.com/in/alex-moylan" as string | null,
    /** The public contact address (PRIVACY-COMPLIANCE.md §3, P2). Alex's backup address is
     * deliberately never published. */
    email: "alex@moylanos.dev" as string | null,
    /** Published at Alex's request (17 November 2026), as on his CV. */
    phone: { display: "+47 489 01 849", href: "tel:+4748901849" } as {
      display: string;
      href: string;
    } | null,
    /** The CV Alex approved for publication (PDF made from his CV of 17 November 2026). */
    cv: "/cv/Alex_Moylan_CV.pdf" as string | null,
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
