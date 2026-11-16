import { render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { NEX_INTRO } from "~/content/voice";
import Home from "./home";

function renderHome() {
  const Stub = createRoutesStub([{ path: "/", Component: Home }]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("Home (NEX)", () => {
  it("has a single h1 with Alex's name and the tagline", () => {
    renderHome();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alex Moylan");
    expect(screen.getByText(/Meet the mind behind them/)).toBeInTheDocument();
  });

  it("opens with NEX introducing itself, with captions, a voice control and the hint", () => {
    renderHome();
    const opening = screen.getByRole("region", { name: /Alex Moylan/ });
    // NEX's message as one NEX // TRANSMISSION: the whole text for assistive technology (once),
    // its typed visual layer hidden from it.
    expect(within(opening).getByText("NEX // TRANSMISSION")).toBeInTheDocument();
    expect(within(opening).getByText(NEX_INTRO, { selector: ".sr-only" })).toBeInTheDocument();
    expect(within(opening).getAllByText(NEX_INTRO)).toHaveLength(2);
    expect(within(opening).getAllByText(NEX_INTRO)[1]!.closest("[aria-hidden]")).not.toBeNull();
    expect(NEX_INTRO).toMatch(/^Hello\. I'm NEX\./);
    // The committed configuration is deliberately text-only (no licensed recording yet): the
    // introduction is complete as text, with no audio controls (NexVoice.test.tsx covers audio).
    expect(within(opening).queryByRole("button", { name: "Hear NEX" })).toBeNull();
    expect(opening.querySelector("audio")).toBeNull();
    // Both gesture words are in the DOM; CSS shows "Tap" on touch-first devices, "Click" elsewhere.
    expect(within(opening).getByText("Click NEX")).toHaveClass("nex-hint-pointer");
    expect(within(opening).getByText("Tap NEX")).toHaveClass("nex-hint-touch");
    // One NEX launcher, described by the hint, opening the site navigation panel.
    const launchers = screen.getAllByRole("button", { name: "NEX: open site navigation" });
    expect(launchers).toHaveLength(1);
    expect(launchers[0]).toHaveAttribute("popovertarget", "nex-menu");
    expect(launchers[0]).toHaveAccessibleDescription(/NEX to navigate\./);
    // A way past the introduction.
    expect(within(opening).getByRole("link", { name: /Scroll to explore/ })).toHaveAttribute(
      "href",
      "#intro",
    );
  });

  it("presents verified profile content and featured work with links to the code", () => {
    renderHome();
    expect(screen.getByText(/experience across HP, Microsoft and Meta/)).toBeInTheDocument();
    expect(screen.getByText("Microsoft Azure Fundamentals")).toBeInTheDocument();
    // A predicted result stays labelled predicted until it is awarded.
    expect(screen.getByText(/First-Class Honours predicted/)).toBeInTheDocument();
    expect(screen.queryByText(/graduate/i)).toBeNull();
    const work = screen.getByRole("region", { name: "Things I've built" });
    const code = within(work)
      .getAllByRole("link", { name: /View the code on GitHub/ })
      .map((link) => link.getAttribute("href"));
    expect(code.length).toBeGreaterThanOrEqual(3);
    for (const href of code) expect(href).toMatch(/^https:\/\/github\.com\/Ajmoylan\//);
  });

  it("offers the five approved pathways as real links", () => {
    renderHome();
    const section = screen.getByRole("region", { name: "Choose an environment" });
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Engineering", "/engineering"],
      ["AI & Machine Learning", "/ai"],
      ["Technology Advisory", "/advisory"],
      ["Cloud & Security", "/cloud-security"],
      ["All projects", "/projects"],
    ]);
  });

  it("describes the static NEX emblem for assistive technology", () => {
    renderHome();
    expect(screen.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeInTheDocument();
  });

  it("marks NEX's place for the stage and keeps the emblem as its static poster", () => {
    const { container } = renderHome();
    const anchor = container.querySelector('[data-stage-anchor="nex"]');
    expect(anchor).not.toBeNull();
    const poster = anchor?.querySelector("[data-nex-poster]");
    expect(poster?.querySelector("img")).toHaveAccessibleName(/NEX, the MOYLAN\/\/OS host/);
  });

  it("never renders inline style attributes (CSP)", () => {
    const { container } = renderHome();
    expect(container.querySelector("[style]")).toBeNull();
  });
});
