import { useEffect, useId, useRef, useSyncExternalStore, type FocusEvent } from "react";
import { motionSettings, type EffectiveMotion, type MotionSetting } from "~/motion/policy";
import {
  setMotionSetting,
  useEffectiveMotion,
  useMotionSetting,
  useSystemPrefersReduced,
} from "~/motion/store";

const settingLabels: Record<MotionSetting, string> = {
  system: "System",
  full: "Full",
  reduced: "Reduced",
  off: "Off",
};

const effectiveLabels: Record<EffectiveMotion, string> = {
  full: "Full",
  reduced: "Reduced",
  off: "Off",
};

const descriptions: Record<Exclude<MotionSetting, "system">, string> = {
  full: "All animation and pointer effects your device supports.",
  reduced: "Minimal movement. No pointer-driven effects.",
  off: "No decorative animation. The static design only.",
};

const noopSubscribe = () => () => {};

/**
 * Keep the whole option row (name and description) visible when its radio receives focus, e.g.
 * with arrow keys inside a panel that scrolls on a short viewport. The browser only guarantees
 * the small radio itself is scrolled into view.
 */
function revealRow(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.closest("label")?.scrollIntoView?.({ block: "nearest" });
}

/** False in the prerendered HTML and during hydration; true once the app is interactive. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Three signal bars: all lit for full motion, one for reduced, none for off. */
function MotionGlyph({ motion }: { motion: EffectiveMotion }) {
  return (
    <svg
      className="os-motion-glyph"
      data-motion={motion}
      viewBox="0 0 14 14"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="8" width="3" height="5" rx="0.5" />
      <rect x="5.5" y="5" width="3" height="8" rx="0.5" />
      <rect x="10" y="2" width="3" height="11" rx="0.5" />
    </svg>
  );
}

/**
 * Visible motion control (ARCHITECTURE §10, DESIGN-BRIEF §8).
 *
 * A disclosure button in the header opens a panel with a native radio group (System / Full /
 * Reduced / Off), so keyboard behaviour is the platform's own: Tab into the group, arrow keys to
 * choose. Escape, focus leaving the control or a click outside closes the panel; Escape returns
 * focus to the button.
 *
 * The control needs JavaScript, so in the prerendered HTML it is present but invisible and
 * disabled (space is reserved, so there's no layout shift). Without JavaScript there is no
 * decorative animation to control, and CSS still follows the OS preference.
 *
 * Open state is controlled by the header (SiteHeader), which allows only one header disclosure
 * open at a time: opening Motion closes the mobile menu and vice versa.
 *
 * On short viewports (landscape phones, zoomed layouts) the panel's height is capped to the
 * space below the header and its contents scroll internally (`.os-header-panel` in app.css).
 * Focusing an option scrolls its whole row into view.
 *
 * It subscribes to three primitive store slices only; nothing here changes per frame.
 */
export function MotionControl({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setting = useMotionSetting();
  const effective = useEffectiveMotion();
  const systemPrefersReduced = useSystemPrefersReduced();
  const hydrated = useHydrated();

  const panelId = useId();
  const groupName = useId();
  const optionId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      const focusWasInside =
        !active || active === document.body || rootRef.current?.contains(active);
      onOpenChange(false);
      if (focusWasInside) buttonRef.current?.focus();
    };
    // A click or focus move outside the control closes the panel (without moving focus).
    const onOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open, onOpenChange]);

  const following = setting === "system";
  // Starts with the visible word "Motion" (WCAG 2.5.3 Label in Name), then the state.
  const label = `Motion: ${settingLabels[setting]}${following ? `, ${effectiveLabels[effective]}` : ""}`;
  const summary = following
    ? `${settingLabels[setting]} · ${effectiveLabels[effective]}`
    : settingLabels[setting];
  const systemDescription = `Follow your device setting (currently ${
    systemPrefersReduced ? "reduced" : "full"
  } motion).`;

  return (
    // Not positioned itself: the panel anchors to the header's content container (SiteHeader), so
    // its width can be capped to the viewport rather than to the button's position.
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`os-motion-trigger inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-steel px-3 text-sm text-text transition-colors hover:border-nex/60 ${
          hydrated ? "" : "invisible"
        }`}
        disabled={!hydrated}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        <MotionGlyph motion={effective} />
        {/* Below 360px (e.g. 1280px at 400% zoom) only the glyph shows, so the header never
            scrolls sideways; the accessible name still starts with "Motion". */}
        <span className="max-[22.5rem]:sr-only">Motion</span>{" "}
        <span aria-hidden="true" className="hidden font-mono text-xs text-text-muted lg:inline">
          {summary}
        </span>
      </button>

      {/* Opaque surface: the header's own backdrop-filter stops a nested panel from blurring the
          page behind it, so a translucent panel would let page text show through. */}
      <div
        id={panelId}
        hidden={!open}
        className="os-panel os-brackets os-header-panel os-motion-panel absolute top-full z-50 mt-2 flex flex-col bg-gunmetal shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]"
      >
        {/* The inner element scrolls, so the corner brackets stay pinned to the panel's edges. */}
        <div className="os-header-panel-scroll p-4">
          <fieldset>
            <legend className="os-label">
              <span aria-hidden="true">{"// "}</span>
              Motion
            </legend>
            <div className="mt-3 grid gap-1">
              {motionSettings.map((value) => {
                const nameId = `${optionId}-${value}-name`;
                const descriptionId = `${optionId}-${value}-description`;
                return (
                  <label
                    key={value}
                    className="grid min-h-11 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 rounded-md px-2 py-2 hover:bg-steel/40 has-checked:bg-steel/60"
                  >
                    <input
                      type="radio"
                      name={groupName}
                      value={value}
                      checked={setting === value}
                      onChange={() => setMotionSetting(value)}
                      onFocus={revealRow}
                      aria-labelledby={nameId}
                      aria-describedby={descriptionId}
                      className="row-span-2 mt-1 size-4 accent-(--accent)"
                    />
                    <span id={nameId} className="text-sm text-text">
                      {settingLabels[value]}
                    </span>
                    <span id={descriptionId} className="text-xs text-text-muted">
                      {value === "system" ? systemDescription : descriptions[value]}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-4 border-t border-steel pt-3 font-mono text-xs text-text-muted">
            In effect: <strong className="text-text">{effectiveLabels[effective]}</strong>
            {following ? " · following your device" : " · your choice"}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Not saved. This applies until you reload or leave the site.
          </p>
        </div>
      </div>
    </div>
  );
}
