/**
 * The page → stage signals for NEX (window events, so the DOM never imports the lazy WebGL stage
 * and the stage owns, and removes, its own listeners). Both are fire-and-forget: with no stage
 * (static fallback, motion Off, no WebGL) nothing listens and nothing happens.
 */

/** The active NEX anchor changed (`data-stage-anchor="nex"` moved to another element). */
export const NEX_ANCHOR_EVENT = "moylan:nex-anchor";
/** A visitor is engaging with NEX: `detail` is a `NexAttentionDetail`. */
export const NEX_ATTENTION_EVENT = "moylan:nex-attention";

/**
 * - `hold`: pointer over / focus on NEX's launcher (a soft, sustained acknowledgement);
 * - `release`: the hold ended;
 * - `pulse`: a single brief acknowledgement (a navigation choice, a sentence spoken);
 * - `play`: the visitor came back to NEX (dismissed his panel): a pulse, plus his playful twirl.
 */
export type NexAttention = "hold" | "release" | "pulse" | "play";

/**
 * Who holds NEX's attention. Each holds and releases independently, so one ending (the
 * introduction finishing typing, the pointer leaving) never cancels another (keyboard focus on
 * NEX's launcher): attention is held while any of them holds it.
 */
export type NexHolder = "pointer" | "focus" | "transmission" | "voice";

export interface NexAttentionDetail {
  kind: NexAttention;
  /** Set for `hold` and `release`. */
  source?: NexHolder;
}

export function announceNexAnchor(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NEX_ANCHOR_EVENT));
}

export function signalNex(kind: "pulse" | "play"): void;
export function signalNex(kind: "hold" | "release", source: NexHolder): void;
export function signalNex(kind: NexAttention, source?: NexHolder): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NexAttentionDetail>(NEX_ATTENTION_EVENT, { detail: { kind, source } }),
  );
}
