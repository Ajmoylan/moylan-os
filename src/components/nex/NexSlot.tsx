import { signalNex } from "~/lib/nex-events";
import { useNexPlacement } from "./placement";
import { NexEmblem } from "~/components/ui/NexEmblem";

/** The single NEX navigation panel (NexMenu), opened by every launcher. */
export const NEX_MENU_ID = "nex-menu";

interface NexSlotProps {
  /** Names the spot (diagnostics and tests). */
  id: string;
  /**
   * A static NEX emblem in the slot: NEX's visible form and text equivalent whenever the stage
   * isn't drawing NEX (no WebGL, motion Off, a lost context); it fades out while NEX is drawn.
   * Slots without one (homepage sections NEX visits) only offer the launcher while NEX is live.
   */
  poster?: boolean;
  /**
   * Keep NEX's whole footprint inside the viewport while this slot holds it, when the media query
   * matches (homepage sections on wide screens: NEX stays in view until the next section takes it).
   */
  contain?: string;
  /** Id of visible text describing what activating NEX does (the hero's hint). */
  describedBy?: string;
  className?: string;
}

/**
 * The route's own place for NEX (launch sprint): a layout-only box the stage centres NEX on while
 * it is in view (`NexCompanion` decides; otherwise NEX is in the companion dock), plus a real button
 * over it, so pointer, touch and keyboard users can activate NEX to open its compact navigation
 * panel (the native popover: Escape and outside clicks close it, focus returns to the button).
 * Hover and focus give NEX a soft acknowledgement (src/lib/nex-events.ts). One per route.
 */
export function NexSlot({
  id,
  poster = false,
  contain,
  describedBy,
  className = "",
}: NexSlotProps) {
  // Exactly one launcher at a time: here, or the dock's (assistive technology hears one "NEX").
  const active = useNexPlacement() === "page";
  return (
    <div
      data-nex-primary
      data-nex-slot={id}
      data-nex-slot-kind={poster ? "poster" : "roaming"}
      data-stage-anchor={active ? "nex" : undefined}
      data-nex-contain={contain}
      className={`relative ${className}`}
    >
      {poster && (
        <div data-nex-poster>
          <NexEmblem className="h-auto w-full" />
        </div>
      )}
      {active && (
        <button
          type="button"
          popoverTarget={NEX_MENU_ID}
          aria-label="NEX: open site navigation"
          aria-describedby={describedBy}
          className="nex-launcher absolute inset-[12%] cursor-pointer rounded-full"
          onPointerEnter={() => signalNex("hold", "pointer")}
          onPointerLeave={() => signalNex("release", "pointer")}
          onFocus={() => signalNex("hold", "focus")}
          onBlur={() => signalNex("release", "focus")}
          onClick={() => signalNex("pulse")}
        />
      )}
    </div>
  );
}
