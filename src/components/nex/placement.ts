import { useSyncExternalStore } from "react";

/**
 * Where NEX lives right now (launch sprint, companion mode): one tiny shared store for the page's
 * own NEX spot, the companion dock and the director that chooses between them. In memory only.
 *
 * - `page`: the route's primary spot (the homepage opening, a dedicated page's heading);
 * - `dock`: the companion dock, fixed in the corner of the viewport;
 * - `hidden`: the visitor minimised NEX (for the rest of the visit).
 */
export type NexPlacement = "page" | "dock" | "hidden";

let placement: NexPlacement = "page";
/** Where the director wants NEX (kept current while he is minimised, for "Show NEX"). */
let wanted: Exclude<NexPlacement, "hidden"> = "page";
let minimised = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function setNexPlacement(next: Exclude<NexPlacement, "hidden">): void {
  wanted = next;
  const resolved: NexPlacement = minimised ? "hidden" : next;
  if (resolved === placement) return;
  placement = resolved;
  emit();
}

/**
 * Minimise (hide) NEX for the rest of the visit, or bring him back to where the director wants him
 * now (the page's own spot if it is in view, otherwise the dock).
 */
export function setNexMinimised(value: boolean): void {
  minimised = value;
  placement = value ? "hidden" : wanted;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The current placement (the prerendered page always has NEX at its own spot). */
export function useNexPlacement(): NexPlacement {
  return useSyncExternalStore(
    subscribe,
    () => placement,
    () => "page",
  );
}
