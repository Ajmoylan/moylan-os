/**
 * Alex's professional experience, for the Experience page.
 *
 * Truthfulness rule (DESIGN-BRIEF §10): organisations, role titles, places, dates and achievements
 * are as Alex's CV (version of 16 November 2026) states them, with confirmations from Alex: he was
 * employed directly by Microsoft in 2019–2022, assigned to support the distribution partner Ingram
 * Micro (he was never employed by Ingram Micro) (16 November); the role is shown as "Microsoft ·
 * SureStep", Microsoft the employer and SureStep the programme (17 November). Nothing is inferred: no
 * extra responsibilities, metrics or outcomes. `highlights` marks the CV's own emphasised figures.
 */

export interface Role {
  /** Stable id for anchors and keys. */
  id: string;
  organisation: string;
  /** The team or programme within the organisation, shown after it ("Microsoft · SureStep"). */
  unit?: string;
  title: string;
  location: string;
  /** Years as the CV gives them. */
  start: number;
  end: number;
  /** One line per CV bullet. */
  points: readonly string[];
  /** Documented figures to highlight (each must appear in `points`). */
  highlights?: readonly { value: string; label: string }[];
}

/** Most recent first. */
export const experience: readonly Role[] = [
  {
    id: "lululemon",
    organisation: "Lululemon",
    title: "Key Leader",
    location: "Oslo, Norway",
    start: 2024,
    end: 2026,
    points: [
      "Leads and coaches store teams, providing clear feedback and direction in a fast-paced environment.",
      "Oversees daily operations and guest experience, using KPIs to guide decisions and priorities.",
      "Balanced the leadership role with full-time study towards the BSc Computing and IT degree.",
    ],
  },
  {
    id: "meta",
    organisation: "Meta",
    title: "Market Manager, Reality Labs",
    location: "London, UK",
    start: 2022,
    end: 2023,
    points: [
      "Delivered technical product training and enablement across XR and consumer hardware.",
      "Explained product functionality and technical use cases to partner teams.",
      "Channelled user and partner feedback to internal teams.",
    ],
  },
  {
    id: "microsoft",
    organisation: "Microsoft",
    unit: "SureStep",
    title: "Business Development Manager, Indirect Channel",
    location: "London, UK",
    start: 2019,
    end: 2022,
    points: [
      "Supported Ingram Micro, the distribution partner Microsoft assigned to this role.",
      "Managed and supported more than 1,000 reseller partners, aligning Microsoft solutions with commercial and technical needs.",
      "Identified overlooked incentive opportunities, including £500,000 (approximately NOK 6 million) in available rebates for one reseller.",
      "Developed go-to-market plans to increase solution adoption and partner revenue.",
    ],
    highlights: [
      { value: "1,000+", label: "reseller partners managed and supported" },
      { value: "£500,000", label: "in overlooked rebates identified for one reseller" },
    ],
  },
  {
    id: "hp",
    organisation: "Hewlett-Packard",
    title: "Innovation Manager and Customer Experience Centre Lead",
    location: "London, UK",
    start: 2018,
    end: 2019,
    points: [
      "Delivered technical demonstrations and proof-of-concept sessions for enterprise customers.",
      "Translated business challenges into relevant technology solutions.",
      "Demonstrated integrated systems, including AI-accelerated workloads and XR technologies.",
    ],
  },
];

/** "2019–2022", or a single year. */
export function roleYears(role: Pick<Role, "start" | "end">): string {
  return role.start === role.end ? String(role.start) : `${role.start}–${role.end}`;
}
