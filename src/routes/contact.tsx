import { Container, PageIntro } from "~/components/ui/PageIntro";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { buildMeta } from "~/content/meta";
import { site } from "~/content/site";
import type { Route } from "./+types/contact";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "Contact",
    description: "How to get in touch with Alex Moylan.",
    path: "/contact",
  });

export default function Contact() {
  const channels = [
    site.links.email && { label: "Email", href: `mailto:${site.links.email}`, external: false },
    site.links.linkedin && { label: "LinkedIn", href: site.links.linkedin, external: true },
    site.links.github && { label: "GitHub", href: site.links.github, external: true },
  ].filter((channel): channel is { label: string; href: string; external: boolean } =>
    Boolean(channel),
  );

  return (
    <Container>
      <PageIntro label="MOYLAN//OS / Contact" title="Contact">
        <p>For roles, collaborations or questions about Alex&apos;s work.</p>
      </PageIntro>

      <ul className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {channels.map((channel) => (
          <li key={channel.label} className="os-panel p-6">
            <p className="os-label">{channel.label}</p>
            <p className="mt-3">
              {channel.external ? (
                <ExternalLink
                  href={channel.href}
                  className="inline-flex min-h-11 items-center text-nex underline underline-offset-4 wrap-anywhere"
                >
                  {channel.href.replace(/^https:\/\//, "")}
                </ExternalLink>
              ) : (
                <a
                  href={channel.href}
                  className="inline-flex min-h-11 items-center text-nex underline underline-offset-4 wrap-anywhere"
                >
                  {channel.href.replace(/^mailto:/, "")}
                </a>
              )}
            </p>
          </li>
        ))}
      </ul>

      {!site.links.email && (
        <p className="mt-8 max-w-3xl text-text-muted">
          Further contact details will be published here before launch.
        </p>
      )}
      <p className="mt-4 max-w-3xl text-sm text-text-muted">
        This site has no contact form and stores no messages. If you email, your message is handled
        as described in the privacy notice.
      </p>
    </Container>
  );
}
