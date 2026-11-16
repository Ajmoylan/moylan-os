/**
 * Details shown only on the About page (kept out of profile.ts, which the homepage loads).
 *
 * Truthfulness rule (DESIGN-BRIEF §10): sources as in profile.ts: Alex's CV (version of
 * 16 November 2026, "CV") and details Alex supplied for this page ("Alex"). Nothing is inferred.
 */

/** CV (Oslo, Norway); citizenship and eligibility: Alex. Norway is part of the EEA. */
export const facts = {
  location: "Oslo, Norway",
  citizenship: "British and Irish",
  workEligibility: "UK and EU/EEA (no sponsorship needed in Norway)",
} as const;

/** CV, Education (relevant study and background), by institution. */
export const educationDetail: Record<string, string> = {
  "The Open University":
    "Algorithms, data structures and computability; object-oriented programming in Java; web technologies; machine learning and artificial intelligence; software engineering.",
  "Plymouth University":
    "Sports science, performance and outdoor and extreme sports, with extensive coaching experience: leadership, communication and working with people in challenging environments.",
};

/** CV, Core Competencies. */
export const competencies = [
  {
    name: "Customer engagement",
    detail:
      "Executive presentations, technical demonstrations, stakeholder management and consultative communication.",
  },
  {
    name: "Business development",
    detail:
      "Partner relationships, commercial opportunity identification, go-to-market planning and technology adoption.",
  },
  {
    name: "Technology advisory",
    detail:
      "Customer requirements, technical solution evaluation, business use cases and communicating technology value.",
  },
  {
    name: "Applied AI",
    detail:
      "LLM applications, agentic workflows, API integrations, machine learning and AI prototyping.",
  },
] as const;

/** Alex: away from the keyboard. Secondary to the professional story, and brief. */
export const beyondTheCode = [
  "Hiking and the outdoors",
  "Formula 1",
  "Arsenal",
  "Gaming",
  "Rex, his small dog",
] as const;
