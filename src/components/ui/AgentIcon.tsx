import type { ReactNode } from "react";
import type { AgentId } from "~/agents/registry";

/** Single-weight line icons (DESIGN-BRIEF §2), decorative only. */
const paths: Record<AgentId, ReactNode> = {
  nex: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <ellipse cx="12" cy="12" rx="9" ry="4" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
    </>
  ),
  forge: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  syn: (
    <>
      <circle cx="5" cy="6" r="1.8" />
      <circle cx="19" cy="6" r="1.8" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="5" cy="18" r="1.8" />
      <circle cx="19" cy="18" r="1.8" />
      <path d="M6.6 7l3.7 3.6M17.4 7l-3.7 3.6M6.6 17l3.7-3.6M17.4 17l-3.7-3.6M5 7.8v8.4" />
    </>
  ),
  atlas: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <ellipse cx="12" cy="12" rx="3.8" ry="8.5" />
      <path d="M3.5 12h17M5 7.5h14M5 16.5h14" />
    </>
  ),
  cipher: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6L12 3z" />
      <path d="M8.8 12.2l2.2 2.2 4.4-4.6" />
    </>
  ),
};

export function AgentIcon({ id, className = "" }: { id: AgentId; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {paths[id]}
    </svg>
  );
}
