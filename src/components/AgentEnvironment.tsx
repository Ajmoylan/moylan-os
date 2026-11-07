import { Link } from "react-router";
import { agents, specialists, type AgentDefinition } from "~/agents/registry";
import { AgentIcon } from "~/components/ui/AgentIcon";
import { AgentTag } from "~/components/ui/AgentTag";
import { Container, DevelopmentNotice } from "~/components/ui/PageIntro";
import { PathwayCard } from "~/components/ui/PathwayCard";
import { StatusBadge } from "~/components/ui/StatusBadge";

/**
 * Placeholder environment for a specialist agent (Milestone 1).
 * The full environment (agent form, morph transition and real content) arrives in later milestones;
 * this page already carries the agent's identity, approved intro line and content outline.
 */
export function AgentEnvironment({ agent }: { agent: AgentDefinition }) {
  const others = specialists.filter((other) => other.id !== agent.id);

  return (
    <div data-agent={agent.id}>
      <Container>
        <section
          aria-labelledby="environment-title"
          className="grid gap-12 pt-16 pb-12 sm:pt-24 lg:grid-cols-[1.3fr_0.7fr] lg:items-end"
        >
          <div>
            <p className="os-label">
              <Link to="/" className="inline-flex min-h-11 items-center hover:text-text">
                MOYLAN//OS
              </Link>
              <span aria-hidden="true"> / </span>
              <span className="text-(--accent)">{agent.name}</span>
            </p>
            <h1
              id="environment-title"
              className="mt-6 text-5xl font-semibold tracking-tight text-balance sm:text-6xl"
            >
              {agent.domain}
            </h1>
            <AgentTag agent={agent} className="mt-5" />
            <figure className="mt-10 border-l-2 border-(--accent) pl-6">
              <blockquote className="text-2xl leading-snug text-text sm:text-3xl">
                <p>“{agent.introLine}”</p>
              </blockquote>
              <figcaption className="mt-3 os-label">{agent.name}</figcaption>
            </figure>
          </div>
          <div className="os-panel os-brackets hidden aspect-square items-center justify-center lg:flex">
            <AgentIcon id={agent.id} className="size-28 text-(--accent) opacity-80" />
          </div>
        </section>

        <p className="max-w-2xl text-lg leading-relaxed text-text-muted">{agent.summary}</p>

        <div className="mt-10 max-w-3xl">
          <DevelopmentNotice>
            <p>
              <strong className="font-medium text-text">This environment is in development.</strong>{" "}
              {agent.name}&apos;s interactive form, transitions and full case studies arrive in a
              later milestone. Below is what you&apos;ll find here.
            </p>
          </DevelopmentNotice>
        </div>

        <section aria-labelledby="contents-title" className="mt-16">
          <h2 id="contents-title" className="os-label">
            In this environment
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {agent.contents.map((item) => (
              <li
                key={item.label}
                className="os-panel flex items-start justify-between gap-4 px-5 py-4"
              >
                <span className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-(--accent)"
                  />
                  {item.label}
                </span>
                {item.planned && <StatusBadge status="planned" />}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="other-title" className="mt-20">
          <h2 id="other-title" className="os-label">
            Other environments
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((other) => (
              <PathwayCard
                key={other.id}
                agentId={other.id}
                label={`${other.name} // ${other.epithet}`}
                title={other.domain}
                description={other.introLine}
                to={other.route}
              />
            ))}
            <PathwayCard
              agentId="nex"
              label={`${agents.nex.name} // ${agents.nex.epithet}`}
              title="Return to NEX"
              description="Back to the MOYLAN//OS home."
              to="/"
            />
          </div>
        </section>
      </Container>
    </div>
  );
}
