import { Link } from "react-router";
import portraitAvif480 from "~/assets/about/alex-moylan-480.avif";
import portraitAvif768 from "~/assets/about/alex-moylan-768.avif";
import portraitAvif1086 from "~/assets/about/alex-moylan-1086.avif";
import portraitWebp480 from "~/assets/about/alex-moylan-480.webp";
import portraitWebp768 from "~/assets/about/alex-moylan-768.webp";
import portraitWebp1086 from "~/assets/about/alex-moylan-1086.webp";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { beyondTheCode, competencies, educationDetail, facts } from "~/content/about";
import { Container, PageIntro } from "~/components/ui/PageIntro";
import { buildMeta } from "~/content/meta";
import { profile } from "~/content/profile";
import { site } from "~/content/site";
import type { Route } from "./+types/about";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "About",
    description:
      "Meet Alex Moylan: a British–Irish technology professional in Oslo, combining enterprise customer engagement and business development at HP, the Microsoft partner ecosystem and Meta with software engineering and applied AI.",
    path: "/about",
  });

const NEX_INTRO = "You've met the system. Now meet the human who built it.";

/**
 * The portrait (src/assets/about, from Alex's supplied photograph): AVIF with a WebP fallback at
 * three widths, imported here so only this page requests it. 3:4, as photographed.
 */
const PORTRAIT = {
  avif: `${portraitAvif480} 480w, ${portraitAvif768} 768w, ${portraitAvif1086} 1086w`,
  webp: `${portraitWebp480} 480w, ${portraitWebp768} 768w, ${portraitWebp1086} 1086w`,
  /** Its column: 18rem on phones, 20rem on tablets, about a third of the page on desktop. */
  sizes: "(min-width: 80rem) 25rem, (min-width: 64rem) 30vw, (min-width: 40rem) 20rem, 18rem",
};

export default function About() {
  const keyFacts = [
    { term: "Based in", detail: facts.location },
    { term: "Citizenship", detail: facts.citizenship },
    { term: "Eligible to work", detail: facts.workEligibility },
  ];

  return (
    <Container>
      <PageIntro label="MOYLAN//OS / About" title="Meet the human">
        {/* NEX // TRANSMISSION, already complete: the transmission's look without its typing, so
            this page shares no code with the homepage's opening (initial-JS budget). */}
        <figure data-state="done" className="nex-tx os-about-tx">
          <figcaption className="nex-tx-label">
            <span aria-hidden="true" className="nex-tx-signal">
              <i />
              <i />
              <i />
            </span>
            NEX // TRANSMISSION
          </figcaption>
          <blockquote className="nex-tx-body">
            <p>{NEX_INTRO}</p>
          </blockquote>
        </figure>
      </PageIntro>

      {/* MEET THE HUMAN // ALEX MOYLAN: the portrait beside the introduction (above it on phones). */}
      <section
        aria-labelledby="human-title"
        className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16"
      >
        <figure className="os-portrait os-brackets w-full max-w-[18rem] sm:max-w-[20rem] lg:max-w-[25rem]">
          <picture>
            <source type="image/avif" srcSet={PORTRAIT.avif} sizes={PORTRAIT.sizes} />
            <source type="image/webp" srcSet={PORTRAIT.webp} sizes={PORTRAIT.sizes} />
            <img
              src={portraitWebp768}
              width={1086}
              height={1448}
              alt="Alex Moylan smiling, in a navy blazer and white open-collared shirt."
              decoding="async"
              fetchPriority="high"
              className="block h-auto w-full"
            />
          </picture>
        </figure>

        <div className="min-w-0">
          <p className="os-label text-nex">Meet the human // Alex Moylan</p>
          <h2 id="human-title" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {site.owner}
          </h2>
          <p className="mt-3 font-mono text-sm tracking-wide text-text-muted">
            AI technology advisory · Applied AI and enterprise solutions
          </p>

          <div className="mt-8 max-w-2xl space-y-5 text-lg leading-relaxed text-text-muted">
            <p>
              Alex is a British–Irish technology professional based in Oslo, Norway. His career
              spans Hewlett-Packard, Microsoft SureStep in the Microsoft partner ecosystem, and Meta
              Reality Labs: enterprise customer engagement, technology demonstrations and commercial
              development, now combined with software engineering and applied AI.
            </p>
            <p>
              He enjoys connecting what technology can do with the real problems businesses need to
              solve, and making complex technology accessible, whether that&apos;s a proof of
              concept for an enterprise customer or a go-to-market plan for a reseller partner.
            </p>
            <p>
              Alongside a leadership role at Lululemon in Oslo, he completed the requirements for a
              BSc (Hons) in Computing and IT (Software) with The Open University, building practical
              AI applications in Python, FastAPI, LLM APIs and PyTorch along the way.
            </p>
          </div>

          <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {keyFacts.map((fact) => (
              <div key={fact.term} className="os-panel p-4">
                <dt className="os-label">{fact.term}</dt>
                <dd className="mt-2 text-text">{fact.detail}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/experience"
              className="inline-flex min-h-11 items-center rounded-full bg-nex px-6 font-medium text-obsidian transition-colors hover:bg-text"
            >
              Experience
            </Link>
            <Link
              to="/projects"
              className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
            >
              Projects
            </Link>
            {site.links.linkedin && (
              <ExternalLink
                href={site.links.linkedin}
                className="inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60"
              >
                LinkedIn
              </ExternalLink>
            )}
          </div>
        </div>
      </section>

      {/* What he brings (CV, Core Competencies). */}
      <section aria-labelledby="brings-title" className="mt-24">
        <h2 id="brings-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What Alex brings
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {competencies.map((competency) => (
            <li key={competency.name} className="os-panel p-6">
              <h3 className="text-lg font-medium">{competency.name}</h3>
              <p className="mt-2 text-text-muted">{competency.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Education and certifications (CV). */}
      <section aria-labelledby="learning-title" className="mt-20">
        <h2 id="learning-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Education and certifications
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {profile.education.map((education) => (
            <li key={education.degree} className="os-panel p-6">
              <p className="os-label">
                {education.institution} · {education.years}
              </p>
              <h3 className="mt-3 text-lg font-medium">{education.degree}</h3>
              <p className="mt-1 text-sm text-nex">{education.status}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                {educationDetail[education.institution]}
              </p>
            </li>
          ))}
          {profile.certifications.map((certification) => (
            <li key={certification.code} className="os-panel p-6">
              <p className="os-label">
                {certification.issuer} · {certification.code}
              </p>
              <h3 className="mt-3 text-lg font-medium">{certification.name}</h3>
              <p className="mt-1 text-sm text-nex">{certification.statusLabel}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Beyond the code: brief and personal, after the professional story. */}
      <section aria-labelledby="beyond-title" className="mt-20 max-w-3xl">
        <h2 id="beyond-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Beyond the code
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-text-muted">
          British–Irish, and at home in Oslo. Away from the keyboard, Alex&apos;s time goes to:
        </p>
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Interests">
          {beyondTheCode.map((item) => (
            <li
              key={item}
              className="rounded-full border border-steel px-3 py-1 text-sm text-text-muted"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="cv" aria-labelledby="cv-title" className="mt-20 max-w-3xl scroll-mt-24">
        <h2 id="cv-title" className="text-2xl font-semibold tracking-tight">
          CV
        </h2>
        {site.links.cv ? (
          <p className="mt-4">
            <a
              href={site.links.cv}
              download
              className="inline-flex min-h-11 items-center text-nex underline underline-offset-4"
            >
              Download CV (PDF)
            </a>
          </p>
        ) : (
          <p className="mt-4 text-text-muted">
            A downloadable CV will be available here. You can reach Alex through the{" "}
            <Link to="/contact" data-inline className="text-nex underline underline-offset-4">
              contact page
            </Link>
            .
          </p>
        )}
      </section>
    </Container>
  );
}
