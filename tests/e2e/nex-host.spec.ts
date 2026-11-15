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
      touch ? /Tap NEX to navigate/ : /Click NEX to navigate/,
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

  test("a full-screen introduction with subtitles and a way on, silent until asked", async ({
    page,
  }) => {
    await open(page);
    const opening = page.getByRole("region", { name: /Alex Moylan/ });
    const box = await opening.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 64 - 2); // the first view
    await expect(opening.getByText("NEX // TRANSMISSION")).toBeVisible();
    await expect(opening.locator("#nex-intro")).toContainText(/Hello\. I'm NEX\./);
    // The message types out, then stays complete and readable.
    await expect(opening.locator(".nex-tx")).toHaveAttribute("data-state", "done", {
      timeout: 10_000,
    });
    await expect(opening.locator("#nex-intro [aria-hidden] > span").first()).toHaveText(
      /guide you\.$/,
    );
    await expect(opening.getByRole("link", { name: /Scroll to explore/ })).toBeInViewport();
    // Nothing plays or loads until asked.
    const audioRequests: string[] = [];
    page.on("request", (r) => r.url().includes("/audio/") && audioRequests.push(r.url()));
    await page.waitForTimeout(500);
    expect(audioRequests).toEqual([]);
    await opening.getByRole("link", { name: /Scroll to explore/ }).click();
    await expect(page.locator("#intro-title")).toBeInViewport();
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
  await expect(page.locator("#nex-intro")).toContainText(/Hello\. I'm NEX\./);
  await expect(page.getByRole("button", { name: /Hear NEX|Mute NEX/ })).toHaveCount(0);
});
