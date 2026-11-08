import { render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
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

  it("introduces NEX in the first person with the approved line", () => {
    renderHome();
    expect(screen.getByText("I'm NEX, the host of this system.")).toBeInTheDocument();
    expect(
      screen.getByText("Welcome to MOYLAN//OS. What would you like to explore?"),
    ).toBeInTheDocument();
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
    expect(poster?.querySelector('[role="img"]')).toHaveAccessibleName(
      /NEX, the MOYLAN\/\/OS host/,
    );
  });

  it("never renders inline style attributes (CSP)", () => {
    const { container } = renderHome();
    expect(container.querySelector("[style]")).toBeNull();
  });
});
