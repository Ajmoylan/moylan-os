import { Link } from "react-router";
import { Container, DevelopmentNotice, PageIntro } from "~/components/ui/PageIntro";
import { buildMeta } from "~/content/meta";
import { site } from "~/content/site";
import type { Route } from "./+types/about";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "About",
    description:
      "About Alex Moylan: software engineering, applied AI, cloud security and technology advisory.",
    path: "/about",
  });

export default function About() {
  return (
    <Container>
      <PageIntro label="MOYLAN//OS / About" title={`About ${site.owner}`}>
        <p>
          Alex works across software engineering, applied AI, cloud security and technology
          advisory, building systems and connecting them to the people and outcomes they serve.
        </p>
      </PageIntro>

      <div className="max-w-3xl space-y-12">
        <DevelopmentNotice>
          <p>
            A full biography and verifiable credentials are being prepared. Explore Alex&apos;s work
            through the{" "}
            <Link to="/#explore" data-inline className="text-nex underline underline-offset-4">
              specialist environments
            </Link>{" "}
            in the meantime.
          </p>
        </DevelopmentNotice>

        <section id="cv" aria-labelledby="cv-title" className="scroll-mt-24">
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
      </div>
    </Container>
  );
}
