/**
 * Alex's professional profile, for the homepage and About (launch sprint).
 *
 * Truthfulness rule (DESIGN-BRIEF §10): everything here is verified, and each entry says where it
 * comes from. Sources: Alex's public GitHub profile README (github.com/Ajmoylan), his public
 * repositories' READMEs, and the MOYLAN//OS project brief. Nothing here is inferred: if a detail
 * isn't known yet (degree classification, employers, dates), it is absent, not guessed.
 * Never place secrets or private data here: everything in src/ ships to the browser.
 */

export const profile = {
  /** GitHub profile subtitle. */
  headline: "AI-focused software developer",
  /** GitHub profile subtitle. */
  tagline: "Building real-world tools with LLMs and full-stack systems.",
  /** GitHub profile, "About Me". */
  summary:
    "Computing & IT graduate from The Open University, focused on building practical, user-centred software and AI-powered applications.",
  /** GitHub profile, "About Me". */
  focus:
    "Particularly interested in AI engineering, backend systems, intelligent applications and production-focused software: turning AI capabilities into useful, reliable real-world products.",
  /** GitHub profile, "About Me". */
  education: { subject: "Computing & IT", institution: "The Open University", status: "Graduate" },
  /** Project brief (CIPHER: "Microsoft Azure Fundamentals achievement"). No credential link yet. */
  certifications: [
    {
      name: "Microsoft Azure Fundamentals",
      code: "AZ-900",
      issuer: "Microsoft",
      url: null as string | null,
    },
  ],
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
