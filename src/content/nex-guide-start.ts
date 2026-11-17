/**
 * NEX's guide (Phase 1): the opening of a short, hand-written script. NEX offers choices and each
 * choice leads to another scripted step or a page. There is no AI and no network call: the same
 * choice always gives the same answer. The rest of the script (nex-guide.ts) loads on first use.
 */

import type { LinkTarget } from "~/components/ui/SmartLink";

export type GuideNodeId = "start" | "hiring" | "work" | "agents" | "contact";

export type GuideChoice =
  /** Another step of the script. */
  | { label: string; next: GuideNodeId }
  /** A page of this site, an external page, a download, or a tel:/mailto: action. */
  | ({ label: string; next?: never } & LinkTarget);

export interface GuideNode {
  id: GuideNodeId;
  message: string;
  choices: readonly GuideChoice[];
}

/** NEX's greeting: in the prerendered page, so it's there before any JavaScript runs. */
export const GUIDE_START: GuideNode = {
  id: "start",
  message:
    "Hello. I'm NEX, Alex Moylan's guide to MOYLAN//OS. Tell me what you're looking for and I'll take you straight there.",
  choices: [
    { label: "I'm hiring", next: "hiring" },
    { label: "Show me the work", next: "work" },
    { label: "Explore the agents", next: "agents" },
    { label: "How do I contact Alex?", next: "contact" },
  ],
};
