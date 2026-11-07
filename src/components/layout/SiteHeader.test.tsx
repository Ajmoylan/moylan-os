import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

function renderHeader(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteHeader />
    </MemoryRouter>,
  );
}

describe("SiteHeader", () => {
  it("renders the primary navigation with global access links", () => {
    renderHeader();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const label of ["Projects", "Experience", "About", "Contact", "CV"]) {
      expect(nav).toContainElement(screen.getAllByRole("link", { name: label })[0]!);
    }
  });

  it("marks the current page with aria-current", () => {
    renderHeader("/projects");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent("Projects");
  });

  it("opens and closes the mobile menu, returning focus on Escape", async () => {
    const user = userEvent.setup();
    renderHeader();
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const mobileNav = screen.getByRole("navigation", { name: "Mobile" });
    expect(mobileNav).toHaveAttribute("id", button.getAttribute("aria-controls"));

    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes the mobile menu after choosing a destination", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const mobileNav = screen.getByRole("navigation", { name: "Mobile" });
    await user.click(mobileNav.querySelector('a[href="/engineering"]')!);
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
