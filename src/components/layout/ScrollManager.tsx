import { useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Scroll restoration without device storage.
 *
 * React Router's <ScrollRestoration> persists positions in sessionStorage. Under ekomloven § 3-15
 * that is storage on the visitor's device, and MOYLAN//OS promises none (PRIVACY-COMPLIANCE §4).
 * This keeps positions in memory for the lifetime of the page instead:
 *   - new navigation (PUSH/REPLACE): scroll to the #hash target, or to the top;
 *   - back/forward (POP): restore the remembered position if we have one;
 *   - full reloads: left to the browser's native scroll restoration.
 */
const positions = new Map<string, number>();
/** History entry that scroll events belong to. Switched before any programmatic scroll. */
let activeKey: string | null = null;

export function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  // One listener for the page lifetime. Scroll events are dispatched asynchronously, so they are
  // attributed to whichever entry is active when they fire, never to the page being left.
  useEffect(() => {
    const save = () => {
      if (activeKey) positions.set(activeKey, window.scrollY);
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);

  useLayoutEffect(() => {
    activeKey = location.key;
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    if (navigationType === "POP") {
      const saved = positions.get(location.key);
      if (saved !== undefined) window.scrollTo(0, saved);
      return;
    }
    window.scrollTo(0, 0);
  }, [location.key, location.hash, navigationType]);

  return null;
}
