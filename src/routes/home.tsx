import { Fragment, lazy, Suspense, type ReactNode } from "react";
import { Link } from "react-router";
import { specialists } from "~/agents/registry";
import { NexGuide } from "~/components/nex/NexGuide";
import { NexSlot } from "~/components/nex/NexSlot";
import {
  buttonClass as button,
  ContactButtons,
  ContactDetails,
} from "~/components/ui/ContactActions";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { SmartLink, type LinkTarget } from "~/components/ui/SmartLink";
import { Container } from "~/components/ui/PageIntro";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { buildMeta } from "~/content/meta";
import { featuredProjects as featured } from "~/content/projects";
import { site } from "~/content/site";
import { LICENSED_RECORDING } from "~/content/voice";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => buildMeta({ path: "/" });

/** Wide screens: the opening keeps NEX fully in view until he docks (CSS 64rem = Tailwind's lg). */
const CONTAIN = "(min-width: 64rem)";
/**
 * Phones and tablets: the opening fills the screen, so NEX docks as soon as the visitor scrolls.
 * Riding the opening up would move him from the page's scroll position as JavaScript sees it, in
 * steps of up to 137 px while Safari collapses its toolbar (frames of 26–50 ms), against content
 * Safari scrolls smoothly (measured in iOS 26 Safari in the Simulator, 16 November 2026).
 */
const DOCK_ON_SCROLL = "(max-width: 63.99rem)";

/**
 * NEX's voice controls, only when this build has a recording: the deliberate text-only production
 * configuration ships none of their code (decided at build time; initial-JS budget).
 */
const NexVoice =
  import.meta.env.VITE_NEX_VOICE_PREVIEW || LICENSED_RECORDING
    ? lazy(() => import("~/components/nex/NexVoice").then((m) => ({ default: m.NexVoice })))
    : null;

/** Where Alex's experience comes from: his employers and his completed certification (CV). */
const CREDENTIALS = [
  { name: "Microsoft", detail: "Business Development, Indirect Channel" },
  { name: "HP", detail: "Innovation & Customer Experience Centre" },
  { name: "Meta", detail: "Market Manager, Reality Labs" },
  { name: "Azure Fundamentals", detail: "Microsoft Certified · AZ-900" },
] as const;

/** A homepage section, revealed as it scrolls in. */
function Lane({
  id,
  index,
  label,
  title,
  intro,
  children,
}: {
  id: string;
  index: string;
  label: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="os-lane scroll-mt-20 py-16 sm:py-24"
    >
      <Container>
        <div className="os-reveal min-w-0">
          <p className="os-label">
            <span className="text-nex" aria-hidden="true">
              {index}
            </span>
            {` // ${label}`}
          </p>
          <h2
            id={`${id}-title`}
            className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
          >
            {title}
          </h2>
          {intro && (
            <div className="mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">{intro}</div>
          )}
        </div>
        <div className="mt-10 min-w-0">{children}</div>
      </Container>
    </section>
  );
}

/** One of the three visitor pathways: a heading, what it covers and its direct links. */
function VisitorPathway({
  agent,
  number,
  title,
  description,
  links,
}: {
  agent: "nex" | "forge" | "syn" | "atlas" | "cipher";
  number: string;
  title: string;
  description: string;
  links: readonly ({ label: string } & LinkTarget)[];
}) {
  return (
    <article data-agent={agent} className="os-pathway os-panel flex flex-col p-6 sm:p-7">
      <p className="os-label text-(--accent)">{number}</p>
      <h3 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-text-muted">{description}</p>
      <ul className="mt-5 flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.label}>
            <SmartLink target={link} className={button.link}>
              {link.label}
            </SmartLink>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function Home() {
  const { links } = site;
  const [launchpad, posture] = featured;

  return (
    <div data-agent="nex">
      {/* Opening: Alex's introduction, with NEX (the orb) and his guide beside it. Phones: name,
          then NEX and his guide, then the rest of the introduction. */}
      <section aria-labelledby="hero-title" className="os-hero">
        <div className="os-hero-grid mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="os-hero-name">
            <p className="os-label">MOYLAN//OS · Oslo, Norway</p>
            <h1
              id="hero-title"
              className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-6xl lg:mt-3 lg:text-7xl"
            >
              {site.owner}
            </h1>
            {/* The headline's two phrases (CV: "… | …"), stacked. */}
            <p className="os-hero-headline mt-4 font-mono text-sm tracking-[0.12em] text-nex uppercase sm:text-base">
              {site.headline.split(" | ").map((part, index) => (
                <Fragment key={part}>
                  {index > 0 && <span className="sr-only">, </span>}
                  <span className="block">{part}</span>
                </Fragment>
              ))}
            </p>
          </div>

          <div className="os-hero-nex">
            <NexSlot
              id="hero"
              poster
              contain={CONTAIN}
              dockOnScroll={DOCK_ON_SCROLL}
              describedBy="nex-hint"
              className="os-hero-orb mx-auto aspect-square"
            />
            <NexGuide messageId="nex-intro">
              {NexVoice && (
                <Suspense fallback={null}>
                  <NexVoice />
                </Suspense>
              )}
            </NexGuide>
            <p id="nex-hint" className="mt-2 text-center text-xs text-text-muted">
              <span className="nex-hint-pointer">Click NEX</span>
              <span className="nex-hint-touch">Tap NEX</span> to open the site menu.
            </p>
          </div>

          <div className="os-hero-more">
            <p className="max-w-xl text-lg leading-relaxed text-text-muted">
              Technology and commercial professional with experience across Microsoft, HP and Meta,
              combining enterprise customer engagement with hands-on software engineering and
              applied AI.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#work" className={button.primary}>
                View projects
              </a>
              {links.cv && (
                <a href={links.cv} download className={button.secondary}>
                  Download CV <span className="sr-only">(PDF)</span>
                </a>
              )}
              <a href="#contact" className={button.secondary}>
                Contact
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility ---------------------------------------------------------------------------- */}
      <section
        aria-labelledby="credentials-title"
        className="border-y border-steel/60 bg-obsidian/40"
      >
        <Container>
          <h2 id="credentials-title" className="os-label pt-6 text-center">
            Experience and credentials
          </h2>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-5 py-6 sm:grid-cols-4">
            {CREDENTIALS.map((item) => (
              <li key={item.name} className="text-center">
                <p className="text-xl font-semibold tracking-tight">{item.name}</p>
                <p className="mt-1 text-xs text-text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Visitor pathways -------------------------------------------------------------------- */}
      <Lane
        id="paths"
        index="01"
        label="Start here"
        title="What brings you here?"
        intro={<p>Three direct routes. No need to know anything about the agents.</p>}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <VisitorPathway
            agent="atlas"
            number="I'm hiring"
            title="Experience and capabilities"
            description="Roles at Microsoft, HP and Meta, capabilities and how to reach Alex."
            links={[
              { label: "Experience", to: "/experience" },
              { label: "About Alex", to: "/about" },
              ...(links.cv ? [{ label: "Download CV (PDF)", href: links.cv, download: true }] : []),
              { label: "Contact", to: "/contact" },
            ]}
          />
          <VisitorPathway
            agent="forge"
            number="Show me the work"
            title="Projects and live demos"
            description="Two live dashboards, their code on GitHub, and AI projects."
            links={[
              { label: "Featured projects", href: "#work" },
              ...(launchpad?.evidence.demo
                ? [
                    {
                      label: "COPILOT // LAUNCHPAD demo",
                      href: launchpad.evidence.demo,
                      external: true,
                    },
                  ]
                : []),
              ...(posture?.evidence.demo
                ? [{ label: "Repo Posture dashboard", href: posture.evidence.demo, external: true }]
                : []),
              ...(links.github ? [{ label: "GitHub", href: links.github, external: true }] : []),
            ]}
          />
          <VisitorPathway
            agent="syn"
            number="Explore the agents"
            title="Specialist areas"
            description="Engineering, AI, advisory, and cloud and security, with more to come."
            links={[
              { label: "Meet the agents", href: "#agents" },
              { label: "All projects", to: "/projects" },
            ]}
          />
        </div>
      </Lane>

      {/* Featured work ---------------------------------------------------------------------- */}
      <Lane
        id="work"
        index="02"
        label="Featured work"
        title="Things I've built"
        intro={
          <p>
            Live demos first. Each project shows its real status, and links to its code where
            it&apos;s public.
          </p>
        }
      >
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {featured.map((project, index) => (
            <li
              key={project.slug}
              data-agent={project.agent}
              className={`os-panel flex flex-col p-6 ${index < 2 ? "os-feature sm:p-8" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3
                  className={`font-semibold tracking-tight ${index < 2 ? "text-2xl" : "text-xl"}`}
                >
                  {project.title}
                </h3>
                <StatusBadge status={project.status} />
              </div>
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
              <p className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-6 text-sm">
                {project.evidence.demo && (
                  <ExternalLink href={project.evidence.demo} className={button.primary}>
                    Open live demo
                  </ExternalLink>
                )}
                {project.evidence.repo && (
                  <ExternalLink href={project.evidence.repo} className={button.link}>
                    Code on GitHub
                  </ExternalLink>
                )}
                {!project.evidence.demo && !project.evidence.repo && (
                  <Link to="/projects" className={button.link}>
                    Details on the Projects page
                  </Link>
                )}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <Link
            to="/projects"
            className="inline-flex min-h-11 items-center text-nex underline underline-offset-4"
          >
            All projects
          </Link>
        </p>
      </Lane>

      {/* The agents ------------------------------------------------------------------------- */}
      <Lane
        id="agents"
        index="03"
        label="The agents"
        title="Explore the agents"
        intro={
          <p>
            NEX hosts four specialists, each covering one area of Alex&apos;s work. Today each is a
            page about that work; their interactive experiences are planned for a later phase.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Light cards (no icons): the homepage stays within its initial-JS budget. */}
          {specialists.map((agent) => (
            <article
              key={agent.id}
              data-agent={agent.id}
              className="os-pathway os-panel relative flex flex-col p-6"
            >
              <p className="os-label text-(--accent)">{`${agent.name} // ${agent.epithet}`}</p>
              <h3 className="mt-4 text-xl font-semibold tracking-tight">
                <Link
                  to={agent.route}
                  data-stretched-link
                  className="after:absolute after:inset-0 after:rounded-[14px]"
                >
                  {agent.domain}
                </Link>
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{agent.summary}</p>
            </article>
          ))}
        </div>
      </Lane>

      {/* Contact ---------------------------------------------------------------------------- */}
      <Lane
        id="contact"
        index="04"
        label="Contact"
        title="Let's talk"
        intro={<p>Alex is based in Oslo, Norway, and is open to new roles.</p>}
      >
        <ContactButtons />
        <ContactDetails className="mt-6 max-w-3xl" />
        <p className="mt-6 flex flex-wrap gap-x-6 text-sm">
          {links.linkedin && (
            <ExternalLink href={links.linkedin} className={button.link}>
              LinkedIn
            </ExternalLink>
          )}
          {links.github && (
            <ExternalLink href={links.github} className={button.link}>
              GitHub
            </ExternalLink>
          )}
          <Link to="/contact" className={button.link}>
            Contact page
          </Link>
        </p>
      </Lane>
    </div>
  );
}
