import { Link } from "react-router";
import { agents } from "~/agents/registry";
import { AgentTag } from "~/components/ui/AgentTag";
import { Container, PageIntro } from "~/components/ui/PageIntro";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { buildMeta } from "~/content/meta";
import { caseStudiesInPreparation, projects } from "~/content/projects";
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
          Every project carries a visible status. Work is only marked completed when there is
          evidence to back it up: a repository, a live demo or a write-up.
        </p>
      </PageIntro>

      <ul className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => {
          const owner = agents[project.agent];
          return (
            <li key={project.slug} data-agent={owner.id} className="os-panel flex flex-col p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <AgentTag agent={owner} />
                <StatusBadge status={project.status} />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">{project.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{project.summary}</p>
              <p className="mt-auto pt-6 text-sm">
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

      <section aria-labelledby="preparing-title" className="mt-16 max-w-3xl">
        <h2 id="preparing-title" className="os-label">
          Case studies in preparation
        </h2>
        <ul className="mt-5 space-y-3 text-text-muted">
          {caseStudiesInPreparation.map((title) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-syn" />
              {title}
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
