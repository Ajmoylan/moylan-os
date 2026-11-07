import type { AgentDefinition } from "~/agents/registry";

/** "FORGE // THE ENGINEER" in the system voice. Inherits --accent from a [data-agent] ancestor. */
export function AgentTag({
  agent,
  className = "",
}: {
  agent: AgentDefinition;
  className?: string;
}) {
  return (
    <p className={`os-label ${className}`}>
      <span className="font-semibold text-(--accent)">{agent.name}</span>
      <span aria-hidden="true"> // </span>
      <span className="sr-only">, </span>
      {agent.epithet}
    </p>
  );
}
