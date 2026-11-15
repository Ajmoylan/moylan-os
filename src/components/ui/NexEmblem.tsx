import { agents } from "~/agents/registry";

/**
 * Static NEX emblem: the non-WebGL fallback poster (ARCHITECTURE §9, tier 0).
 *
 * Served as a static, cacheable SVG file (`public/nex-emblem.svg`, the same deterministic artwork
 * the inline component drew, rendered once) instead of JavaScript, so it costs nothing in the
 * initial JS budget. Same text equivalent for assistive technology.
 */
export function NexEmblem({ className = "" }: { className?: string }) {
  return (
    <img
      src="/nex-emblem.svg"
      alt={agents.nex.visualDescription}
      width={400}
      height={400}
      decoding="async"
      className={className}
    />
  );
}
