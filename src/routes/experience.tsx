import { Link } from "react-router";
import { Container, DevelopmentNotice, PageIntro } from "~/components/ui/PageIntro";
import { buildMeta } from "~/content/meta";
import type { Route } from "./+types/experience";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "Experience",
    description:
      "Alex Moylan's professional experience across technology, engineering and advisory work.",
    path: "/experience",
  });

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
            A timeline of Alex&apos;s professional experience: enterprise technology, customer and
            stakeholder work, solution design and commercial impact.
          </p>
        </PageIntro>
        <div className="max-w-3xl">
          <DevelopmentNotice>
            <p>
              The experience timeline is being prepared with accurate, verifiable detail. Meanwhile,
              ATLAS introduces the advisory side of Alex&apos;s work in the{" "}
              <Link
                to="/advisory"
                data-inline
                className="text-(--accent) underline underline-offset-4"
              >
                Technology Advisory
              </Link>{" "}
              environment.
            </p>
          </DevelopmentNotice>
        </div>
      </div>
    </Container>
  );
}
