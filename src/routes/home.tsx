import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "react-router";
import { specialists } from "~/agents/registry";
import { NexSlot } from "~/components/nex/NexSlot";
import { NexTransmission } from "~/components/nex/NexTransmission";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { Container } from "~/components/ui/PageIntro";
import { PathwayCard } from "~/components/ui/PathwayCard";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { buildMeta } from "~/content/meta";
import { profile } from "~/content/profile";
import { caseStudiesInPreparation, projects } from "~/content/projects";
import { site } from "~/content/site";
import { NEX_INTRO, voice } from "~/content/voice";
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
 * configuration ships none of their code.
 */
const NexVoice =
  voice.mode === "audio"
    ? lazy(() => import("~/components/nex/NexVoice").then((m) => ({ default: m.NexVoice })))
    : null;

const featured = projects.filter((project) => project.featured);

/**
 * A homepage section: full width (NEX accompanies the visitor from the companion dock, so no lane
 * is reserved for him), revealed as it scrolls in.
 */
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
      className="os-lane scroll-mt-20 py-20 sm:py-28"
    >
      <Container>
        <div>
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
          </div>
          <div className="os-reveal min-w-0">
            {intro && (
              <div className="mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">{intro}</div>
            )}
            <div className="mt-10">{children}</div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default function Home() {
  const { links } = site;

  return (
    <div data-agent="nex">
      {/* Opening: NEX introduces MOYLAN//OS (launch sprint). A full-screen, minimal first view
          over the stage's ambient field; the portfolio reveals itself as the visitor scrolls. */}
      <section
        aria-labelledby="hero-title"
        className="relative flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center px-4 py-6 text-center sm:py-10"
      >
        <h1 id="hero-title" className="os-label">
          <span className="text-text">{site.owner}</span>
          <span aria-hidden="true"> · </span>
          <span>{profile.headline}</span>
        </h1>
        {/* NEX at the centre, full size, until the visitor scrolls on and he docks (the static
            emblem, which keeps NEX's text equivalent, fades out while he is drawn here);
            activating NEX opens his navigation panel. */}
        <NexSlot
          id="hero"
          poster
          contain={CONTAIN}
          dockOnScroll={DOCK_ON_SCROLL}
          describedBy="nex-hint"
          className="my-4 aspect-square w-[min(68vw,30svh,26rem)] sm:my-6"
        />
        <NexTransmission id="nex-intro" message={NEX_INTRO}>
          {NexVoice && (
            <Suspense fallback={null}>
              <NexVoice />
            </Suspense>
          )}
        </NexTransmission>
        {/* One compact row: how to use NEX (his button's description) and the way on. */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 text-sm text-text-muted">
          <p id="nex-hint">
            <span className="nex-hint-pointer">Click NEX</span>
            <span className="nex-hint-touch">Tap NEX</span> to navigate.
          </p>
          <a
            href="#intro"
            className="nex-scroll-cue inline-flex min-h-11 items-center gap-2 hover:text-text"
          >
            Scroll to explore
            <span aria-hidden="true" className="nex-scroll-arrow text-nex">
              ↓
            </span>
          </a>
        </div>
      </section>

      {/* Introduction: the first content the scroll reveals. */}
      <Lane
        id="intro"
        index="00"
        label="Introduction"
        title="Explore the systems. Meet the mind behind them."
        intro={
          <>
            <p className="font-mono text-base text-nex">{profile.headline}</p>
            <p className="mt-2">{profile.tagline}</p>
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          <a
            href="#work"
            className="inline-flex min-h-11 items-center rounded-full bg-nex px-6 font-medium text-obsidian transition-colors hover:bg-text"
          >
            See featured work
          </a>
          <Link
            to="/contact"
            className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
          >
            Get in touch
          </Link>
          {links.github && (
            <ExternalLink
              href={links.github}
              className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
            >
              GitHub
            </ExternalLink>
          )}
        </div>
      </Lane>

      {/* Profile --------------------------------------------------------------------------- */}
      <Lane
        id="profile"
        index="01"
        label="Profile"
        title="Practical software, powered by AI"
        intro={
          <>
            <p>{profile.summary}</p>
            <p className="mt-4">{profile.focus}</p>
          </>
        }
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {profile.skills.map((skill) => (
            <div key={skill.group}>
              <dt className="os-label">{skill.group}</dt>
              <dd className="mt-3">
                <ul className="flex flex-wrap gap-2">
                  {skill.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-steel px-3 py-1 text-sm text-text-muted"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </Lane>

      {/* Featured work ---------------------------------------------------------------------- */}
      <Lane
        id="work"
        index="02"
        label="Featured work"
        title="Things I've built"
        intro={
          <p>
            Each project carries an honest status, and links straight to its code where it&apos;s
            public. The case studies grow as the projects do.
          </p>
        }
      >
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {featured.map((project) => (
            <li
              key={project.slug}
              data-agent={project.agent}
              className="os-panel flex flex-col p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-semibold tracking-tight">{project.title}</h3>
                <StatusBadge status={project.status} />
              </div>
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
              {project.evidence.repo && (
                <p className="mt-auto pt-5 text-sm">
                  <ExternalLink
                    href={project.evidence.repo}
                    className="inline-flex min-h-11 items-center text-(--accent) underline underline-offset-4"
                  >
                    View the code on GitHub
                  </ExternalLink>
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-text-muted">
          <Link
            to="/projects"
            className="inline-flex min-h-11 items-center text-nex underline underline-offset-4"
          >
            All projects
          </Link>
          {caseStudiesInPreparation.length > 0 && (
            <p>Case study in preparation: {caseStudiesInPreparation.join(", ")}.</p>
          )}
        </div>
      </Lane>

      {/* Career highlights ------------------------------------------------------------------ */}
      <Lane
        id="highlights"
        index="03"
        label="Career highlights"
        title="Education, credentials and experience"
      >
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {profile.education.map((education) => (
            <li key={education.degree} className="os-panel p-6">
              <p className="os-label">Education</p>
              <p className="mt-3 text-lg font-medium">{education.degree}</p>
              <p className="mt-1 text-text-muted">
                {education.institution} · {education.years}
              </p>
              <p className="mt-1 text-sm text-text-muted">{education.status}</p>
            </li>
          ))}
          {profile.certifications.map((certification) => (
            <li key={certification.code} className="os-panel p-6">
              <p className="os-label">Certification</p>
              <p className="mt-3 text-lg font-medium">{certification.name}</p>
              <p className="mt-1 text-text-muted">
                {certification.issuer} · {certification.code}
              </p>
              <p className="mt-1 text-sm text-text-muted">{certification.statusLabel}</p>
            </li>
          ))}
          <li className="os-panel p-6 sm:col-span-2">
            <p className="os-label">Professional strengths</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {profile.strengths.map((strength) => (
                <li
                  key={strength}
                  className="rounded-full border border-steel px-3 py-1 text-sm text-text-muted"
                >
                  {strength}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link
                to="/experience"
                className="inline-flex min-h-11 items-center text-nex underline underline-offset-4"
              >
                Experience
              </Link>
            </p>
          </li>
        </ul>
      </Lane>

      {/* Pathways --------------------------------------------------------------------------- */}
      <Lane
        id="explore"
        index="04"
        label="Pathways"
        title="Choose an environment"
        intro={<p>Go deeper into one part of my work, or browse every project directly.</p>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {specialists.map((agent) => (
            <PathwayCard
              key={agent.id}
              agentId={agent.id}
              label={agent.epithet}
              title={agent.domain}
              description={agent.summary}
              to={agent.route}
            />
          ))}
          <PathwayCard
            agentId="nex"
            label="All work"
            title="All projects"
            description="Every project in one index, each with an honest status: completed, in progress or planned."
            to="/projects"
            className="sm:col-span-2"
          />
        </div>
      </Lane>

      {/* Contact ---------------------------------------------------------------------------- */}
      <Lane
        id="connect"
        index="05"
        label="Contact"
        title="Let's build something useful"
        intro={<p>Open to software development and AI engineering roles.</p>}
      >
        <div className="flex flex-wrap gap-3">
          <Link
            to="/contact"
            className="inline-flex min-h-11 items-center rounded-full bg-nex px-6 font-medium text-obsidian transition-colors hover:bg-text"
          >
            Contact Alex
          </Link>
          {links.cv && (
            <a
              href={links.cv}
              download
              className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
            >
              Download CV
            </a>
          )}
          {links.linkedin && (
            <ExternalLink
              href={links.linkedin}
              className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
            >
              LinkedIn
            </ExternalLink>
          )}
          {links.github && (
            <ExternalLink
              href={links.github}
              className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
            >
              GitHub
            </ExternalLink>
          )}
        </div>
      </Lane>
    </div>
  );
}
