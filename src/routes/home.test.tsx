import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { GUIDE_START } from "~/content/nex-guide-start";
import Home from "./home";

function renderHome() {
  const Stub = createRoutesStub([{ path: "/", Component: Home }]);
  return render(<Stub initialEntries={["/"]} />);
}

const region = (name: string | RegExp) => screen.getByRole("region", { name });
/** [visible text, href]: external links' "(opens in a new tab)" note is left out. */
const hrefs = (links: HTMLElement[]) =>
  links.map((l) => [l.textContent!.replace(" (opens in a new tab)", ""), l.getAttribute("href")]);

describe("Home", () => {
  it("introduces Alex with one h1 and his professional positioning", () => {
    renderHome();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Alex Moylan$/);
    const opening = region("Alex Moylan");
    expect(within(opening).getByText("AI Technology Advisory")).toBeInTheDocument();
    expect(within(opening).getByText("Applied AI & Enterprise Solutions")).toBeInTheDocument();
    expect(
      within(opening).getByText(/experience across Microsoft, HP and Meta/),
    ).toBeInTheDocument();
    expect(
      hrefs(within(opening).getAllByRole("link", { name: /View projects|Download CV|^Contact$/ })),
    ).toEqual([
      ["View projects", "#work"],
      ["Download CV (PDF)", "/cv/Alex_Moylan_CV.pdf"],
      ["Contact", "#contact"],
    ]);
  });

  it("keeps NEX in the opening, with one launcher described by its hint", () => {
    renderHome();
    const opening = region("Alex Moylan");
    const launchers = screen.getAllByRole("button", { name: "NEX: open site navigation" });
    expect(launchers).toHaveLength(1);
    expect(launchers[0]).toHaveAttribute("popovertarget", "nex-menu");
    expect(launchers[0]).toHaveAccessibleDescription(/NEX to open the site menu\./);
    expect(within(opening).getByText("Click NEX")).toHaveClass("nex-hint-pointer");
    expect(within(opening).getByText("Tap NEX")).toHaveClass("nex-hint-touch");
    // Text-only production configuration: no audio controls.
    expect(opening.querySelector("audio")).toBeNull();
  });

  it("NEX greets the visitor in his guide, beside the orb, and says it is scripted", () => {
    const { container } = renderHome();
    const guide = container.querySelector("#nex-guide")!;
    // The guide follows NEX's slot in the opening (beneath it), never inside it.
    const slot = container.querySelector('[data-nex-slot="hero"]')!;
    expect(slot.contains(guide)).toBe(false);
    expect(slot.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(guide as HTMLElement).getByText("NEX // GUIDE")).toBeInTheDocument();
    expect(
      within(guide as HTMLElement).getByText(GUIDE_START.message, { selector: ".sr-only" }),
    ).toBeInTheDocument();
    const choices = within(guide as HTMLElement).getByRole("list", {
      name: "Choose where NEX takes you",
    });
    expect(
      within(choices)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["I'm hiring", "Show me the work", "Explore the agents", "How do I contact Alex?"]);
    expect(guide).toHaveTextContent(/Scripted guide: NEX follows a hand-written script/);
  });

  it("NEX's dialogue changes with each choice and leads to the right content", async () => {
    const user = userEvent.setup();
    const { container } = renderHome();
    const guide = () => container.querySelector("#nex-guide") as HTMLElement;
    const choices = () => within(within(guide()).getByRole("list"));

    await user.click(choices().getByRole("button", { name: "I'm hiring" }));
    expect(
      await within(guide()).findByText(/Microsoft, HP and Meta/, { selector: ".sr-only" }),
    ).toBeInTheDocument();
    expect(choices().getByRole("link", { name: "View experience" })).toHaveAttribute(
      "href",
      "/experience",
    );
    expect(choices().getByRole("link", { name: "Download CV" })).toHaveAttribute("download");

    await user.click(choices().getByRole("button", { name: "Show me the work" }));
    expect(
      await within(guide()).findByText(/two live demos/, { selector: ".sr-only" }),
    ).toBeInTheDocument();
    expect(choices().getByRole("link", { name: /Open COPILOT \/\/ LAUNCHPAD/ })).toHaveAttribute(
      "href",
      "https://ajmoylan.github.io/copilot-launchpad/",
    );
    expect(choices().getByRole("link", { name: /Open Repo Posture/ })).toHaveAttribute(
      "href",
      "https://ajmoylan.github.io/repo-posture/",
    );

    await user.click(choices().getByRole("button", { name: "Start over" }));
    await user.click(await choices().findByRole("button", { name: "Explore the agents" }));
    expect(
      await within(guide()).findByText(/interactive experiences are still to come/, {
        selector: ".sr-only",
      }),
    ).toBeInTheDocument();
    expect(hrefs(choices().getAllByRole("link"))).toEqual([
      ["FORGE · Engineering", "/engineering"],
      ["SYN · AI & ML", "/ai"],
      ["ATLAS · Advisory", "/advisory"],
      ["CIPHER · Cloud & Security", "/cloud-security"],
    ]);

    await user.click(choices().getByRole("button", { name: "Start over" }));
    await user.click(await choices().findByRole("button", { name: "How do I contact Alex?" }));
    expect(await choices().findByRole("link", { name: "Call +47 489 01 849" })).toHaveAttribute(
      "href",
      "tel:+4748901849",
    );
    expect(choices().getByRole("link", { name: "Email Alex" })).toHaveAttribute(
      "href",
      "mailto:alex@moylanos.dev",
    );
    expect(choices().getByRole("link", { name: "Contact page" })).toHaveAttribute(
      "href",
      "/contact",
    );
    // Focus follows NEX's reply, for keyboard and screen-reader users.
    await waitFor(() => expect(guide().querySelector(".nex-guide-message")).toHaveFocus());
  });

  it("shows the credibility strip: Microsoft, HP, Meta and AZ-900", () => {
    renderHome();
    const strip = region("Experience and credentials");
    for (const name of ["Microsoft", "HP", "Meta", "Azure Fundamentals"]) {
      expect(within(strip).getByText(name)).toBeInTheDocument();
    }
    expect(within(strip).getByText(/AZ-900/)).toBeInTheDocument();
  });

  it("offers three visitor pathways that need no knowledge of the agents", () => {
    renderHome();
    const paths = region("What brings you here?");
    const cards = within(paths).getAllByRole("article");
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual([
      "Experience and capabilities",
      "Projects and live demos",
      "Specialist areas",
    ]);
    expect(cards.map((c) => c.querySelector(".os-label")?.textContent)).toEqual([
      "I'm hiring",
      "Show me the work",
      "Explore the agents",
    ]);
    expect(within(cards[0]!).getByRole("link", { name: /Experience/ })).toHaveAttribute(
      "href",
      "/experience",
    );
    expect(
      within(cards[1]!).getByRole("link", { name: /COPILOT \/\/ LAUNCHPAD demo/ }),
    ).toHaveAttribute("href", "https://ajmoylan.github.io/copilot-launchpad/");
    expect(within(cards[2]!).getByRole("link", { name: /Meet the agents/ })).toHaveAttribute(
      "href",
      "#agents",
    );
  });

  it("features the four projects, live demos first, with honest links", () => {
    renderHome();
    const work = region("Things I've built");
    const items = within(work)
      .getAllByRole("listitem")
      .filter((li) => li.querySelector("h3"));
    expect(items.map((li) => li.querySelector("h3")!.textContent)).toEqual([
      "COPILOT // LAUNCHPAD",
      "Repo Posture",
      "AI Coding Agent",
      "Medical Image Segmentation for MRI",
    ]);
    expect(items.slice(0, 2).every((li) => li.classList.contains("os-feature"))).toBe(true);
    expect(hrefs(within(items[0]!).getAllByRole("link"))).toEqual([
      ["Open live demo", "https://ajmoylan.github.io/copilot-launchpad/"],
      ["Code on GitHub", "https://github.com/Ajmoylan/copilot-launchpad"],
    ]);
    expect(within(items[0]!).getByText(/fictional data/)).toBeInTheDocument();
    expect(hrefs(within(items[2]!).getAllByRole("link"))).toEqual([
      ["Code on GitHub", "https://github.com/Ajmoylan/ai-agent"],
    ]);
    // The MRI project's code isn't public: no invented repository, just the Projects page.
    expect(within(items[3]!).getByText("Completed · not yet public")).toBeInTheDocument();
    expect(hrefs(within(items[3]!).getAllByRole("link"))).toEqual([
      ["Details on the Projects page", "/projects"],
    ]);
  });

  it("introduces the four specialist agents without claiming unfinished capabilities", () => {
    renderHome();
    const agents = region("Explore the agents");
    expect(hrefs(within(agents).getAllByRole("link"))).toEqual([
      ["Engineering", "/engineering"],
      ["AI & Machine Learning", "/ai"],
      ["Technology Advisory", "/advisory"],
      ["Cloud & Security", "/cloud-security"],
    ]);
    expect(
      within(agents).getByText(/interactive experiences are planned for a later phase/),
    ).toBeInTheDocument();
  });

  it("gives working contact actions and selectable details with copy buttons", () => {
    renderHome();
    const contact = region("Let's talk");
    expect(within(contact).getByRole("link", { name: "Call me" })).toHaveAttribute(
      "href",
      "tel:+4748901849",
    );
    expect(within(contact).getByRole("link", { name: "Email me" })).toHaveAttribute(
      "href",
      "mailto:alex@moylanos.dev",
    );
    expect(within(contact).getByRole("link", { name: "Download CV (PDF)" })).toHaveAttribute(
      "download",
    );
    expect(within(contact).getByText("+47 489 01 849")).toBeInTheDocument();
    expect(within(contact).getByText("alex@moylanos.dev")).toBeInTheDocument();
    expect(within(contact).getByRole("button", { name: /Copy telephone/ })).toBeInTheDocument();
    expect(within(contact).getByRole("button", { name: /Copy email/ })).toBeInTheDocument();
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
