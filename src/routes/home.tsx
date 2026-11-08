import { Link } from "react-router";
import { agents, specialists } from "~/agents/registry";
import { AgentTag } from "~/components/ui/AgentTag";
import { NexEmblem } from "~/components/ui/NexEmblem";
import { Container } from "~/components/ui/PageIntro";
import { PathwayCard } from "~/components/ui/PathwayCard";
import { buildMeta } from "~/content/meta";
import { site } from "~/content/site";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => buildMeta({ path: "/" });

const principles = [
  {
    title: "Prerendered and fast",
    body: "Every page is static HTML generated at build time with React Router, then hydrated. Content appears before any script runs.",
  },
  {
    title: "Accessible by default",
    body: "Semantic HTML, full keyboard support, visible focus and reduced-motion support, built to WCAG 2.2 AA and tested automatically.",
  },
  {
    title: "Secure by design",
    body: "A strict Content Security Policy, no third-party scripts and a supply chain checked against the OWASP Top 10:2025.",
  },
  {
    title: "Private by default",
    body: "No cookies, no tracking and no analytics. Fonts and assets are self-hosted, so no third-party services receive your visit.",
  },
] as const;

export default function Home() {
  const nex = agents.nex;

  return (
    <div data-agent="nex">
      {/* Hero ------------------------------------------------------------------------------ */}
      <Container>
        <section
          aria-labelledby="hero-title"
          className="grid grid-cols-1 items-center gap-12 pt-14 pb-20 sm:pt-20 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.05fr_0.95fr] lg:py-16"
        >
          <div>
            <p className="os-label">
              <span
                aria-hidden="true"
                className="mr-2 inline-block size-1.5 rounded-full bg-nex align-middle"
              />
              Personal operating system · v0.1
            </p>
            <h1
              id="hero-title"
              className="mt-6 text-display font-semibold tracking-tight sm:text-6xl lg:text-7xl"
            >
              {site.owner}
            </h1>
            <p className="mt-5 font-mono text-sm tracking-wide text-text-muted sm:text-base">
              {site.positioning}
            </p>
            <p className="mt-8 max-w-xl text-2xl leading-snug text-text-muted sm:text-3xl">
              Explore the systems. <span className="text-text">Meet the mind behind them.</span>
            </p>

            <div className="os-panel os-brackets mt-10 max-w-xl p-6">
              <AgentTag agent={nex} />
              <p className="mt-4 text-text-muted">I&apos;m NEX, the host of this system.</p>
              <p className="mt-1 text-xl text-text">{nex.introLine}</p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#explore"
                className="inline-flex min-h-11 items-center rounded-full bg-nex px-6 font-medium text-obsidian transition-colors hover:bg-text"
              >
                Choose an environment
              </a>
              <Link
                to="/projects"
                className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
              >
                View all projects
              </Link>
            </div>
          </div>

          <figure className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="os-brackets p-4 sm:p-8">
              <NexEmblem className="h-auto w-full" />
            </div>
            <figcaption className="mt-3 text-center os-label">
              NEX · static core · interactive version in development
            </figcaption>
          </figure>
        </section>
      </Container>

      {/* Pathways --------------------------------------------------------------------------- */}
      <section id="explore" aria-labelledby="explore-title" className="scroll-mt-20 py-20">
        <Container>
          <p className="os-label">// Pathways</p>
          <h2 id="explore-title" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose an environment
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-text-muted">
            Each specialist guides you through one part of Alex&apos;s work. You can also skip the
            guides and browse everything directly.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {specialists.map((agent) => (
              <PathwayCard
                key={agent.id}
                agentId={agent.id}
                label={`${agent.name} // ${agent.epithet}`}
                title={agent.domain}
                description={agent.summary}
                to={agent.route}
              />
            ))}
            <PathwayCard
              agentId="nex"
              label="NEX // All work"
              title="All projects"
              description="Every project in one index, each with an honest status: completed, in progress or planned."
              to="/projects"
              className="sm:col-span-2 lg:col-span-4"
            />
          </div>
        </Container>
      </section>

      {/* Under the hood ---------------------------------------------------------------------- */}
      <section aria-labelledby="build-title" className="py-20">
        <Container>
          <p className="os-label">// Under the hood</p>
          <h2 id="build-title" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Built as an engineering demonstration
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-text-muted">
            MOYLAN//OS is itself a piece of work: a cinematic interface built on a foundation that
            stays fast, accessible and secure even without WebGL.
          </p>
          <ul className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-steel bg-steel sm:grid-cols-2 lg:grid-cols-4">
            {principles.map((item, index) => (
              <li key={item.title} className="bg-abyss p-6">
                <p className="font-mono text-xs text-nex" aria-hidden="true">
                  0{index + 1}
                </p>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </div>
  );
}
