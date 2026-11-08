import type { ReactNode } from "react";
import type { AgentId } from "~/agents/registry";

interface PageIntroProps {
  agentId?: AgentId;
  /** System label above the heading, e.g. "MOYLAN//OS / Projects". */
  label: string;
  title: string;
  children?: ReactNode;
}

/** Standard page header used by all secondary pages. */
export function PageIntro({ agentId = "nex", label, title, children }: PageIntroProps) {
  return (
    <header data-agent={agentId} className="pt-16 pb-10 sm:pt-24">
      <p className="os-label">
        <span
          aria-hidden="true"
          className="mr-2 inline-block size-1.5 rounded-full bg-(--accent) align-middle"
        />
        {label}
      </p>
      <h1 className="mt-5 text-title font-semibold tracking-tight text-balance sm:text-5xl">
        {title}
      </h1>
      {children && (
        <div className="mt-6 max-w-2xl text-lg leading-relaxed text-text-muted">{children}</div>
      )}
    </header>
  );
}

/** Honest "in development" notice for placeholder environments and pages. */
export function DevelopmentNotice({ children }: { children: ReactNode }) {
  return (
    // Wraps the label above the text only when the text would get less than 10rem beside it
    // (enlarged text on narrow screens); unchanged at normal text sizes down to 320px.
    <div className="os-panel os-brackets flex flex-wrap gap-x-4 gap-y-2 p-5 sm:p-6" role="note">
      <span className="os-label shrink-0 pt-0.5 text-(--accent)">Status</span>
      <div className="min-w-0 flex-[1_1_10rem] text-sm leading-relaxed text-text-muted">
        {children}
      </div>
    </div>
  );
}

/** Page-width container. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}
