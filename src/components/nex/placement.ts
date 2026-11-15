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
let minimised = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function setNexPlacement(next: Exclude<NexPlacement, "hidden">): void {
  const resolved: NexPlacement = minimised ? "hidden" : next;
  if (resolved === placement) return;
  placement = resolved;
  emit();
}

/** Minimise (hide) NEX for the rest of the visit, or bring him back to `restore`. */
export function setNexMinimised(value: boolean, restore: Exclude<NexPlacement, "hidden">): void {
  minimised = value;
  placement = value ? "hidden" : restore;
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
