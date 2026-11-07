import { Link } from "react-router";
import { agents, specialists } from "~/agents/registry";
import { Container } from "~/components/ui/PageIntro";
import { pageTitle } from "~/content/site";
import type { Route } from "./+types/not-found";

export const meta: Route.MetaFunction = () => [
  { title: pageTitle("Page not found") },
  { name: "robots", content: "noindex" },
];

/**
 * Catch-all route. Prerendered as /404.html and served by Azure Static Web Apps with a
 * real 404 status for unknown URLs (see config/staticwebapp.config.base.json).
 */
export default function NotFound() {
  return (
    <Container className="py-24 sm:py-32">
      <div data-agent="nex" className="max-w-2xl">
        <p className="os-label">Error 404 · Route not found</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Page not found</h1>
        <p className="mt-6 text-lg text-text-muted">
          NEX couldn&apos;t find that address in MOYLAN//OS. It may have moved, or it may not exist
          yet.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex min-h-11 items-center rounded-full bg-nex px-6 font-medium text-obsidian transition-colors hover:bg-text"
        >
          Return to {agents.nex.name}
        </Link>
        <nav aria-label="Environments" className="mt-12">
          <p className="os-label">Or choose an environment</p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {specialists.map((agent) => (
              <li key={agent.id} data-agent={agent.id}>
                <Link
                  to={agent.route}
                  className="inline-flex min-h-11 items-center text-(--accent) underline underline-offset-4"
                >
                  {agent.domain}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Container>
  );
}
