import { Link } from "react-router";

/**
 * Type-set placeholder for the final SVG wordmark (DESIGN-BRIEF §2). It may wrap after "MOYLAN"
 * only when the whole wordmark is wider than the screen (very large text on very narrow screens).
 */
export function Wordmark() {
  return (
    <Link
      to="/"
      className="group inline-flex min-h-11 flex-wrap items-center font-semibold tracking-[0.14em] text-text"
    >
      MOYLAN<span className="text-nex transition-colors group-hover:text-text">//OS</span>
      <span className="sr-only"> home</span>
    </Link>
  );
}
