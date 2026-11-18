import type { ReactNode } from "react";
import { Link } from "react-router";
import { specialists } from "~/agents/registry";
import {
  buttonClass as button,
  ContactButtons,
  ContactDetails,
} from "~/components/ui/ContactActions";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { Container } from "~/components/ui/PageIntro";
import { PathwayCard } from "~/components/ui/PathwayCard";
import { SmartLink, type LinkTarget } from "~/components/ui/SmartLink";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { experience, roleYears, type Role } from "~/content/experience";
import { featuredProjects as featured } from "~/content/projects";
import { site } from "~/content/site";

/**
 * The homepage below the opening, in narrative order: where to start, Alex's experience, the work,
 * the specialist agents, contact. Loaded after the opening (see routes/home.tsx) but prerendered
 * with it, so it never appears late.
 */

/** A homepage chapter: numbered label, heading and intro, revealed as it scrolls in. */
function Chapter({
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
    <section id={id} aria-labelledby={`${id}-title`} className="os-lane os-chapter scroll-mt-20">
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

/** One of the three visitor pathways: what it covers and its direct links. */
function VisitorPathway({
  agent,
  number,
  title,
  description,
  links,
}: {
  agent: "forge" | "syn" | "atlas";
  number: string;
  title: string;
  description: string;
  links: readonly ({ label: string } & LinkTarget)[];
}) {
  return (
    <article data-agent={agent} className="os-pathway os-glow-card flex flex-col p-6 sm:p-7">
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

/**
 * The career timeline's homepage summaries: the CV's own wording, condensed (DESIGN-BRIEF §10:
 * nothing beyond the CV and experience.ts). Roles, places and years come from experience.ts.
 */
const CAREER: readonly { id: string; mark: string; summary: string; figure?: string }[] = [
  {
    id: "hp",
    mark: "HP",
    summary:
      "Enterprise technology demonstrations and proof-of-concept sessions for customer stakeholders, including AI-accelerated workloads and XR, at HP's Customer Experience Centre.",
  },
  {
    id: "microsoft",
    mark: "MS",
    summary:
      "Indirect channel: the Microsoft partner ecosystem and reseller enablement, with go-to-market plans for partner growth.",
    figure: "1,000+ reseller partners supported",
  },
  {
    id: "meta",
    mark: "M",
    summary:
      "XR and consumer hardware at Reality Labs: product training, technical enablement and partner feedback.",
  },
];

const roles = new Map<string, Role>(experience.map((role) => [role.id, role]));

function CareerTimeline() {
  return (
    <ol className="os-career" aria-label="Career, in order">
      {CAREER.map((item) => {
        const role = roles.get(item.id)!;
        return (
          <li key={item.id} className="os-career-step">
            <span aria-hidden="true" className="os-career-node">
              {item.mark}
            </span>
            <article className="os-career-card os-glow-card">
              <p className="os-label text-nex">{roleYears(role)}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                {role.organisation}
                {role.unit && <span className="text-text-muted"> · {role.unit}</span>}
              </h3>
              <p className="mt-1 font-medium">{role.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{item.summary}</p>
              {item.figure && <p className="os-career-figure mt-4">{item.figure}</p>}
            </article>
          </li>
        );
      })}
      <li className="os-career-step os-career-now">
        <span aria-hidden="true" className="os-career-node">
          AI
        </span>
        <article className="os-career-card os-glow-card">
          <p className="os-label text-nex">2023–2026 · Now</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">Applied AI & software</h3>
          <p className="mt-1 font-medium">AI agents, applications and dashboards</p>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            BSc (Hons) Computing and IT (Software), completed 2026, First-Class Honours expected.
            Microsoft Certified: Azure Fundamentals (AZ-900).
          </p>
          <p className="mt-4 text-sm">
            <a href="#work" className={button.link}>
              See the projects
            </a>
          </p>
        </article>
      </li>
    </ol>
  );
}

/** Each project's main call to action: its live demo, its code, or its write-up. */
function primaryAction(project: (typeof featured)[number]): { label: string } & LinkTarget {
  if (project.evidence.demo) {
    return { label: "Open live demo", href: project.evidence.demo, external: true };
  }
  if (project.evidence.repo) {
    return { label: "View the code", href: project.evidence.repo, external: true };
  }
  return { label: "Read the overview", to: "/projects" };
}

export default function HomeSections() {
  const { links } = site;
  const bySlug = (slug: string) => featured.find((p) => p.slug === slug);
  const claimflow = bySlug("claimflow");
  const launchpad = bySlug("copilot-launchpad");
  const posture = bySlug("repo-posture");

  return (
    <>
      {/* Where to start: three direct routes, no knowledge of the agents needed. */}
      <section aria-labelledby="paths-title" className="os-chapter os-chapter-tight">
        <Container>
          <h2 id="paths-title" className="os-label text-center">
            <span aria-hidden="true">
              <span className="text-nex">00</span>
              {" // "}
            </span>
            What brings you here?
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <VisitorPathway
              agent="atlas"
              number="I'm hiring"
              title="Experience and capabilities"
              description="Roles at Microsoft, HP and Meta, capabilities, CV and how to reach Alex."
              links={[
                { label: "My experience", to: "/experience" },
                { label: "Meet Alex", to: "/about" },
                ...(links.cv
                  ? [{ label: "Download CV (PDF)", href: links.cv, download: true }]
                  : []),
                { label: "Contact", href: "#contact" },
              ]}
            />
            <VisitorPathway
              agent="forge"
              number="Show me the work"
              title="Projects and live demos"
              description="Three live demos, their code on GitHub, and AI projects."
              links={[
                { label: "Featured projects", href: "#work" },
                ...(claimflow?.evidence.demo
                  ? [{ label: "CLAIMFLOW demo", href: claimflow.evidence.demo, external: true }]
                  : []),
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
                  ? [
                      {
                        label: "Repo Posture dashboard",
                        href: posture.evidence.demo,
                        external: true,
                      },
                    ]
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
        </Container>
      </section>

      <Chapter
        id="experience"
        index="01"
        label="Professional experience"
        title="Enterprise technology, then applied AI"
        intro={
          <p>
            Years of connecting technology with the businesses that use it, at Microsoft, HP and
            Meta, now building the software and AI that do the work.
          </p>
        }
      >
        <CareerTimeline />
        <p className="mt-8">
          <Link to="/experience" className={button.secondary}>
            Full experience
          </Link>
        </p>
      </Chapter>

      <Chapter
        id="work"
        index="02"
        label="Featured work"
        title="Things I've built"
        intro={
          <p>
            Three live demos, an AI agent and a deep-learning project. Each shows its real status
            and links to its code where it&apos;s public.
          </p>
        }
      >
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {featured.map((project) => {
            const action = primaryAction(project);
            return (
              <li
                key={project.slug}
                data-agent={project.agent}
                className="os-project os-pathway os-glow-card flex flex-col p-6 sm:p-8 md:first:col-span-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-semibold tracking-tight">{project.title}</h3>
                  <StatusBadge status={project.status} />
                </div>
                <p className="mt-2 os-label text-(--accent)">
                  {project.demoNote ??
                    (project.evidence.repo ? "Open source on GitHub" : "Source code not public")}
                </p>
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
                  <SmartLink target={action} className={button.primary}>
                    {action.label}
                  </SmartLink>
                  {project.evidence.demo && project.evidence.repo && (
                    <ExternalLink href={project.evidence.repo} className={button.link}>
                      Code on GitHub
                    </ExternalLink>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-6">
          <Link
            to="/projects"
            className="inline-flex min-h-11 items-center text-nex underline underline-offset-4"
          >
            All projects
          </Link>
        </p>
      </Chapter>

      <Chapter
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
        </div>
      </Chapter>

      <Chapter
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
      </Chapter>
    </>
  );
}
