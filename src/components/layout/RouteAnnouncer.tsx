import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * Accessible client-side navigation (ARCHITECTURE §10): after a route change, move focus to the
 * new page's <h1> and announce the page title. Skipped on first load so the browser's natural
 * focus order (skip link first) is preserved. Hash-only changes are left to the browser.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const regionRef = useRef<HTMLParagraphElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLHeadingElement>("main h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
      if (regionRef.current) regionRef.current.textContent = document.title;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return <p ref={regionRef} className="sr-only" aria-live="polite" aria-atomic="true" />;
}
