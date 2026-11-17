import { ContactButtons, ContactDetails } from "~/components/ui/ContactActions";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { Container, PageIntro } from "~/components/ui/PageIntro";
import { buildMeta } from "~/content/meta";
import { site } from "~/content/site";
import type { Route } from "./+types/contact";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "Contact",
    description: "How to get in touch with Alex Moylan: telephone, email, LinkedIn and his CV.",
    path: "/contact",
  });

export default function Contact() {
  const profiles = [
    site.links.linkedin && { label: "LinkedIn", href: site.links.linkedin },
    site.links.github && { label: "GitHub", href: site.links.github },
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <Container>
      <PageIntro label="MOYLAN//OS / Contact" title="Contact">
        <p>
          For roles, collaborations or questions about Alex&apos;s work. Alex is based in Oslo,
          Norway.
        </p>
      </PageIntro>

      <ContactButtons />
      <ContactDetails className="mt-8 max-w-3xl" />

      <ul className="mt-4 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {profiles.map((profile) => (
          <li key={profile.label} className="os-panel p-5">
            <p className="os-label">{profile.label}</p>
            <p className="mt-2">
              <ExternalLink
                href={profile.href}
                className="inline-flex min-h-11 items-center text-nex underline underline-offset-4 wrap-anywhere"
              >
                {profile.href.replace(/^https:\/\//, "")}
              </ExternalLink>
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-3xl text-sm text-text-muted">
        This site has no contact form and stores no messages. If you email or call, your details are
        handled as described in the privacy notice.
      </p>
    </Container>
  );
}
