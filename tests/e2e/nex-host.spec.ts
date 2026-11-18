import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * NEX as the site's host (launch sprint): activating NEX opens its navigation panel; NEX moves
 * between homepage sections and accompanies the visitor to dedicated pages. Everything works with
 * the keyboard and without WebGL.
 */

const stage = (page: Page) => page.locator(".os-stage");
const panel = (page: Page) => page.locator("#nex-menu");
const launcher = (page: Page) =>
  page
    .locator('[data-stage-anchor="nex"]')
    .getByRole("button", { name: "NEX: open site navigation" });
const activeSlot = (page: Page) =>
  page.locator('[data-stage-anchor="nex"]').getAttribute("data-nex-slot");

/** Wide screens (lg, 64rem): NEX's heading spots are laid out and the opening keeps him in view. */
const wide = (page: Page) => page.viewportSize()!.width >= 1024;

async function open(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
}

test.describe("with WebGL2 and full motion", () => {
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
  });

  test("activating NEX opens its navigation panel; Escape closes it and returns focus", async ({
    page,
  }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await launcher(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole("link", { name: /^Home/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    // Focus returns to NEX's button (keyboard activation: Safari doesn't focus buttons on click).
    await launcher(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await expect(
      panel(page).getByRole("navigation", { name: "Where would you like to go?" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(launcher(page)).toBeFocused();
  });

  test("keyboard: NEX is reachable, and a destination chosen in its panel navigates", async ({
    page,
  }) => {
    await open(page);
    await launcher(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await panel(page)
      .getByRole("link", { name: /^Projects/ })
      .click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(panel(page)).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    await expect(page.locator("canvas:not([data-nex-mirror])")).toHaveCount(1);
  });

  test("companion mode: full size at the opening, docked once scrolled, back again", async ({
    page,
  }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    expect(await activeSlot(page)).toBe("hero");
    await page.locator("#work-title").evaluate((el) => el.scrollIntoView());
    await expect.poll(() => activeSlot(page)).toBe("dock");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(page.locator("canvas[data-nex-mirror]")).toHaveAttribute("data-active", "true");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => activeSlot(page)).toBe("hero");
    await expect(page.locator("canvas[data-nex-mirror]")).toHaveAttribute("data-active", "false");
  });

  test("long pages without NEX positions: NEX stays docked and tappable at the top, middle and end", async ({
    page,
  }) => {
    await open(page, "/engineering");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    // Wide screens start beside the heading; narrow screens (no heading spot) in the dock.
    expect(await activeSlot(page)).toBe(wide(page) ? "page" : "dock");
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (const fraction of [0.5, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * fraction));
      await expect.poll(() => activeSlot(page)).toBe("dock");
      await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
      // NEX's button is the topmost element at the dock's centre: no card can cover it.
      const topmost = await page.locator('[data-nex-slot="dock"]').evaluate((spot) => {
        const box = spot.getBoundingClientRect();
        return document
          .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          ?.classList.contains("nex-launcher");
      });
      expect(topmost).toBe(true);
    }
    await page.locator("[data-nex-dock] .nex-launcher").click();
    await expect(page.locator("#nex-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    // The end of the page scrolls clear of the dock: the footer's last link isn't under it.
    const dock = await page.locator('[data-nex-slot="dock"]').boundingBox();
    const last = await page.getByRole("contentinfo").getByRole("link").last().boundingBox();
    const overlaps =
      last!.x < dock!.x + dock!.width &&
      last!.x + last!.width > dock!.x &&
      last!.y < dock!.y + dock!.height &&
      last!.y + last!.height > dock!.y;
    expect(overlaps).toBe(false);
  });

  test("rotating between the narrow and wide layouts moves NEX between the dock and the page's spot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 }); // tablet portrait: spot hidden
    await open(page, "/about");
    await expect.poll(() => activeSlot(page)).toBe("dock");
    await page.setViewportSize({ width: 1180, height: 820 }); // landscape: the heading's spot shows
    await expect.poll(() => activeSlot(page)).toBe("page");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await page.setViewportSize({ width: 820, height: 1180 });
    await expect.poll(() => activeSlot(page)).toBe("dock");
  });

  test("minimise hides NEX for the visit; Show NEX brings him back to where he belongs; navigation keeps the choice", async ({
    page,
  }) => {
    await open(page, "/projects");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => activeSlot(page)).toBe("dock");
    await page.getByRole("button", { name: "Minimise NEX" }).click();
    await expect(page.locator('[data-stage-anchor="nex"]')).toHaveCount(0);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "hidden");
    await page.getByRole("link", { name: "About", exact: true }).first().click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator('[data-stage-anchor="nex"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Show NEX" }).click();
    // At the top of About: its heading spot is in view on wide screens (NEX returns there, not to the
    // dock); narrow screens hide that spot, so he returns to the dock.
    await expect.poll(() => activeSlot(page)).toBe(wide(page) ? "page" : "dock");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  });
});

test.describe("NEX's dock controls exist only while NEX is drawn", () => {
  const dockLauncher = (page: Page) =>
    page.locator("[data-nex-dock]").getByRole("button", { name: "NEX: open site navigation" });
  const minimise = (page: Page) => page.getByRole("button", { name: "Minimise NEX" });
  const showNex = (page: Page) => page.getByRole("button", { name: "Show NEX" });
  /** Dock controls a visitor could see, tap or tab to (anything rendered in the dock). */
  const usableDockControls = (page: Page) =>
    page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>("[data-nex-dock] button")].filter(
          (b) => b.getClientRects().length > 0,
        ).length,
    );
  /** Narrow layout: dedicated pages hide their own NEX spot, so NEX is in the dock from the start. */
  const narrow = (page: Page) => page.setViewportSize({ width: 390, height: 844 });
  const press = (page: Page, target: ReturnType<typeof showNex>, isMobile: boolean) =>
    isMobile ? target.tap() : target.click();

  test("before NEX appears and while he forms: no frame shows a dock control without NEX drawn", async ({
    page,
  }) => {
    await stubDevice(page, { webgl2: true });
    // Every animation frame from the start: is a dock control rendered while NEX isn't drawn?
    await page.addInitScript(() => {
      const w = window as unknown as { __violations: string[]; __hiddenFrames: number };
      w.__violations = [];
      w.__hiddenFrames = 0;
      const tick = () => {
        const state = document.querySelector<HTMLElement>(".os-stage")?.dataset.nexState;
        const rendered = [
          ...document.querySelectorAll(
            "[data-nex-dock] .nex-launcher, [data-nex-dock] .nex-dock-hide",
          ),
        ].some((el) => el.getClientRects().length > 0);
        if (state !== "visible") w.__hiddenFrames++;
        if (rendered && state !== "visible") w.__violations.push(state ?? "none");
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    const probe = await page.evaluate(() => {
      const w = window as unknown as { __violations: string[]; __hiddenFrames: number };
      return { violations: w.__violations, hiddenFrames: w.__hiddenFrames };
    });
    expect(probe.hiddenFrames).toBeGreaterThan(0); // the "not drawn yet" period was observed
    expect(probe.violations).toEqual([]);
    // Once NEX is drawn (here, formed), his controls are there as before.
    await expect(dockLauncher(page)).toBeVisible();
    await expect(minimise(page)).toBeVisible();
  });

  test("devices that can't run NEX's shaders: the background still draws, no dock controls", async ({
    page,
  }) => {
    await stubDevice(page, { webgl2: true });
    // Too few vertex uniforms for NEX's uniform transport, and a failing float-texture probe.
    await page.addInitScript(() => {
      const proto = WebGL2RenderingContext.prototype;
      const getParameter = proto.getParameter;
      proto.getParameter = function (this: WebGL2RenderingContext, name: number) {
        return name === this.MAX_VERTEX_UNIFORM_VECTORS ? 100 : getParameter.call(this, name);
      };
      const readPixels = proto.readPixels as (...args: unknown[]) => void;
      (proto as unknown as { readPixels: unknown }).readPixels = function (
        this: WebGL2RenderingContext,
        ...args: unknown[]
      ) {
        readPixels.apply(this, args);
        if (args[2] === 4 && args[3] === 2) (args[6] as Uint8Array)[13] = 0;
      };
    });
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await expect(stage(page)).toHaveAttribute("data-agent-state", "unsupported");
    await page.waitForTimeout(1500);
    await expect(stage(page)).not.toHaveAttribute("data-nex-state", "visible");
    await expect(dockLauncher(page)).toBeHidden();
    await expect(minimise(page)).toBeHidden();
    expect(await usableDockControls(page)).toBe(0);
    // Keyboard: tabbing through the whole page never lands in the dock.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("[data-nex-dock]"))).toBe(
        false,
      );
    }
  });

  test("the static fallback (no WebGL): no dock, nothing to tab to", async ({ page }) => {
    await stubDevice(page, { webgl2: false });
    await narrow(page);
    await open(page, "/projects");
    await page.waitForTimeout(800);
    expect(await usableDockControls(page)).toBe(0);
    await expect(dockLauncher(page)).toBeHidden();
  });

  test("minimise and restore, by touch or click: Show NEX stays available while NEX is hidden", async ({
    page,
    isMobile,
  }) => {
    await stubDevice(page, { webgl2: true });
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    await press(page, minimise(page), isMobile);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "hidden"); // faded out
    await expect(showNex(page)).toBeVisible(); // not hidden with the other controls
    expect(await usableDockControls(page)).toBe(1);
    await press(page, showNex(page), isMobile);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(dockLauncher(page)).toBeVisible();
    await press(page, dockLauncher(page), isMobile);
    await expect(panel(page)).toBeVisible();
  });

  test("Reduced Motion, keyboard only: open the panel, minimise and restore from the dock", async ({
    page,
  }) => {
    await stubDevice(page, { webgl2: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-stage-state", "static");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await dockLauncher(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await minimise(page).focus();
    await page.keyboard.press("Enter");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "hidden");
    await expect(dockLauncher(page)).toBeHidden();
    await showNex(page).focus();
    await expect(showNex(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(dockLauncher(page)).toBeVisible();
  });
});

test.describe("keyboard focus when NEX is minimised and restored", () => {
  const dockLauncher = (page: Page) =>
    page.locator("[data-nex-dock]").getByRole("button", { name: "NEX: open site navigation" });
  const pageLauncher = (page: Page) =>
    page.locator("[data-nex-primary]").getByRole("button", { name: "NEX: open site navigation" });
  const minimise = (page: Page) => page.getByRole("button", { name: "Minimise NEX" });
  const showNex = (page: Page) => page.getByRole("button", { name: "Show NEX" });
  const narrow = (page: Page) => page.setViewportSize({ width: 390, height: 844 });
  /** Keyboard activation: focus the button (Safari doesn't Tab to buttons by default), press Enter. */
  const activate = async (page: Page, target: ReturnType<typeof showNex>) => {
    await target.focus();
    await page.keyboard.press("Enter");
  };

  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
  });

  test("keyboard: Minimise moves focus to Show NEX, and Show NEX to NEX's launcher in the dock", async ({
    page,
  }) => {
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    await activate(page, minimise(page));
    await expect(showNex(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(dockLauncher(page)).toBeFocused();
    // The panel opens from there with the keyboard as usual.
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
  });

  test("keyboard restore beside a page heading: focus goes to NEX's launcher there", async ({
    page,
  }) => {
    test.skip(!wide(page), "the heading's NEX spot is laid out on wide screens only");
    await open(page, "/about");
    // Scroll the heading away so NEX docks, minimise him there, then return to the top.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => activeSlot(page)).toBe("dock");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await activate(page, minimise(page));
    await expect(showNex(page)).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    // Let the scroll settle (the page reports the heading back in view), as it has for a visitor.
    await page.waitForTimeout(600);
    await page.keyboard.press("Enter");
    await expect.poll(() => activeSlot(page)).toBe("page");
    await expect(pageLauncher(page)).toBeFocused();
  });

  test("Reduced Motion: the same focus moves, with NEX placed at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await activate(page, minimise(page));
    await expect(showNex(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dockLauncher(page)).toBeFocused();
  });

  test("pointer and touch: focus is never moved for them", async ({ page, isMobile }) => {
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    const press = (target: ReturnType<typeof showNex>) =>
      isMobile ? target.tap() : target.click();
    await press(minimise(page));
    await expect(showNex(page)).toBeVisible();
    await press(showNex(page));
    await expect(dockLauncher(page)).toBeVisible();
    await page.waitForTimeout(500); // past any frame in which focus could have been moved
    // A pointer or touch press leaves focus to the browser: it is never moved to NEX's launcher.
    await expect(dockLauncher(page)).not.toBeFocused();
  });

  test("a restore never takes focus back once the visitor has moved on", async ({ page }) => {
    await narrow(page);
    await open(page, "/projects");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    await activate(page, minimise(page));
    await expect(showNex(page)).toBeFocused();
    // Hold NEX back, so his launcher isn't available yet when focus moves elsewhere.
    await page.evaluate(() => {
      const stageEl = document.querySelector<HTMLElement>(".os-stage")!;
      new MutationObserver(() => {
        if (stageEl.dataset.nexState === "visible") stageEl.dataset.nexState = "held";
      }).observe(stageEl, { attributes: true, attributeFilter: ["data-nex-state"] });
    });
    await page.keyboard.press("Enter");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await skip.focus();
    await page.evaluate(() => {
      // Release NEX: his launcher appears; focus must stay where the visitor put it.
      const stageEl = document.querySelector<HTMLElement>(".os-stage")!;
      stageEl.dataset.nexState = "visible";
    });
    await page.waitForTimeout(500);
    await expect(skip).toBeFocused();
  });
});

test.describe("Show NEX stays fully visible after minimising", () => {
  const showNex = (page: Page) => page.getByRole("button", { name: "Show NEX" });
  /** Show NEX's box against the visible viewport, and whether its centre is really the button. */
  const placement = (page: Page) =>
    showNex(page).evaluate((button) => {
      const box = button.getBoundingClientRect();
      const width = window.visualViewport?.width ?? window.innerWidth;
      const height = window.visualViewport?.height ?? window.innerHeight;
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        inside:
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= width &&
          box.bottom <= height &&
          box.width > 0,
        hit: hit !== null && button.contains(hit),
        box: [box.left, box.top, box.right, box.bottom].map(Math.round),
        viewport: [width, height].map(Math.round),
      };
    });
  /** Minimises NEX from the dock (scrolled to the end, so wide pages dock him too). */
  const minimiseFromDock = async (page: Page) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => activeSlot(page)).toBe("dock");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await page.getByRole("button", { name: "Minimise NEX" }).click();
    await expect(showNex(page)).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
  });

  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1280, 800],
    [1920, 1080],
  ] as const) {
    test(`${width}×${height}: inside the viewport and clickable`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, "/projects");
      await minimiseFromDock(page);
      const result = await placement(page);
      expect(result, JSON.stringify(result)).toMatchObject({ inside: true, hit: true });
      await showNex(page).click();
      await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    });
  }

  test("still inside after rotating while minimised", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/projects");
    await minimiseFromDock(page);
    for (const size of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(async () => {
          const result = await placement(page);
          return result.inside && result.hit;
        })
        .toBe(true);
    }
  });
});

test.describe("discoverability and positioning (launch sprint refinement)", () => {
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
  });

  test("one NEX launcher at a time, described by the hint in the right gesture", async ({
    page,
    isMobile,
  }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    const launchers = page.getByRole("button", { name: "NEX: open site navigation" });
    await expect(launchers).toHaveCount(1);
    const touch = isMobile;
    await expect(launchers).toHaveAccessibleDescription(
      touch ? /Tap NEX to open the site menu/ : /Click NEX to open the site menu/,
    );
    await expect(page.locator(touch ? ".nex-hint-pointer" : ".nex-hint-touch")).toBeHidden();
    await page
      .locator("#work-title")
      .evaluate((el) =>
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - innerHeight / 2 + 40),
      );
    await page.waitForTimeout(400);
    await expect(launchers).toHaveCount(1);
  });

  test("the opening keeps NEX fully in view on wide screens only (phones dock instead)", async ({
    page,
  }) => {
    await open(page);
    const contained = await page
      .locator('[data-nex-slot="hero"]')
      .evaluate((el) => matchMedia(el.getAttribute("data-nex-contain")!).matches);
    expect(contained).toBe(wide(page));
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("NEX's panel works the same; NEX is placed at once", async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await launcher(page).click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
  });
});

test("without WebGL2 the static NEX opens the panel; no empty dock is shown", async ({ page }) => {
  await stubDevice(page, { webgl2: false });
  await open(page);
  await expect(stage(page)).toHaveCount(0);
  const hero = page.locator('[data-nex-slot="hero"]').getByRole("button", {
    name: "NEX: open site navigation",
  });
  await hero.click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#work-title").evaluate((el) => el.scrollIntoView());
  await page.waitForTimeout(300);
  await expect(page.locator(".nex-dock")).toBeHidden();
});

test.describe("the opening: NEX introduces MOYLAN//OS", () => {
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
  });

  test("a full-screen opening: Alex, NEX and his guide in view, the guide never over NEX", async ({
    page,
  }) => {
    await open(page);
    const opening = page.getByRole("region", { name: /Alex Moylan/ });
    const box = await opening.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 64 - 2); // the first view
    await expect(page.getByRole("heading", { level: 1, name: "Alex Moylan" })).toBeInViewport();
    await expect(opening.getByText("NEX // GUIDE")).toBeVisible();
    await expect(opening.locator("#nex-intro")).toContainText(/Hello\. I'm NEX/);
    // The message types out, then stays complete and readable.
    await expect(opening.locator(".nex-tx")).toHaveAttribute("data-state", "done", {
      timeout: 10_000,
    });
    await expect(opening.locator("#nex-intro [aria-hidden] > span").first()).toHaveText(
      /straight there\.$/,
    );
    await expect(opening.getByRole("button", { name: "I'm hiring" })).toBeInViewport();
    // NEX's speech sits beside the orb (very wide screens) or beneath it, never over it.
    const orb = (await page.locator('[data-nex-slot="hero"]').boundingBox())!;
    const guide = (await page.locator("#nex-guide").boundingBox())!;
    const apart =
      guide.y >= orb.y + orb.height - 1 ||
      guide.x + guide.width <= orb.x + 1 ||
      guide.x >= orb.x + orb.width - 1;
    expect(apart, "NEX's guide never overlaps his orb").toBe(true);
    await expect(page.locator("#nex-guide")).toBeInViewport();
    // Nothing plays or loads until asked.
    const audioRequests: string[] = [];
    page.on("request", (r) => r.url().includes("/audio/") && audioRequests.push(r.url()));
    await page.waitForTimeout(500);
    expect(audioRequests).toEqual([]);
  });

  test("NEX's guide answers each choice and leads to the content", async ({ page }) => {
    await open(page);
    const guide = page.locator("#nex-guide");
    await guide.getByRole("button", { name: "Show me the work" }).click();
    await expect(page.locator("#nex-intro")).toContainText(/three live demos/);
    await expect(guide.getByRole("link", { name: /Open CLAIMFLOW/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    await expect(page.locator(".nex-guide-message")).toBeFocused();
    await expect(guide.getByRole("link", { name: /Open COPILOT \/\/ LAUNCHPAD/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    await guide.getByRole("button", { name: "Start over" }).click();
    await guide.getByRole("button", { name: "I'm hiring" }).click();
    await guide.getByRole("link", { name: "View experience" }).click();
    await expect(page).toHaveURL(/\/experience$/);
    await expect(page.getByRole("heading", { level: 1, name: "Experience" })).toBeFocused();
  });
});

/** Which voice configuration this build has (the committed default is text-only). */
const voiceMode = (page: Page) =>
  page
    .locator("[data-voice-mode]")
    .count()
    .then((n) => (n > 0 ? "audio" : "text-only"));

test.describe("NEX's voice controls (audio builds: a licensed recording or the local preview)", () => {
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await open(page);
    test.skip((await voiceMode(page)) === "text-only", "this build is text-only");
  });

  const voice = (page: Page) => page.locator("[data-voice-mode]");
  const subtitles = (page: Page) => page.locator("#nex-intro");

  test("Hear NEX plays; Replay; Stop; the subtitles stay throughout", async ({ page }) => {
    await expect(page.getByText("NEX's voice is AI-generated.")).toBeVisible();
    await page.getByRole("button", { name: "Hear NEX" }).click();
    await expect(voice(page)).toHaveAttribute("data-voice-state", "playing");
    await expect(subtitles(page)).toHaveAttribute("data-speaking", "");
    await page.getByRole("button", { name: "Replay" }).click();
    await expect(voice(page)).toHaveAttribute("data-voice-state", "playing");
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(voice(page)).toHaveAttribute("data-voice-state", "idle");
    await expect(subtitles(page)).not.toHaveAttribute("data-speaking", "");
    await expect(subtitles(page)).toBeVisible();
    expect(await page.evaluate(() => [...document.querySelectorAll("audio")].length)).toBe(0);
  });

  test("Mute stops playback at once; Unmute doesn't restart it; keyboard only", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Hear NEX" }).focus();
    await page.keyboard.press("Enter");
    await expect(voice(page)).toHaveAttribute("data-voice-state", "playing");
    await page.getByRole("button", { name: "Mute NEX" }).focus();
    await page.keyboard.press("Enter");
    await expect(voice(page)).toHaveAttribute("data-voice-state", "muted");
    await expect(page.getByRole("button", { name: "Hear NEX" })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /muted/ })).toBeVisible();
    await page.getByRole("button", { name: "Unmute NEX" }).focus();
    await page.keyboard.press("Enter");
    await expect(voice(page)).toHaveAttribute("data-voice-state", "idle");
    await expect(subtitles(page)).not.toHaveAttribute("data-speaking", "");
  });

  test("no automatic restart after navigating away and back", async ({ page }) => {
    await page.getByRole("button", { name: "Hear NEX" }).click();
    await expect(voice(page)).toHaveAttribute("data-voice-state", "playing");
    await page.getByRole("link", { name: "Projects", exact: true }).first().click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goBack();
    await expect(voice(page)).toHaveAttribute("data-voice-state", "idle");
    await expect(subtitles(page)).not.toHaveAttribute("data-speaking", "");
  });
});

test.describe("NEX's voice when the recording can't be loaded", () => {
  // The deliberate 404 below is logged by the browser as a failed resource load.
  test.use({ allowedErrors: [/Failed to load resource.*404/] });
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await open(page);
    test.skip((await voiceMode(page)) === "text-only", "this build is text-only");
  });
  const voice = (page: Page) => page.locator("[data-voice-mode]");
  const subtitles = (page: Page) => page.locator("#nex-intro");

  test("audio unavailable: a clear message, the introduction remains readable", async ({
    page,
  }) => {
    await page.route("**/audio/**", (route) => route.fulfill({ status: 404, body: "" }));
    await page.getByRole("button", { name: "Hear NEX" }).click();
    await expect(voice(page)).toHaveAttribute("data-voice-state", "unavailable");
    await expect(page.getByRole("status").filter({ hasText: /isn't available/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hear NEX" })).toHaveCount(0);
    await expect(subtitles(page)).toBeVisible();
  });
});

test("text-only builds: the introduction is complete without audio controls", async ({ page }) => {
  await stubDevice(page, { webgl2: true });
  await open(page);
  test.skip((await voiceMode(page)) === "audio", "this build has a recording");
  await expect(page.locator("#nex-intro")).toContainText(/Hello\. I'm NEX/);
  await expect(page.getByRole("button", { name: /Hear NEX|Mute NEX/ })).toHaveCount(0);
});
