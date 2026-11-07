import type { ReactNode } from "react";
import { RouteAnnouncer } from "./RouteAnnouncer";
import { ScrollManager } from "./ScrollManager";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { SkipLink } from "./SkipLink";

/**
 * Persistent, fully functional DOM shell. Knows nothing about WebGL: the stage is composed
 * alongside it in src/root.tsx (via src/composition/StageMount.tsx) and sits visually behind it.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <div className="os-backdrop" aria-hidden="true" />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
      <RouteAnnouncer />
      <ScrollManager />
    </>
  );
}
