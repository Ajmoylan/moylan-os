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
/** The sections below the opening load separately: wait for one of them. */
const sectionsLoaded = () => screen.findByRole("region", { name: "Let's talk" });

/** [visible text, href]: external links' "(opens in a new tab)" note is left out. */
const hrefs = (links: HTMLElement[]) =>
  links.map((l) => [l.textContent!.replace(" (opens in a new tab)", ""), l.getAttribute("href")]);

describe("Home: the opening", () => {
  it("introduces Alex with one h1, his positioning and his background", () => {
    renderHome();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Alex Moylan$/);
    const opening = region("Alex Moylan");
    expect(within(opening).getByText("AI Technology Advisory")).toBeInTheDocument();
    expect(within(opening).getByText("Applied AI & Enterprise Solutions")).toBeInTheDocument();
    expect(opening).toHaveTextContent(
      /Enterprise technology experience across Microsoft, HP and Meta.*building AI agents, applications and practical software/,
    );
    expect(opening).toHaveTextContent(/BSc \(Hons\) Computing and IT \(Software\), completed 2026/);
    expect(opening).toHaveTextContent(/AZ-900/);
  });

  it("offers Meet Alex, My experience and Explore projects", () => {
    renderHome();
    const opening = region("Alex Moylan");
    expect(
      hrefs(
        within(opening).getAllByRole("link", { name: /Meet Alex|My experience|Explore projects/ }),
      ),
    ).toEqual([
      ["Meet Alex", "/about"],
      ["My experience", "/experience"],
      ["Explore projects", "#work"],
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
    expect(opening.querySelector("audio")).toBeNull();
  });

  it("NEX's guide is his own panel next to the orb, never inside it, and says it is scripted", () => {
    const { container } = renderHome();
    const guide = container.querySelector("#nex-guide") as HTMLElement;
    const slot = container.querySelector('[data-nex-slot="hero"]')!;
    expect(slot.contains(guide)).toBe(false);
    expect(within(guide).getByText("NEX // GUIDE")).toBeInTheDocument();
    expect(
      within(guide).getByText(GUIDE_START.message, { selector: ".sr-only" }),
    ).toBeInTheDocument();
    const choices = within(guide).getByRole("list", { name: "Choose where NEX takes you" });
    expect(
      within(choices)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      "Tell me about Alex",
      "I'm hiring",
      "Show me the work",
      "Explore the agents",
      "How do I contact Alex?",
    ]);
    expect(guide).toHaveTextContent(/Scripted guide: NEX follows a hand-written script/);
  });

  it("NEX's dialogue changes with each choice and leads to the right content", async () => {
    const user = userEvent.setup();
    const { container } = renderHome();
    const guide = () => container.querySelector("#nex-guide") as HTMLElement;
    const choices = () => within(within(guide()).getByRole("list"));
    const said = (text: RegExp) => within(guide()).findByText(text, { selector: ".sr-only" });

    await user.click(choices().getByRole("button", { name: "Tell me about Alex" }));
    expect(await said(/HP, Microsoft \(SureStep\) and Meta/)).toBeInTheDocument();
    expect(choices().getByRole("link", { name: "Meet Alex" })).toHaveAttribute("href", "/about");
    expect(choices().getByRole("link", { name: "My experience" })).toHaveAttribute(
      "href",
      "/experience",
    );
    await waitFor(() => expect(guide().querySelector(".nex-guide-message")).toHaveFocus());

    await user.click(choices().getByRole("button", { name: "Start over" }));
    await user.click(await choices().findByRole("button", { name: "I'm hiring" }));
    expect(await said(/Microsoft \(SureStep\), HP and Meta/)).toBeInTheDocument();
    expect(choices().getByRole("link", { name: "View experience" })).toHaveAttribute(
      "href",
      "/experience",
    );
    expect(choices().getByRole("link", { name: "Download CV" })).toHaveAttribute("download");

    await user.click(choices().getByRole("button", { name: "Show me the work" }));
    expect(await said(/two live demos/)).toBeInTheDocument();
    expect(choices().getByRole("link", { name: /Open COPILOT \/\/ LAUNCHPAD/ })).toHaveAttribute(
      "href",
      "https://ajmoylan.github.io/copilot-launchpad/",
    );

    await user.click(choices().getByRole("button", { name: "Start over" }));
    await user.click(await choices().findByRole("button", { name: "Explore the agents" }));
    expect(await said(/interactive experiences are still to come/)).toBeInTheDocument();
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
  });

  it("describes the static NEX emblem and keeps it as the stage's poster", () => {
    const { container } = renderHome();
    expect(screen.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeInTheDocument();
    const anchor = container.querySelector('[data-stage-anchor="nex"]');
    expect(anchor?.querySelector("[data-nex-poster] img")).toHaveAccessibleName(
      /NEX, the MOYLAN\/\/OS host/,
    );
  });
});

describe("Home: the story below the opening", () => {
  it("offers three visitor pathways that need no knowledge of the agents", async () => {
    renderHome();
    await sectionsLoaded();
    const paths = region("What brings you here?");
    const cards = within(paths).getAllByRole("article");
    expect(cards.map((c) => c.querySelector(".os-label")?.textContent)).toEqual([
      "I'm hiring",
      "Show me the work",
      "Explore the agents",
    ]);
    expect(within(cards[0]!).getByRole("link", { name: "My experience" })).toHaveAttribute(
      "href",
      "/experience",
    );
    expect(
      within(cards[1]!).getByRole("link", { name: /COPILOT \/\/ LAUNCHPAD demo/ }),
    ).toHaveAttribute("href", "https://ajmoylan.github.io/copilot-launchpad/");
    expect(within(cards[2]!).getByRole("link", { name: "Meet the agents" })).toHaveAttribute(
      "href",
      "#agents",
    );
  });

  it("tells Alex's career as a connected timeline, true to the CV", async () => {
    renderHome();
    await sectionsLoaded();
    const career = within(region("Enterprise technology, then applied AI")).getByRole("list", {
      name: "Career, in order",
    });
    const steps = within(career).getAllByRole("listitem");
    expect(steps.map((s) => within(s).getByRole("heading").textContent)).toEqual([
      "Hewlett-Packard",
      "Microsoft · SureStep",
      "Meta",
      "Applied AI & software",
    ]);
    expect(steps[0]).toHaveTextContent("2018–2019");
    expect(steps[0]).toHaveTextContent("Innovation Manager and Customer Experience Centre Lead");
    expect(steps[1]).toHaveTextContent("2019–2022");
    expect(steps[1]).toHaveTextContent("Business Development Manager, Indirect Channel");
    expect(steps[1]).toHaveTextContent(/Microsoft partner ecosystem and reseller enablement/);
    expect(steps[1]).toHaveTextContent("1,000+ reseller partners supported");
    expect(steps[2]).toHaveTextContent("Market Manager, Reality Labs");
    expect(steps[3]).toHaveTextContent(/completed 2026, First-Class Honours expected/);
    expect(steps[3]).toHaveTextContent(/AZ-900/);
  });

  it("gives all four featured projects the same treatment and clear actions", async () => {
    renderHome();
    await sectionsLoaded();
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
    // Identical card styling for every project.
    expect(new Set(items.map((li) => li.className)).size).toBe(1);
    expect(items.every((li) => li.classList.contains("os-glow-card"))).toBe(true);
    expect(hrefs(within(items[0]!).getAllByRole("link"))).toEqual([
      ["Open live demo", "https://ajmoylan.github.io/copilot-launchpad/"],
      ["Code on GitHub", "https://github.com/Ajmoylan/copilot-launchpad"],
    ]);
    expect(hrefs(within(items[2]!).getAllByRole("link"))).toEqual([
      ["View the code", "https://github.com/Ajmoylan/ai-agent"],
    ]);
    // The MRI project's code isn't public: no invented repository, just its overview.
    expect(within(items[3]!).getByText("Completed · not yet public")).toBeInTheDocument();
    expect(within(items[3]!).getByText("Source code not public")).toBeInTheDocument();
    expect(hrefs(within(items[3]!).getAllByRole("link"))).toEqual([
      ["Read the overview", "/projects"],
    ]);
  });

  it("introduces the four specialist agents without claiming unfinished capabilities", async () => {
    renderHome();
    await sectionsLoaded();
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

  it("gives working contact actions and selectable details with copy buttons", async () => {
    renderHome();
    const contact = await sectionsLoaded();
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

  it("never renders inline style attributes (CSP)", async () => {
    const { container } = renderHome();
    await sectionsLoaded();
    expect(container.querySelector("[style]")).toBeNull();
  });
});
