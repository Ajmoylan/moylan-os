import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import { agents, specialists } from "~/agents/registry";
import { primaryNav } from "~/content/site";
import { MotionControl } from "./MotionControl";
import { Wordmark } from "./Wordmark";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2 text-sm transition-colors hover:text-text ${
    isActive ? "text-text" : "text-text-muted"
  }`;

/** At most one header disclosure is open at a time (no overlapping panels on small screens). */
type HeaderDisclosure = "menu" | "motion" | null;

export function SiteHeader() {
  const [disclosure, setDisclosure] = useState<HeaderDisclosure>(null);
  const menuOpen = disclosure === "menu";
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Opening Motion closes the menu; Motion closing never closes a menu opened in the meantime.
  const onMotionOpenChange = useCallback(
    (open: boolean) =>
      setDisclosure((current) => (open ? "motion" : current === "motion" ? null : current)),
    [],
  );

  // Escape closes the mobile menu and returns focus to its button.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDisclosure(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // Enlarged text (browser font-size settings) can make the header's controls wrap onto a second
  // row on narrow screens. Track the row's real height so the disclosure panels size themselves
  // to the space actually left below it (`--os-header-row`, read in app.css), and mark a wrapped
  // header so it stops being sticky and can't cover a large part of the viewport.
  // Writes are CSSOM/attribute updates on resize only (allowed by the CSP; no React re-render).
  useEffect(() => {
    const header = headerRef.current;
    const row = rowRef.current;
    if (!header || !row || typeof ResizeObserver !== "function") return;
    const update = () => {
      header.style.setProperty("--os-header-row", `${row.offsetHeight}px`);
      const first = row.firstElementChild as HTMLElement | null;
      const last = row.lastElementChild as HTMLElement | null;
      const wrapped = !!first && !!last && last.offsetTop >= first.offsetTop + first.offsetHeight;
      header.toggleAttribute("data-wrapped", wrapped);
    };
    const observer = new ResizeObserver(update);
    observer.observe(row);
    update();
    return () => {
      observer.disconnect();
      header.style.removeProperty("--os-header-row");
      header.removeAttribute("data-wrapped");
    };
  }, []);

  const closeMenu = () => setDisclosure(null);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-steel/60 bg-obsidian/80 backdrop-blur-md data-wrapped:relative"
    >
      <div
        ref={rowRef}
        className="relative mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:gap-x-6 sm:px-6 lg:px-8"
      >
        <Wordmark />

        <div className="ml-auto flex items-center gap-2 md:gap-4">
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-3 lg:gap-5">
              {primaryNav.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={navLinkClass}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <Link
                  to="/about#cv"
                  className="inline-flex min-h-11 items-center rounded-full border border-nex/50 px-5 text-sm text-nex transition-colors hover:border-nex hover:bg-nex/10"
                >
                  CV
                </Link>
              </li>
            </ul>
          </nav>

          <MotionControl open={disclosure === "motion"} onOpenChange={onMotionOpenChange} />

          <button
            ref={buttonRef}
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-steel px-3 text-sm text-text md:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setDisclosure((current) => (current === "menu" ? null : "menu"))}
          >
            <span aria-hidden="true" className="font-mono text-nex">
              {menuOpen ? "×" : "≡"}
            </span>
            {/* Icon only when the label can't fit (below 10.5rem: e.g. 200% text on a 320px
                screen; never at normal text sizes). The accessible name stays "Menu". */}
            <span className="max-[10.5rem]:sr-only">Menu</span>
          </button>
        </div>
      </div>

      <nav
        id={menuId}
        aria-label="Mobile"
        hidden={!menuOpen}
        className="os-header-panel os-header-panel-scroll os-mobile-menu border-t border-steel/60 bg-obsidian px-4 pt-4 pb-6 md:hidden"
      >
        <p className="os-label">Environments</p>
        <ul className="mt-2 grid grid-cols-2 gap-1">
          {[agents.nex, ...specialists].map((agent) => (
            <li key={agent.id} data-agent={agent.id}>
              <NavLink
                to={agent.route}
                onClick={closeMenu}
                className="flex min-h-11 items-center gap-2 rounded-md px-2 text-text-muted hover:text-text aria-[current=page]:text-text"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-(--accent)" />
                {agent.id === "nex" ? "Home" : agent.domain}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="mt-5 os-label">Site</p>
        <ul className="mt-2 grid grid-cols-2 gap-1">
          {primaryNav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={closeMenu}
                className="flex min-h-11 items-center rounded-md px-2 text-text-muted hover:text-text aria-[current=page]:text-text"
              >
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <Link
              to="/about#cv"
              onClick={closeMenu}
              className="flex min-h-11 items-center rounded-md px-2 text-nex"
            >
              CV
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
