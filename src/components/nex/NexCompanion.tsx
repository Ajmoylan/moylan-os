import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { announceNexAnchor, signalNex } from "~/lib/nex-events";
import { setNexMinimised, setNexPlacement, useNexPlacement } from "./placement";
import { NEX_MENU_ID } from "./NexSlot";

/** Share of the page's own NEX spot that must be in view for NEX to stay there (hysteresis). */
const STAY = 0.35;
const RETURN = 0.6;

/**
 * NEX's companion mode (launch sprint): NEX accompanies the visitor on every route and device.
 *
 * - **Director:** one IntersectionObserver watches the route's primary NEX spot
 *   (`[data-nex-primary]`): while enough of it is in view NEX is drawn there (full size on the
 *   homepage opening), otherwise he glides, shrinking, into the **dock**: a small fixed spot in the
 *   viewport's corner. Routes without a spot, or where it isn't laid out (narrow screens), use the
 *   dock. The stage follows whichever element carries `data-stage-anchor="nex"`, so this is pure DOM:
 *   one NEX, one renderer, the same glide as everywhere else.
 * - **Dock:** NEX is drawn in the persistent stage behind the page (he never covers content); the
 *   dock adds a real button over him (opens his navigation panel) and a small "minimise" button.
 *   Minimised, he fades away and a "Show NEX" pill brings him back. Nothing is stored.
 *
 * Shown only while the stage is drawing (CSS: no empty dock without WebGL or with motion Off).
 */
export function NexCompanion() {
  const placement = useNexPlacement();
  const { pathname } = useLocation();
  const first = useRef(true);

  // Director: the route's primary spot, or the dock.
  useEffect(() => {
    const spot = document.querySelector<HTMLElement>("[data-nex-primary]");
    const laidOut = spot !== null && spot.offsetWidth > 0 && spot.offsetHeight > 0;
    if (!laidOut || typeof IntersectionObserver !== "function") {
      setNexPlacement(laidOut ? "page" : "dock");
      return;
    }
    setNexPlacement("page");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        if (ratio >= RETURN) setNexPlacement("page");
        else if (ratio < STAY) setNexPlacement("dock");
      },
      { threshold: [0, STAY, RETURN, 1] },
    );
    observer.observe(spot);
    return () => observer.disconnect();
  }, [pathname]);

  // After the new anchor has committed, the stage looks it up (and NEX glides there).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    announceNexAnchor();
  }, [placement]);

  const docked = placement === "dock";
  return (
    <div className="nex-dock" data-nex-dock={placement}>
      <div
        data-nex-slot="dock"
        data-stage-anchor={docked ? "nex" : undefined}
        className="nex-dock-spot relative"
      >
        {/* The stage copies NEX into this while he is docked, above the page (CompanionMirror). */}
        <canvas
          data-nex-mirror
          data-active={docked ? "true" : "false"}
          aria-hidden="true"
          className="nex-dock-mirror"
        />
        {docked && (
          <button
            type="button"
            popoverTarget={NEX_MENU_ID}
            aria-label="NEX: open site navigation"
            className="nex-launcher absolute inset-[12%] cursor-pointer rounded-full"
            onPointerEnter={() => signalNex("hold")}
            onPointerLeave={() => signalNex("release")}
            onFocus={() => signalNex("hold")}
            onBlur={() => signalNex("release")}
            onClick={() => signalNex("pulse")}
          />
        )}
      </div>
      {placement === "hidden" ? (
        <button
          type="button"
          className="nex-dock-show"
          onClick={() => setNexMinimised(false, "dock")}
        >
          <span aria-hidden="true" className="nex-dock-dot" />
          Show NEX
        </button>
      ) : (
        docked && (
          <button
            type="button"
            className="nex-dock-hide"
            aria-label="Minimise NEX"
            onClick={() => setNexMinimised(true, "dock")}
          >
            <span aria-hidden="true">–</span>
          </button>
        )
      )}
    </div>
  );
}
