import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./styles/app.css";

import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/root";
import { SiteShell } from "./components/layout/SiteShell";
import { StageMount } from "./composition/StageMount";
import { Container } from "./components/ui/PageIntro";
import { pageTitle } from "./content/site";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "preload", href: geistLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#05080b" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        {/* No <ScrollRestoration />: it writes to sessionStorage. See ScrollManager. */}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Composition root: the semantic DOM shell plus the lazily loaded WebGL stage behind it.
 * Only this file (via StageMount) knows the 3D layer exists (ADR-002).
 */
export default function App() {
  return (
    <>
      <StageMount />
      <SiteShell>
        <Outlet />
      </SiteShell>
    </>
  );
}

/**
 * Fail safe (OWASP A10:2025): a designed, generic error screen. Details are shown only in
 * development builds, never in production.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isResponse = isRouteErrorResponse(error);
  const heading = isResponse && error.status === 404 ? "Page not found" : "Something went wrong";
  const detail =
    import.meta.env.DEV && error instanceof Error ? (error.stack ?? error.message) : null;

  return (
    <SiteShell>
      <title>{pageTitle(heading)}</title>
      <Container className="py-24">
        <p className="os-label">{isResponse ? `Error ${error.status}` : "System error"}</p>
        <h1 className="mt-5 text-title font-semibold tracking-tight">{heading}</h1>
        <p className="mt-6 max-w-xl text-text-muted">
          This part of MOYLAN//OS couldn&apos;t be displayed. Please return to the home page and try
          again.
        </p>
        <a href="/" className="mt-8 inline-block text-nex underline underline-offset-4">
          Return to MOYLAN//OS
        </a>
        {detail && (
          <pre className="mt-10 overflow-x-auto rounded-lg border border-steel p-4 text-xs text-text-muted">
            {detail}
          </pre>
        )}
      </Container>
    </SiteShell>
  );
}
