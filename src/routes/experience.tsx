import { Link } from "react-router";
import { Container, PageIntro } from "~/components/ui/PageIntro";
import { experience, roleYears } from "~/content/experience";
import { buildMeta } from "~/content/meta";
import type { Route } from "./+types/experience";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "Experience",
    description:
      "Alex Moylan's professional experience: Hewlett-Packard, Microsoft, Meta Reality Labs and Lululemon.",
    path: "/experience",
  });

/**
 * The experience timeline (content/experience.ts, from Alex's CV): most recent first, one card per
 * role on a rail, with the CV's documented figures highlighted. Hosted by ATLAS. Not revealed on
 * scroll: a card straddling the fold mid-fade would fail contrast at some screen sizes.
 */
export default function Experience() {
  return (
    <Container>
      <div data-agent="atlas">
        <PageIntro
          agentId="atlas"
          label="MOYLAN//OS / Experience · hosted by ATLAS"
          title="Experience"
        >
          <p>
            From enterprise demonstrations at Hewlett-Packard and partner growth at Microsoft to
            product enablement at Meta: a career spent connecting technology with the people and
            businesses who use it.
          </p>
        </PageIntro>

        <ol className="os-timeline max-w-4xl" aria-label="Roles, most recent first">
          {experience.map((role) => (
            <li key={role.id}>
              <span aria-hidden="true" className="os-timeline-dot" />
              <article
                aria-labelledby={`${role.id}-title`}
                className="os-panel p-6 wrap-anywhere sm:p-8"
              >
                <p className="os-label text-(--accent)">
                  <span className="sr-only">Dates: </span>
                  {roleYears(role)}
                  <span aria-hidden="true"> · </span>
                  <span className="sr-only">, </span>
                  {role.location}
                </p>
                <h2
                  id={`${role.id}-title`}
                  className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl"
                >
                  {role.title}
                </h2>
                <p className="mt-1 text-lg text-text">{role.organisation}</p>

                {role.highlights && (
                  <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {role.highlights.map((highlight) => (
                      <div
                        key={highlight.value}
                        className="flex flex-col-reverse rounded-xl border border-steel bg-obsidian/40 p-4"
                      >
                        <dt className="mt-1 text-sm text-text-muted">{highlight.label}</dt>
                        <dd className="font-mono text-2xl font-semibold text-(--accent)">
                          {highlight.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <ul className="mt-6 space-y-3 text-text-muted">
                  {role.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-2.5 size-1.5 shrink-0 rounded-full bg-(--accent)"
                      />
                      <span className="min-w-0 leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>

        <p className="mt-12 max-w-3xl text-text-muted">
          Education, certifications and the person behind the work are on the{" "}
          <Link to="/about" data-inline className="text-(--accent) underline underline-offset-4">
            About
          </Link>{" "}
          page.
        </p>
      </div>
    </Container>
  );
}
