/**
 * Alex's professional profile, for the homepage and About.
 *
 * Truthfulness rule (DESIGN-BRIEF §10): everything here is verified, and each entry says where it
 * comes from. Sources: Alex's CV (version of 16 November 2026, "CV"), his public GitHub profile
 * README (github.com/Ajmoylan, "GitHub"), and details Alex supplied for the About page ("Alex").
 * Nothing here is inferred: if a detail isn't known yet, it is absent, not guessed. Details shown
 * only on About live in about.ts, so the homepage doesn't load them.
 * Never place secrets or private data here (no phone number, no private email): everything in
 * src/ ships to the browser.
 */

export type CredentialStatus = "completed" | "in-preparation";

export interface Education {
  degree: string;
  institution: string;
  years: string;
  /** Exactly as the CV states it; a predicted result stays labelled "predicted" until awarded. */
  status: string;
}

export interface Certification {
  name: string;
  code: string;
  issuer: string;
  status: CredentialStatus;
  /** "Completed 2026", "Preparation in progress". */
  statusLabel: string;
  /** A public verification link, once Alex provides one. */
  url: string | null;
}

export const profile = {
  /** GitHub profile subtitle (the homepage headline; unchanged). */
  headline: "AI-focused software developer",
  /** GitHub profile subtitle. */
  tagline: "Building real-world tools with LLMs and full-stack systems.",
  /** CV, Profile. */
  summary:
    "Technology and commercial professional with experience across HP, the Microsoft partner ecosystem and Meta, combining enterprise customer engagement, technical presentations and business development with hands-on applied AI.",
  /** GitHub profile, "About Me". */
  focus:
    "Particularly interested in AI engineering, backend systems, intelligent applications and production-focused software: turning AI capabilities into useful, reliable real-world products.",
  /** CV, Education. */
  education: [
    {
      degree: "BSc (Hons) Computing and IT (Software)",
      institution: "The Open University",
      years: "2023–2026",
      status: "Degree requirements completed · First-Class Honours predicted",
    },
    {
      degree: "BSc (Hons) Applied Marine Sports Science",
      institution: "Plymouth University",
      years: "2008–2012",
      status: "Completed",
    },
  ] satisfies readonly Education[],
  /** CV, Certifications & Professional Development. No verification links yet. */
  certifications: [
    {
      name: "Microsoft Azure Fundamentals",
      code: "AZ-900",
      issuer: "Microsoft",
      status: "completed",
      statusLabel: "Completed 2026",
      url: null,
    },
    {
      name: "Microsoft Certified: AI Transformation Leader",
      code: "AB-731",
      issuer: "Microsoft",
      status: "in-preparation",
      statusLabel: "Preparation in progress",
      url: null,
    },
  ] satisfies readonly Certification[],
  /** Project brief (ATLAS): the professional strengths Alex brings from enterprise technology work. */
  strengths: [
    "Enterprise technology experience",
    "Stakeholder engagement",
    "Customer experience",
    "Solution design",
    "Commercial impact",
  ],
  /** GitHub profile, "Tech Stack". */
  skills: [
    { group: "Languages", items: ["Python", "TypeScript", "JavaScript", "Java", "SQL"] },
    {
      group: "Frameworks",
      items: ["FastAPI", "Django", "React", "React Native (Expo)", "Node.js", "REST APIs"],
    },
    {
      group: "AI / ML",
      items: [
        "PyTorch",
        "CNNs and U-Net",
        "LLM integration",
        "RAG and embeddings",
        "Tool calling and agentic AI",
        "Hugging Face",
      ],
    },
    { group: "Data", items: ["PostgreSQL", "SQLite", "Supabase"] },
  ],
} as const;
