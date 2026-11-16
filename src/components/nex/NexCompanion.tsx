import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { announceNexAnchor, signalNex } from "~/lib/nex-events";
import { setNexMinimised, setNexPlacement, useNexPlacement } from "./placement";
import { NEX_MENU_ID } from "./NexSlot";

/** How long a keyboard restore waits for NEX's launcher to be shown (he is drawn again first). */
const FOCUS_WAIT_MS = 3000;
/** NEX's launcher wherever he is now: the dock's, or the one beside a page heading. */
const ACTIVE_LAUNCHER = '[data-stage-anchor="nex"] .nex-launcher';

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
  /**
   * Keyboard focus across Minimise / Show NEX: each button disappears when pressed, so focus is moved
   * on deliberately to what replaces it, but only when the press didn't come from a pointer (mouse,
   * pen or touch): keyboard and screen-reader activation fire no pointer events.
   */
  const pointerPress = useRef(false);
  const focusNext = useRef<"show" | "launcher" | null>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const press = (minimise: boolean) => {
    focusNext.current = pointerPress.current ? null : minimise ? "show" : "launcher";
    pointerPress.current = false;
    setNexMinimised(minimise);
  };
  const onPointerDown = () => {
    pointerPress.current = true;
  };
  const onKeyDown = () => {
    pointerPress.current = false;
  };

  // Director: the route's primary spot, or the dock. Whether the spot is laid out is checked again
  // after viewport changes (a rotation between the narrow layout, where dedicated pages hide it, and
  // the wide one); only a change of that answer re-decides, so ordinary resizes move nothing.
  useEffect(() => {
    const spot = document.querySelector<HTMLElement>("[data-nex-primary]");
    const observable = typeof IntersectionObserver === "function";
    let observer: IntersectionObserver | null = null;
    let laidOut: boolean | null = null;
    const decide = (initial: boolean) => {
      const now = spot !== null && spot.offsetWidth > 0 && spot.offsetHeight > 0;
      if (now === laidOut) return;
      laidOut = now;
      observer?.disconnect();
      observer = null;
      if (!now || !observable) {
        setNexPlacement(now ? "page" : "dock");
        return;
      }
      // A route's own spot starts with NEX in it; after a layout change the observer's first report
      // places him (in view: the spot; scrolled away: he stays docked).
      if (initial) setNexPlacement("page");
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
          if (ratio >= RETURN) setNexPlacement("page");
          else if (ratio < STAY) setNexPlacement("dock");
        },
        { threshold: [0, STAY, RETURN, 1] },
      );
      observer.observe(spot!);
    };
    decide(true);
    const onResize = () => decide(false);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [pathname]);

  // After the new anchor has committed, the stage looks it up (and NEX glides there).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    announceNexAnchor();
  }, [placement]);

  useEffect(() => {
    const next = focusNext.current;
    if (next === "show" && placement === "hidden") {
      focusNext.current = null;
      showButton.current?.focus();
      return;
    }
    if (next !== "launcher" || placement === "hidden") return;
    focusNext.current = null;
    // NEX's launcher is shown once the stage draws him again (app.css): focus it then, unless the
    // visitor has already moved focus somewhere else.
    const started = performance.now();
    let frame = 0;
    const seek = () => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const launcher = document.querySelector<HTMLElement>(ACTIVE_LAUNCHER);
      if (launcher && launcher.getClientRects().length > 0) launcher.focus();
      else if (performance.now() - started < FOCUS_WAIT_MS) frame = requestAnimationFrame(seek);
    };
    frame = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(frame);
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
            onPointerEnter={() => signalNex("hold", "pointer")}
            onPointerLeave={() => signalNex("release", "pointer")}
            onFocus={() => signalNex("hold", "focus")}
            onBlur={() => signalNex("release", "focus")}
            onClick={() => signalNex("play")}
          />
        )}
      </div>
      {/* Distinct keys: one button never turns into the other (focus would silently stay on it). */}
      {placement === "hidden" ? (
        <button
          key="show"
          ref={showButton}
          type="button"
          className="nex-dock-show"
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onClick={() => press(false)}
        >
          <span aria-hidden="true" className="nex-dock-dot" />
          Show NEX
        </button>
      ) : (
        docked && (
          <button
            key="hide"
            type="button"
            className="nex-dock-hide"
            aria-label="Minimise NEX"
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onClick={() => press(true)}
          >
            <span aria-hidden="true">–</span>
          </button>
        )
      )}
    </div>
  );
}
