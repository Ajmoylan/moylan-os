import { useRef, type SyntheticEvent } from "react";
import { Link } from "react-router";
import { agents, specialists } from "~/agents/registry";
import { site } from "~/content/site";
import { signalNex } from "~/lib/nex-events";
import { NEX_MENU_ID } from "./NexSlot";

const destinations = [
  { label: "Home", to: "/", note: "The MOYLAN//OS overview" },
  { label: "Projects", to: "/projects", note: "Everything I've built, with status" },
  { label: "Experience", to: "/experience", note: "Roles and achievements" },
  ...specialists.map((agent) => ({ label: agent.domain, to: agent.route, note: agent.summary })),
  { label: "About", to: "/about", note: "Background and education" },
  { label: "Contact", to: "/contact", note: "Get in touch" },
] as const;

/**
 * NEX's compact navigation panel (launch sprint), opened by activating NEX (any `NexSlot`
 * launcher). One instance for the whole site, in the shell. It is a native popover: it sits above
 * the page, Escape or an outside click closes it, and focus returns to the launcher. Opening moves
 * focus to the first destination. Plain links: the same pages as the header and footer, so nothing
 * depends on NEX.
 */
export function NexMenu() {
  const panel = useRef<HTMLDivElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  const onToggle = (event: SyntheticEvent<HTMLDivElement>) => {
    const { newState } = event.nativeEvent as ToggleEvent;
    if (newState === "open") firstLink.current?.focus();
  };
  const choose = () => {
    signalNex("pulse");
    panel.current?.hidePopover?.();
  };
  const { links } = site;

  return (
    <div
      ref={panel}
      id={NEX_MENU_ID}
      popover="auto"
      aria-labelledby="nex-menu-title"
      role="dialog"
      onToggle={onToggle}
      className="nex-menu m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-[14px] border border-steel bg-abyss p-5 text-text shadow-2xl sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="os-label text-nex">{agents.nex.name} // Navigate</p>
          <h2 id="nex-menu-title" className="mt-2 text-xl font-semibold tracking-tight">
            Where would you like to go?
          </h2>
        </div>
        <button
          type="button"
          popoverTarget={NEX_MENU_ID}
          popoverTargetAction="hide"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-steel text-sm text-text-muted hover:text-text"
        >
          <span aria-hidden="true">✕</span>
          <span className="sr-only">Close navigation</span>
        </button>
      </div>
      <nav aria-labelledby="nex-menu-title" className="mt-4">
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {destinations.map((item, index) => (
            <li key={item.to}>
              <Link
                ref={index === 0 ? firstLink : undefined}
                to={item.to}
                onClick={choose}
                className="flex min-h-11 flex-col justify-center rounded-md px-3 py-2 transition-colors hover:bg-steel/40"
              >
                <span className="font-medium">{item.label}</span>
                <span className="line-clamp-1 text-xs text-text-muted">{item.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {(links.cv || links.linkedin || links.github) && (
        <ul className="mt-4 flex flex-wrap gap-2 border-t border-steel pt-4 text-sm">
          {links.cv && (
            <li>
              <a
                href={links.cv}
                className="inline-flex min-h-11 items-center rounded-full border border-steel px-4 hover:border-nex/60"
              >
                Download CV
              </a>
            </li>
          )}
          {links.linkedin && (
            <li>
              <a
                href={links.linkedin}
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border border-steel px-4 hover:border-nex/60"
              >
                LinkedIn
              </a>
            </li>
          )}
          {links.github && (
            <li>
              <a
                href={links.github}
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border border-steel px-4 hover:border-nex/60"
              >
                GitHub
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
