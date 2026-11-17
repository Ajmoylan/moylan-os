/**
 * The rest of NEX's scripted guide (loaded on the visitor's first choice; see nex-guide-start.ts).
 * Every statement is about Alex's real, published work: keep it consistent with the content files.
 */
import { site } from "./site";
import type { GuideChoice, GuideNode, GuideNodeId } from "./nex-guide-start";

const restart: GuideChoice = { label: "Start over", next: "start" };
const cv: GuideChoice[] = site.links.cv
  ? [{ label: "Download CV", href: site.links.cv, download: true }]
  : [];

/** Every step after the greeting ("start" is GUIDE_START, which ships with the page). */
export const GUIDE: Record<Exclude<GuideNodeId, "start">, GuideNode> = {
  about: {
    id: "about",
    message:
      "Alex worked in enterprise technology at HP, Microsoft (SureStep) and Meta: customer demonstrations, partner and reseller enablement, and technical training. He now builds AI agents and applications, and completed his BSc (Hons) Computing and IT (Software) in 2026.",
    choices: [
      { label: "Meet Alex", to: "/about" },
      { label: "My experience", to: "/experience" },
      ...cv,
      { label: "Show me the work", next: "work" },
      restart,
    ],
  },
  hiring: {
    id: "hiring",
    message:
      "Alex combines enterprise technology experience at Microsoft (SureStep), HP and Meta with hands-on software engineering and applied AI. Start with his experience, take his CV, or see what he has built.",
    choices: [
      { label: "View experience", to: "/experience" },
      ...cv,
      { label: "Show me the work", next: "work" },
      { label: "Contact Alex", next: "contact" },
      restart,
    ],
  },
  work: {
    id: "work",
    message:
      "Start with the two live demos: COPILOT // LAUNCHPAD, a GitHub Copilot partner-enablement dashboard, and Repo Posture, a GitHub security posture scanner. Both are open source, with tests and CI.",
    choices: [
      {
        label: "Open COPILOT // LAUNCHPAD",
        href: "https://ajmoylan.github.io/copilot-launchpad/",
        external: true,
      },
      {
        label: "Open Repo Posture",
        href: "https://ajmoylan.github.io/repo-posture/",
        external: true,
      },
      { label: "All projects", to: "/projects" },
      ...(site.links.github
        ? [{ label: "GitHub profile", href: site.links.github, external: true }]
        : []),
      restart,
    ],
  },
  agents: {
    id: "agents",
    message:
      "MOYLAN//OS has four specialist areas: FORGE for engineering, SYN for AI and machine learning, ATLAS for technology advisory and CIPHER for cloud and security. Today each is a page about Alex's work in that field; their interactive experiences are still to come.",
    choices: [
      { label: "FORGE · Engineering", to: "/engineering" },
      { label: "SYN · AI & ML", to: "/ai" },
      { label: "ATLAS · Advisory", to: "/advisory" },
      { label: "CIPHER · Cloud & Security", to: "/cloud-security" },
      restart,
    ],
  },
  contact: {
    id: "contact",
    message:
      "Alex is based in Oslo, Norway, and is open to new roles. You can call him, email him or use the contact page.",
    choices: [
      ...(site.links.phone
        ? [{ label: `Call ${site.links.phone.display}`, href: site.links.phone.href }]
        : []),
      ...(site.links.email ? [{ label: "Email Alex", href: `mailto:${site.links.email}` }] : []),
      { label: "Contact page", to: "/contact" },
      ...cv,
      restart,
    ],
  },
};
