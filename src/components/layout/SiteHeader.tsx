import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import { agents, specialists } from "~/agents/registry";
import { primaryNav } from "~/content/site";
import { Wordmark } from "./Wordmark";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2 text-sm transition-colors hover:text-text ${
    isActive ? "text-text" : "text-text-muted"
  }`;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the mobile menu and returns focus to its button.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-steel/60 bg-obsidian/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Wordmark />

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

        <button
          ref={buttonRef}
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-steel px-3 text-sm text-text md:hidden"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" className="font-mono text-nex">
            {menuOpen ? "×" : "≡"}
          </span>
          Menu
        </button>
      </div>

      <nav
        id={menuId}
        aria-label="Mobile"
        hidden={!menuOpen}
        className="border-t border-steel/60 bg-obsidian px-4 pt-4 pb-6 md:hidden"
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
