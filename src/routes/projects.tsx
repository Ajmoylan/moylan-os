import { Link } from "react-router";
import { agents } from "~/agents/registry";
import { AgentTag } from "~/components/ui/AgentTag";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { Container, PageIntro } from "~/components/ui/PageIntro";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { buildMeta } from "~/content/meta";
import { caseStudiesInPreparation } from "~/content/projects";
import { projects } from "~/content/projects-all";
import type { Route } from "./+types/projects";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "Projects",
    description:
      "Every MOYLAN//OS project, each with an honest status: completed, in progress or planned.",
    path: "/projects",
  });

export default function Projects() {
  return (
    <Container>
      <PageIntro label="MOYLAN//OS / Projects" title="Projects">
        <p>
          Every project carries a visible status. Work is only marked completed when there is public
          evidence to back it up: a repository, a live demo or a write-up. Live demos say what they
          show (for example, fictional data), and finished work whose code isn&apos;t public yet
          says so.
        </p>
      </PageIntro>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {projects.map((project) => {
          const owner = agents[project.agent];
          return (
            <li key={project.slug} data-agent={owner.id} className="os-panel flex flex-col p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <AgentTag agent={owner} />
                <StatusBadge status={project.status} />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">{project.title}</h2>
              {project.demoNote && (
                <p className="mt-2 os-label text-(--accent)">{project.demoNote}</p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{project.summary}</p>
              {project.stack && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Technologies">
                  {project.stack.map((item) => (
                    <li
                      key={item}
                      className="rounded-full bg-steel/40 px-2.5 py-0.5 font-mono text-xs text-text-muted"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-auto flex flex-wrap items-center gap-x-6 pt-6 text-sm">
                {project.evidence.demo && (
                  <ExternalLink
                    href={project.evidence.demo}
                    className="inline-flex min-h-11 items-center rounded-full bg-nex px-5 font-medium text-obsidian transition-colors hover:bg-text"
                  >
                    Open live demo
                  </ExternalLink>
                )}
                {project.evidence.repo && (
                  <ExternalLink
                    href={project.evidence.repo}
                    className="inline-flex min-h-11 items-center text-(--accent) underline underline-offset-4"
                  >
                    View the code on GitHub
                  </ExternalLink>
                )}
                <Link
                  to={owner.route}
                  className="inline-flex min-h-11 items-center text-(--accent) underline underline-offset-4"
                >
                  Explore {owner.domain} with {owner.name}
                </Link>
              </p>
            </li>
          );
        })}
      </ul>

      {caseStudiesInPreparation.length > 0 && (
        <section aria-labelledby="preparing-title" className="mt-16 max-w-3xl">
          <h2 id="preparing-title" className="os-label">
            Case studies in preparation
          </h2>
          <ul className="mt-5 space-y-3 text-text-muted">
            {caseStudiesInPreparation.map((title) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-syn" />
                <span className="min-w-0">{title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
