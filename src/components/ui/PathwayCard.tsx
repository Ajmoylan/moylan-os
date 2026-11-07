import { Link } from "react-router";
import type { AgentId } from "~/agents/registry";
import { AgentIcon } from "./AgentIcon";

interface PathwayCardProps {
  agentId: AgentId;
  /** Small system label, e.g. "FORGE // The Engineer". */
  label: string;
  title: string;
  description: string;
  to: string;
  className?: string;
}

/**
 * A pathway from NEX to an environment. The whole card is clickable through a stretched link,
 * while the accessible name stays the concise title. Accent colour comes from data-agent.
 */
export function PathwayCard({
  agentId,
  label,
  title,
  description,
  to,
  className = "",
}: PathwayCardProps) {
  return (
    <article
      data-agent={agentId}
      className={`os-pathway os-panel relative flex flex-col p-6 ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="os-label">{label}</p>
        <AgentIcon id={agentId} className="size-6 shrink-0 text-(--accent)" />
      </div>
      <h3 className="mt-6 text-xl font-semibold tracking-tight">
        <Link
          to={to}
          data-stretched-link
          className="after:absolute after:inset-0 after:rounded-[14px]"
        >
          {title}
        </Link>
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">{description}</p>
      <p className="mt-auto pt-6 os-label text-(--accent)" aria-hidden="true">
        Enter <span className="os-arrow inline-block">→</span>
      </p>
    </article>
  );
}
