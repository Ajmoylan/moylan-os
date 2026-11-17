import { Container, PageIntro } from "~/components/ui/PageIntro";
import { ExternalLink } from "~/components/ui/ExternalLink";
import { buildMeta } from "~/content/meta";
import { site } from "~/content/site";
import type { Route } from "./+types/privacy";

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "Privacy",
    description: "How MOYLAN//OS handles personal data: no cookies, no tracking, no analytics.",
    path: "/privacy",
  });

const LAST_UPDATED = "17 November 2026";

/**
 * Privacy notice (docs/PRIVACY-COMPLIANCE.md §10), covering GDPR Article 13: controller and
 * contact, purposes and legal bases, recipients (Cloudflare hosting, Apple iCloud Mail), transfers,
 * retention, rights and the right to complain to Datatilsynet. Update it before any new data flow.
 */
export default function Privacy() {
  return (
    <Container>
      <PageIntro label="MOYLAN//OS / Privacy" title="Privacy notice" nex={false}>
        <p>
          MOYLAN//OS is designed to collect as little as possible. It uses no cookies, no tracking
          and no analytics.
        </p>
      </PageIntro>

      <div className="max-w-3xl">
        <div className="os-prose">
          <h2>Who is responsible</h2>
          <p>
            {site.owner}, based in Oslo, Norway, is the controller for personal data processed
            through this website. Contact:{" "}
            {site.links.email ? (
              <a
                href={`mailto:${site.links.email}`}
                data-inline
                className="text-nex underline underline-offset-4"
              >
                {site.links.email}
              </a>
            ) : (
              <strong>[contact address to be added before launch]</strong>
            )}
            .
          </p>

          <h2>What is processed, and why</h2>
          <ul>
            <li>
              <strong>Delivering the website.</strong> Like every website, the hosting provider
              (Cloudflare, through Cloudflare Pages and its network) processes technical data such
              as your IP address, the page requested, your browser&apos;s user agent and the time of
              the request in order to deliver pages and protect the site against attacks and abuse.
              Cloudflare keeps these technical logs for a limited period under its own policies;
              this site does not receive or store them. Cloudflare may also ask your browser to send
              it short reports when a page fails to load (Network Error Logging), which it uses to
              detect network problems. The site&apos;s owner sees only aggregated statistics in
              Cloudflare&apos;s dashboard (for example, the number of requests), not information
              about individual visitors. Legal basis: legitimate interests in running a secure,
              working website (GDPR Article 6(1)(f)).
            </li>
            <li>
              <strong>If you email.</strong> Your name, email address and message are used only to
              reply. The mailbox is provided by Apple (iCloud Mail), which stores the messages. They
              are deleted within 12 months after the conversation ends unless we work together.
              Legal basis: legitimate interests, or steps you request before entering into an
              agreement (Article 6(1)(b)).
            </li>
          </ul>

          <h2>Cookies, storage and tracking</h2>
          <p>
            This site does <strong>not</strong> set cookies or use local storage, session storage,
            IndexedDB, service workers, analytics, advertising or social-media tracking. Fonts and
            all other files are served from this site, not from third parties. These properties are
            checked by automated tests on every build. The only exception would come from
            Cloudflare&apos;s security service: if it has to check a suspicious request, it may set
            a strictly necessary security cookie for that purpose alone.
          </p>
          <p>
            <strong>Motion setting.</strong> The motion control in the header (System, Full, Reduced
            or Off) is kept only in your browser tab&apos;s memory while you use the site. It is
            never saved on your device or sent anywhere, so reloading the page returns it to System,
            which follows your device&apos;s own reduced-motion setting.
          </p>
          <p>
            <strong>Browser caching.</strong> Like any website, your browser keeps copies of the
            files it downloads from this site (pages, styles, scripts, fonts and images) in its
            ordinary HTTP cache, so later pages load faster. This site tells your browser how long
            to keep them: design files with unique names can be reused for up to a year, and pages
            are checked for updates on each visit. The cache contains only files from this site, is
            not used to identify or track you, and is managed by your browser; you can clear it at
            any time in your browser settings.
          </p>
          <p>
            Norwegian law (ekomloven § 3-15) requires consent before information is stored on or
            read from your device, except where this is strictly necessary to transmit a
            communication or to provide a service you have explicitly requested. Ordinary caching of
            the files needed to show you the pages you asked for is assessed as falling within these
            exceptions, so this site does not ask for cookie consent. If anything requiring consent
            is ever added, the site will ask before it runs.
          </p>

          <h2>Recipients and transfers</h2>
          <p>
            Cloudflare, Inc. hosts the site and acts as a data processor under its data processing
            terms. Apple provides the email mailbox. Content is delivered from Cloudflare&apos;s
            global network, so requests may be processed outside the EEA, including in the United
            States. Such transfers rely on the safeguards in each provider&apos;s data protection
            terms, such as the EU Standard Contractual Clauses or the EU–U.S. Data Privacy
            Framework. No personal data is sold or used for advertising. Links to external sites
            such as GitHub or LinkedIn are ordinary links: those sites only receive data if you
            choose to visit them.
          </p>

          <h2>Your rights</h2>
          <p>
            You don&apos;t have to give any personal data to read this site, and no decisions are
            made about you by automated means. You have the right to access, correct or delete
            personal data about you, to restrict or object to processing, and to data portability.
            To use them, email the address above. You can also complain to the Norwegian Data
            Protection Authority,{" "}
            <ExternalLink href="https://www.datatilsynet.no" data-inline>
              Datatilsynet
            </ExternalLink>
            .
          </p>

          <h2>Changes</h2>
          <p>
            If this site ever introduces analytics, forms or AI features, this notice will be
            updated first, and anything that requires consent will ask for it before it runs.
          </p>
          <p>Last updated: {LAST_UPDATED}.</p>
        </div>
      </div>
    </Container>
  );
}
