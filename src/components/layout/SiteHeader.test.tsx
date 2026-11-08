import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { resetMotionStore } from "~/motion/store";
import { SiteHeader } from "./SiteHeader";

function renderHeader(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteHeader />
    </MemoryRouter>,
  );
}

beforeEach(() => resetMotionStore());

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

  describe("header disclosures never overlap", () => {
    const menuButton = () => screen.getByRole("button", { name: "Menu" });
    const motionButton = () => screen.getByRole("button", { name: /^Motion/ });

    it("opening Motion closes the mobile menu, and opening the menu closes Motion", async () => {
      const user = userEvent.setup();
      renderHeader();

      await user.click(menuButton());
      expect(menuButton()).toHaveAttribute("aria-expanded", "true");

      await user.click(motionButton());
      expect(motionButton()).toHaveAttribute("aria-expanded", "true");
      expect(menuButton()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument();

      await user.click(menuButton());
      expect(menuButton()).toHaveAttribute("aria-expanded", "true");
      expect(motionButton()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("group", { name: "Motion" })).not.toBeInTheDocument();
    });

    it("does the same from the keyboard, and Escape returns focus to the open one's button", async () => {
      const user = userEvent.setup();
      renderHeader();

      motionButton().focus();
      await user.keyboard("{Enter}");
      expect(motionButton()).toHaveAttribute("aria-expanded", "true");

      menuButton().focus();
      await user.keyboard("{Enter}");
      expect(menuButton()).toHaveAttribute("aria-expanded", "true");
      expect(motionButton()).toHaveAttribute("aria-expanded", "false");

      await user.keyboard("{Escape}");
      expect(menuButton()).toHaveAttribute("aria-expanded", "false");
      expect(menuButton()).toHaveFocus();

      motionButton().focus();
      await user.keyboard("{Enter}");
      await user.keyboard("{Escape}");
      expect(motionButton()).toHaveAttribute("aria-expanded", "false");
      expect(motionButton()).toHaveFocus();
      expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    });
  });
});
