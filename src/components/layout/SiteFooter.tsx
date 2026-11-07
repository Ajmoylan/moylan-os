import { Link } from "react-router";
import { agents, specialists } from "~/agents/registry";
import { primaryNav, site } from "~/content/site";
import { ExternalLink } from "~/components/ui/ExternalLink";

const linkClass =
  "inline-flex min-h-11 min-w-11 items-center text-text-muted transition-colors hover:text-text";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-steel/60 bg-obsidian/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <p className="font-semibold tracking-[0.14em]">
            MOYLAN<span className="text-nex">//OS</span>
          </p>
          <p className="mt-3 max-w-xs text-sm text-text-muted">{site.tagline}</p>
          <p className="mt-6 text-xs text-text-muted">No cookies. No tracking. No analytics.</p>
        </div>

        <nav aria-label="Environments">
          <h2 className="os-label">Environments</h2>
          <ul className="mt-4 text-sm">
            {[agents.nex, ...specialists].map((agent) => (
              <li key={agent.id}>
                <Link to={agent.route} className={linkClass}>
                  {agent.id === "nex" ? "Home" : agent.domain}
                  <span className="text-text-muted/80"> · {agent.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Site">
          <h2 className="os-label">Site</h2>
          <ul className="mt-4 text-sm">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={linkClass}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/about#cv" className={linkClass}>
                CV
              </Link>
            </li>
            <li>
              <Link to="/privacy" className={linkClass}>
                Privacy
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Elsewhere">
          <h2 className="os-label">Elsewhere</h2>
          <ul className="mt-4 text-sm">
            {site.links.github && (
              <li>
                <ExternalLink href={site.links.github} className={linkClass}>
                  GitHub
                </ExternalLink>
              </li>
            )}
            {site.links.linkedin && (
              <li>
                <ExternalLink href={site.links.linkedin} className={linkClass}>
                  LinkedIn
                </ExternalLink>
              </li>
            )}
            <li>
              <Link to="/contact" className={linkClass}>
                Contact
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-steel/40">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-text-muted sm:px-6 lg:px-8">
          © {year} {site.owner}. Built with React Router, TypeScript and Tailwind CSS.
        </p>
      </div>
    </footer>
  );
}
