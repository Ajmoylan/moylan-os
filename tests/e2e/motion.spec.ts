import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { settle, stubDevice, trackStageRequests } from "./device";
import { expect, test } from "./fixtures";

/**
 * Runtime motion preferences (ARCHITECTURE §10): System follows the OS live; Full, Reduced and Off
 * are explicit, in-memory overrides. Covers the control, the <html data-motion> attribute that CSS
 * follows, the WebGL stage plan, fallbacks and privacy.
 */

const html = (page: Page) => page.locator("html");
const stage = (page: Page) => page.locator(".os-stage");
const motionButton = (page: Page) => page.getByRole("button", { name: /^Motion/ });

/** Load a page and wait until the motion control is interactive (after hydration). */
async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(motionButton(page)).toBeEnabled();
}

async function choose(page: Page, option: "System" | "Full" | "Reduced" | "Off") {
  const button = motionButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await page.getByRole("radio", { name: option, exact: true }).check();
}

/** Expected tier for full motion on a capable device: touch devices (Pixel 7) get tier 2. */
const fullTier = (isMobile: boolean) => (isMobile ? "2" : "3");

async function pathwayTransitionsCollapsed(page: Page) {
  const durations = await page
    .locator(".os-pathway")
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  return durations.split(",").every((d) => parseFloat(d) <= 0.01);
}

test("defaults to System, following an OS with no motion preference", async ({
  page,
  isMobile,
}) => {
  await stubDevice(page, { webgl2: true });
  await open(page);
  await expect(motionButton(page)).toHaveAccessibleName("Motion: System, Full");
  await expect(html(page)).toHaveAttribute("data-motion", "full");
  await expect(stage(page)).toHaveAttribute("data-stage-motion", "full");
  await expect(stage(page)).toHaveAttribute("data-stage-tier", fullTier(isMobile));
  await expect(stage(page)).toHaveAttribute("data-stage-pointer", "on");
  expect(await pathwayTransitionsCollapsed(page)).toBe(false);
});

test.describe("an OS that prefers reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("is honoured from the first load", async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await open(page);
    await expect(motionButton(page)).toHaveAccessibleName("Motion: System, Reduced");
    await expect(html(page)).toHaveAttribute("data-motion", "reduced");
    await expect(stage(page)).toHaveAttribute("data-stage-tier", "1");
    await expect(stage(page)).toHaveAttribute("data-stage-pointer", "off");
  });
});

test("follows OS preference changes live while the page stays open", async ({ page, isMobile }) => {
  await stubDevice(page, { webgl2: true });
  const stageRequests = trackStageRequests(page);
  await open(page);
  await expect(stage(page)).toHaveAttribute("data-stage-motion", "full");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(html(page)).toHaveAttribute("data-motion", "reduced");
  await expect(motionButton(page)).toHaveAccessibleName("Motion: System, Reduced");
  await expect(stage(page)).toHaveAttribute("data-stage-motion", "reduced");
  await expect(stage(page)).toHaveAttribute("data-stage-tier", "1");
  await expect(stage(page)).toHaveAttribute("data-stage-pointer", "off");
  expect(await pathwayTransitionsCollapsed(page)).toBe(true);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(html(page)).toHaveAttribute("data-motion", "full");
  await expect(stage(page)).toHaveAttribute("data-stage-tier", fullTier(isMobile));
  await expect(stage(page)).toHaveAttribute("data-stage-pointer", "on");
  expect(await pathwayTransitionsCollapsed(page)).toBe(false);
  expect(stageRequests, "the stage chunk is loaded once, not per change").toHaveLength(1);
});

test("explicit choices override the OS until System is chosen again", async ({
  page,
  isMobile,
}) => {
  await stubDevice(page, { webgl2: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(html(page)).toHaveAttribute("data-motion", "reduced");

  await choose(page, "Full");
  await expect(html(page)).toHaveAttribute("data-motion", "full");
  await expect(motionButton(page)).toHaveAccessibleName("Motion: Full");
  await expect(stage(page)).toHaveAttribute("data-stage-tier", fullTier(isMobile));
  await expect(stage(page)).toHaveAttribute("data-stage-pointer", "on");

  // OS changes are ignored while an explicit choice is in effect.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(html(page)).toHaveAttribute("data-motion", "full");

  await choose(page, "Reduced");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(html(page)).toHaveAttribute("data-motion", "reduced");
  await expect(stage(page)).toHaveAttribute("data-stage-pointer", "off");
  expect(await pathwayTransitionsCollapsed(page)).toBe(true);

  await choose(page, "System");
  await expect(html(page)).toHaveAttribute("data-motion", "full");
  await expect(motionButton(page)).toHaveAccessibleName("Motion: System, Full");
});

test("Off removes the stage and keeps the static design; motion can be turned back on", async ({
  page,
}) => {
  await stubDevice(page, { webgl2: true });
  const stageRequests = trackStageRequests(page);
  await open(page);
  await expect(stage(page)).toHaveCount(1);

  await choose(page, "Off");
  await expect(html(page)).toHaveAttribute("data-motion", "off");
  await expect(stage(page)).toHaveCount(0);
  await expect(page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeVisible();
  expect(await pathwayTransitionsCollapsed(page)).toBe(true);

  // Off persists across client-side navigation within the visit.
  await page.keyboard.press("Escape");
  await page
    .getByRole("region", { name: "Choose an environment" })
    .getByRole("link", { name: "Engineering" })
    .click();
  await expect(page).toHaveURL(/\/engineering$/);
  await expect(html(page)).toHaveAttribute("data-motion", "off");
  await expect(stage(page)).toHaveCount(0);

  await choose(page, "Full");
  await expect(stage(page)).toHaveAttribute("data-agent", "forge");
  expect(stageRequests, "the chunk is cached in memory, not re-requested").toHaveLength(1);
});

test("the control is keyboard operable and returns focus on Escape", async ({ page }) => {
  await open(page);
  const button = motionButton(page);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "System" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "Full" })).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "Off" })).toBeChecked();
  await expect(html(page)).toHaveAttribute("data-motion", "off");

  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
  await expect(page.getByRole("group", { name: "Motion" })).toBeHidden();
});

test("the open panel passes axe and fits the viewport", async ({ page }) => {
  await open(page);
  await motionButton(page).click();
  const group = page.getByRole("group", { name: "Motion" });
  await expect(group).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);

  const box = await group.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  for (const option of await page.getByRole("radio").all()) {
    const label = await option.evaluate((el) => {
      const rect = el.closest("label")!.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(label.height).toBeGreaterThanOrEqual(44);
    expect(label.width).toBeGreaterThanOrEqual(44);
  }
});

test("choices stay in memory only: nothing is stored and a reload returns to System", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await open(page);
  await choose(page, "Reduced");
  await choose(page, "Off");

  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
  }));
  expect(stored).toEqual({ local: 0, session: 0, databases: 0, caches: 0 });
  expect(await context.cookies()).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(requests.filter((url) => !url.startsWith(origin))).toEqual([]);

  await page.reload();
  await expect(motionButton(page)).toBeEnabled();
  await expect(motionButton(page)).toHaveAccessibleName("Motion: System, Full");
  await expect(html(page)).toHaveAttribute("data-motion", "full");
});

test.describe("fallbacks", () => {
  test("without WebGL2, motion choices work and never download the 3D chunk", async ({ page }) => {
    await stubDevice(page, { webgl2: false });
    const stageRequests = trackStageRequests(page);
    await open(page);
    await choose(page, "Full");
    await expect(html(page)).toHaveAttribute("data-motion", "full");
    await settle(page);
    expect(stageRequests).toEqual([]);
    await expect(stage(page)).toHaveCount(0);
  });

  test("an explicit Full choice never overrides Save-Data", async ({ page }) => {
    await stubDevice(page, { webgl2: true, saveData: true });
    const stageRequests = trackStageRequests(page);
    await open(page);
    await choose(page, "Full");
    await settle(page);
    expect(stageRequests).toEqual([]);
    await expect(stage(page)).toHaveCount(0);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false, reducedMotion: "reduce" });

    test("the control is hidden and CSS still follows the OS preference", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: /^Motion/ })).toBeHidden();
      await expect(html(page)).not.toHaveAttribute("data-motion");
      expect(await pathwayTransitionsCollapsed(page)).toBe(true);
    });
  });
});

/**
 * Short and enlarged layouts (WCAG 1.4.10 Reflow, 2.4.11 Focus Not Obscured). Zoom is emulated
 * with the equivalent CSS viewport: browser zoom shrinks the CSS viewport, so 1280×720 at 200% is
 * 640×360 and 1280×1024 at 400% is 320×256.
 */
const constrainedViewports = [
  { name: "short landscape phone 667×375", width: 667, height: 375 },
  { name: "very short landscape 667×320", width: 667, height: 320 },
  { name: "1280×720 at 200% zoom", width: 640, height: 360 },
  { name: "1280×1024 at 400% zoom", width: 320, height: 256 },
] as const;

/** Is `inner` vertically inside `outer` (1px tolerance for subpixel rounding)? */
const within = (inner: { y: number; height: number }, outer: { y: number; height: number }) =>
  inner.y >= outer.y - 1 && inner.y + inner.height <= outer.y + outer.height + 1;

for (const viewport of constrainedViewports) {
  test.describe(viewport.name, () => {
    test("every motion option is reachable by pointer, touch and keyboard", async ({
      page,
      isMobile,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page);
      await motionButton(page).click();
      const panel = page.locator(".os-motion-panel");
      const scroller = panel.locator(".os-header-panel-scroll");
      await expect(panel).toBeVisible();

      // The panel stays inside the viewport, and the page never scrolls sideways.
      const box = (await panel.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
      await expect(scroller).toHaveCSS("overflow-y", "auto");
      await expect(scroller).toHaveCSS("overscroll-behavior-y", "contain");

      // Pointer/touch: each option can be scrolled to and chosen; rows keep 44px targets.
      for (const name of ["Off", "Reduced", "Full", "System"] as const) {
        const radio = page.getByRole("radio", { name, exact: true });
        if (isMobile) await radio.tap();
        else await radio.check();
        await expect(radio).toBeChecked();
        const row = (await radio.locator("xpath=ancestor::label").boundingBox())!;
        expect(row.height).toBeGreaterThanOrEqual(44);
        expect(row.width).toBeGreaterThanOrEqual(44);
      }

      // Keyboard: arrow keys move through every option, and the focused row is fully visible.
      await page.getByRole("radio", { name: "System" }).focus();
      for (const name of ["Full", "Reduced", "Off"] as const) {
        await page.keyboard.press("ArrowDown");
        const radio = page.getByRole("radio", { name, exact: true });
        await expect(radio).toBeFocused();
        await expect(radio).toBeChecked();
        const row = (await radio.locator("xpath=ancestor::label").boundingBox())!;
        expect(within(row, (await scroller.boundingBox())!), `${name} row visible`).toBe(true);
      }
      await expect(html(page)).toHaveAttribute("data-motion", "off");

      // The panel's last line can be scrolled into view inside the panel.
      const note = panel.getByText(/Not saved/);
      await note.scrollIntoViewIfNeeded();
      expect(within((await note.boundingBox())!, (await scroller.boundingBox())!)).toBe(true);

      await page.keyboard.press("Escape");
      await expect(motionButton(page)).toBeFocused();
    });

    test("the mobile menu stays within the viewport and every destination is reachable", async ({
      page,
    }) => {
      test.skip(viewport.width >= 768, "the header menu is only used below 768px");
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page);
      await page.getByRole("button", { name: "Menu" }).click();
      const menu = page.getByRole("navigation", { name: "Mobile" });
      const box = (await menu.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      await expect(menu).toHaveCSS("overscroll-behavior-y", "contain");
      const last = menu.getByRole("link", { name: "CV", exact: true });
      await last.scrollIntoViewIfNeeded();
      expect(within((await last.boundingBox())!, (await menu.boundingBox())!)).toBe(true);
    });
  });
}

test.describe("header disclosures never overlap", () => {
  test("opening Motion closes the mobile menu, and opening the menu closes Motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await open(page);
    const menuButton = page.getByRole("button", { name: "Menu" });
    const menu = page.getByRole("navigation", { name: "Mobile" });
    const motionGroup = page.getByRole("group", { name: "Motion" });

    await menuButton.click();
    await expect(menu).toBeVisible();
    await motionButton(page).click();
    await expect(motionGroup).toBeVisible();
    await expect(menu).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();
    await expect(menu).toBeVisible();
    await expect(motionGroup).toBeHidden();
    await expect(motionButton(page)).toHaveAttribute("aria-expanded", "false");

    // Keyboard: Escape closes whichever is open and returns focus to its own button.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(menuButton).toBeFocused();
    await motionButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(motionGroup).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(motionGroup).toBeHidden();
    await expect(motionButton(page)).toBeFocused();
    await expect(menu).toBeHidden();
  });
});

/**
 * Text-only enlargement (WCAG 1.4.4 Resize Text), independent of viewport size. Chromium's
 * DevTools protocol sets the browser's default font size, the same preference as Settings →
 * Appearance → Font size, which also scales `rem` in media queries. Both Playwright projects run
 * Chromium, so this is available everywhere the suite runs.
 */
async function enlargeText(page: Page, percent: 150 | 200) {
  const cdp = await page.context().newCDPSession(page);
  const standard = (16 * percent) / 100;
  await cdp.send("Page.setFontSizes", {
    fontSizes: { standard, fixed: Math.round((standard * 13) / 16) },
  });
}

/** Every visible header control lies inside the viewport, is ≥ 44×44 and isn't covered. */
async function headerControlsUsable(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const problems: string[] = [];
    const header = document.querySelector("header")!;
    for (const el of header.querySelectorAll<HTMLElement>("a, button")) {
      const box = el.getBoundingClientRect();
      if (!box.width || el.closest("[hidden]")) continue;
      const name = el.getAttribute("aria-label") ?? el.textContent?.trim();
      if (box.left < 0 || box.right > vw) problems.push(`${name} outside viewport`);
      if (box.width < 44 || box.height < 44) problems.push(`${name} smaller than 44×44`);
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (!el.contains(hit)) problems.push(`${name} covered`);
    }
    return problems;
  });
}

for (const percent of [150, 200] as const) {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 412, height: 915 },
    { width: 667, height: 375 },
  ]) {
    test(`header controls stay usable with ${percent}% text at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await enlargeText(page, percent);
      await open(page);
      const header = page.locator("header");

      expect(await headerControlsUsable(page)).toEqual([]);
      await expect(motionButton(page)).toHaveAccessibleName("Motion: System, Full");
      // A header that wraps onto two rows stops being sticky, so it can't cover the content.
      if ((await header.getAttribute("data-wrapped")) !== null) {
        await expect(header).toHaveCSS("position", "relative");
      }

      // Motion panel: inside the viewport, header controls still usable, every option reachable.
      await motionButton(page).click();
      const panel = page.locator(".os-motion-panel");
      const box = (await panel.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(await headerControlsUsable(page)).toEqual([]);
      await page.getByRole("radio", { name: "System" }).focus();
      for (const name of ["Full", "Reduced", "Off"] as const) {
        await page.keyboard.press("ArrowDown");
        const radio = page.getByRole("radio", { name, exact: true });
        await expect(radio).toBeFocused();
        const scroller = (await panel.locator(".os-header-panel-scroll").boundingBox())!;
        const row = (await radio.locator("xpath=ancestor::label").boundingBox())!;
        const nameBox = (await page
          .locator(`#${await radio.getAttribute("aria-labelledby")}`)
          .boundingBox())!;
        // The focused radio and its name are always visible; the whole row is too whenever it
        // fits (at 200% text on a 320px phone one option's description can exceed the panel).
        expect(within((await radio.boundingBox())!, scroller), `${name} radio visible`).toBe(true);
        expect(within(nameBox, scroller), `${name} name visible`).toBe(true);
        if (row.height <= scroller.height) {
          expect(within(row, scroller), `${name} row visible`).toBe(true);
        }
        expect(row.height).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press("Escape");
      await expect(motionButton(page)).toBeFocused();

      // Mobile menu (shown below the md breakpoint, which also scales with text size).
      const menuButton = page.getByRole("button", { name: "Menu" });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        const menu = page.getByRole("navigation", { name: "Mobile" });
        const menuBox = (await menu.boundingBox())!;
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
        const cv = menu.getByRole("link", { name: "CV", exact: true });
        await cv.scrollIntoViewIfNeeded();
        expect(within((await cv.boundingBox())!, (await menu.boundingBox())!)).toBe(true);
      }
    });
  }
}

test("at default text size the header stays a single sticky row", async ({ page }) => {
  for (const width of [320, 667, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await open(page);
    const header = page.locator("header");
    await expect(header).not.toHaveAttribute("data-wrapped");
    await expect(header).toHaveCSS("position", "sticky");
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(66);
  }
});

test("between 640 and 767px the open Motion panel leaves the header controls usable", async ({
  page,
}) => {
  for (const width of [640, 700, 767]) {
    await page.setViewportSize({ width, height: 500 });
    await open(page);
    await motionButton(page).click();
    const panel = (await page.locator(".os-motion-panel").boundingBox())!;
    const header = (await page.locator("header").boundingBox())!;
    expect(panel.y, "panel starts below the header").toBeGreaterThanOrEqual(
      header.y + header.height,
    );
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    expect(await headerControlsUsable(page)).toEqual([]);
    // The Menu button the panel hangs beneath can still be used directly, and closes Motion.
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Motion" })).toBeHidden();
  }
});
