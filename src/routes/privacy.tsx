import { Container, DevelopmentNotice, PageIntro } from "~/components/ui/PageIntro";
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

const LAST_UPDATED = "7 November 2026";

/**
 * Draft privacy notice (docs/PRIVACY-COMPLIANCE.md §10). Controller contact details must be
 * completed before public launch (release gate, docs/SECURITY.md §13).
 */
export default function Privacy() {
  return (
    <Container>
      <PageIntro label="MOYLAN//OS / Privacy" title="Privacy notice">
        <p>
          MOYLAN//OS is designed to collect as little as possible. It uses no cookies, no tracking
          and no analytics.
        </p>
      </PageIntro>

      <div className="max-w-3xl">
        <DevelopmentNotice>
          <p>
            <strong className="font-medium text-text">Draft.</strong> This notice will be finalised,
            including contact details, and reviewed against current Norwegian guidance before the
            site is published.
          </p>
        </DevelopmentNotice>

        <div className="os-prose mt-6">
          <h2>Who is responsible</h2>
          <p>
            {site.owner} is the controller for personal data processed through this website.
            Contact: <strong>[contact address to be added before launch]</strong>.
          </p>

          <h2>What is processed, and why</h2>
          <ul>
            <li>
              <strong>Delivering the website.</strong> Like every website, the hosting provider
              (Microsoft Azure Static Web Apps) processes technical data such as your IP address,
              the page requested, your browser&apos;s user agent and the time of the request in
              order to deliver pages and keep the service secure. Legal basis: legitimate interests
              (GDPR Article 6(1)(f)).
            </li>
            <li>
              <strong>If you email.</strong> Your name, email address and message are used only to
              reply. They are deleted within 12 months after the conversation ends unless we work
              together. Legal basis: legitimate interests, or steps you request before entering into
              an agreement (Article 6(1)(b)).
            </li>
          </ul>

          <h2>Cookies, storage and tracking</h2>
          <p>
            This version of the site does <strong>not</strong> use cookies, local storage, session
            storage, IndexedDB, service workers, analytics, advertising or social-media tracking.
            Fonts and all other files are served from this site, not from third parties. These
            properties are checked by automated tests on every build.
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
            Microsoft acts as the hosting provider (data processor). Content is delivered from a
            global network, so requests may be processed outside the EEA under Microsoft&apos;s data
            protection terms, including EU Standard Contractual Clauses. Links to external sites
            such as GitHub or LinkedIn are ordinary links: those sites only receive data if you
            choose to visit them.
          </p>

          <h2>Your rights</h2>
          <p>
            You have the right to access, correct or delete personal data about you, to restrict or
            object to processing, and to data portability. You can also complain to the Norwegian
            Data Protection Authority,{" "}
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
