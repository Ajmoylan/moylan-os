import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { setSaveData, stubDevice, trackStageRequests } from "./device";
import { expect, test } from "./fixtures";

/**
 * The live WebGL environment (Milestone 2.2) with a real renderer: lifecycle, motion modes,
 * fallbacks and resilience (ARCHITECTURE §9.4, §10, ADR-004, ADR-007).
 *
 * Animation-loop activity is measured by counting requestAnimationFrame calls, which is
 * deterministic about *whether* a loop runs, independent of how fast the machine renders.
 */

const stage = (page: Page) => page.locator(".os-stage");
const canvas = (page: Page) => page.locator(".os-stage canvas");
const motionButton = (page: Page) => page.getByRole("button", { name: /^Motion/ });

async function countAnimationFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      w.__frames += 1;
      return original(callback);
    };
  });
}

/** requestAnimationFrame calls during `ms` (a running loop makes ~60 per second). */
async function framesDuring(page: Page, ms = 1000) {
  const before = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  await page.waitForTimeout(ms);
  const after = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  return after - before;
}

async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(motionButton(page)).toBeEnabled();
}

async function chooseMotion(page: Page, option: "System" | "Full" | "Reduced" | "Off") {
  const button = motionButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await page.getByRole("radio", { name: option, exact: true }).check();
  await page.keyboard.press("Escape");
}

/** Grab WEBGL_lose_context for the stage canvas (kept on window so it survives the loss). */
async function loseContext(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lose?: WEBGL_lose_context };
    if (!w.__lose) {
      const gl = document
        .querySelector<HTMLCanvasElement>(".os-stage canvas")!
        .getContext("webgl2")!;
      w.__lose = gl.getExtension("WEBGL_lose_context")!;
    }
    w.__lose.loseContext();
  });
}

async function restoreContext(page: Page) {
  await page.evaluate(() =>
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext(),
  );
}

test.describe("with WebGL2 and full motion", () => {
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await countAnimationFrames(page);
  });

  test("renders a live, decorative particle field behind the content", async ({
    page,
    isMobile,
  }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await expect(stage(page)).toHaveAttribute("aria-hidden", "true");
    await expect(stage(page)).toHaveAttribute("data-stage-flow", /^(half-float|rgba8)$/);
    await expect(stage(page)).toHaveAttribute("data-stage-particles", isMobile ? "6000" : "12000");
    await expect(stage(page)).toHaveAttribute("data-stage-draw-calls", "2");
    await expect(canvas(page)).toHaveCount(1);
    await expect.poll(() => canvas(page).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await expect(canvas(page)).toHaveCSS("pointer-events", "none");
    expect(await framesDuring(page)).toBeGreaterThan(20);

    // The canvas never intercepts input: content above it stays the hit target.
    const heading = page.getByRole("heading", { level: 1 });
    const box = (await heading.boundingBox())!;
    expect(
      await page.evaluate(
        ([x, y]) => document.elementFromPoint(x!, y!)?.closest("h1") !== null,
        [box.x + 10, box.y + box.height / 2],
      ),
    ).toBe(true);
  });

  test("pointer movement drives the GPU only: no DOM changes or React re-renders", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "mouse movement");
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await page.evaluate(() => {
      const w = window as unknown as { __mutations: string[] };
      w.__mutations = [];
      new MutationObserver((records) => {
        for (const record of records) {
          // The stage publishes measurements once per second; everything else must stay put.
          const isStageStat =
            record.type === "attributes" &&
            (record.target as Element).classList?.contains("os-stage");
          if (!isStageStat) w.__mutations.push(`${record.type} on ${record.target.nodeName}`);
        }
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    for (let i = 0; i < 60; i++) {
      await page.mouse.move(200 + i * 12, 300 + Math.sin(i / 5) * 150);
    }
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => (window as unknown as { __mutations: string[] }).__mutations),
    ).toEqual([]);
  });

  test("motion changes apply live: reduced is one still frame, off removes the canvas", async ({
    page,
  }) => {
    const stageRequests = trackStageRequests(page);
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");

    // System following an OS change to reduced motion.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(stage(page)).toHaveAttribute("data-stage-state", "static");
    await expect(stage(page)).toHaveAttribute("data-stage-flow", "none");
    expect(await framesDuring(page)).toBeLessThanOrEqual(3);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await expect(stage(page)).toHaveAttribute("data-stage-flow", /^(half-float|rgba8)$/);

    await chooseMotion(page, "Off");
    await expect(stage(page)).toHaveCount(0);
    expect(await framesDuring(page)).toBeLessThanOrEqual(3);

    await chooseMotion(page, "Full");
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    expect(stageRequests, "the chunk is reused, not re-downloaded").toHaveLength(1);
  });

  test("pauses the render loop while the tab is hidden", async ({ page }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);

    await setHidden(true);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "paused");
    expect(await framesDuring(page)).toBeLessThanOrEqual(3);
    await setHidden(false);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    expect(await framesDuring(page)).toBeGreaterThan(20);
  });

  test("context loss fades to the static design, and restoration recovers", async ({ page }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");

    await loseContext(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
    await expect.poll(() => canvas(page).evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    expect(await framesDuring(page, 500)).toBeLessThanOrEqual(3);

    await restoreContext(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await expect.poll(() => canvas(page).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("repeated context losses disable the stage for the rest of the visit", async ({ page }) => {
    await open(page);
    for (let i = 0; i < 2; i++) {
      await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
      await loseContext(page);
      await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
      await restoreContext(page);
    }
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await loseContext(page); // third loss
    await expect(stage(page)).toHaveCount(0);

    // Never retried within the visit, even after switching motion off and on.
    await chooseMotion(page, "Off");
    await chooseMotion(page, "Full");
    await page.waitForTimeout(500);
    await expect(stage(page)).toHaveCount(0);
  });

  test("a context that isn't restored within 3 s disables the stage", async ({ page }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await loseContext(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
    await expect(stage(page)).toHaveCount(0, { timeout: 5000 });
  });

  test("the page passes axe with the live canvas behind it", async ({ page }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

test("Save-Data switched on mid-visit unloads the stage; switched off, it returns", async ({
  page,
}) => {
  await stubDevice(page, { webgl2: true });
  await open(page);
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");

  await setSaveData(page, true);
  await expect(stage(page)).toHaveCount(0);
  await setSaveData(page, false);
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
});

test("a half-float target that fails render-and-sample validation falls back to RGBA8", async ({
  page,
}) => {
  await stubDevice(page, { webgl2: true });
  // The driver claims half-float support, but float readbacks come back wrong (as on drivers
  // that report complete framebuffers they can't actually render or filter correctly).
  await page.addInitScript(() => {
    const w = window as unknown as { __floatReadbacks: number };
    w.__floatReadbacks = 0;
    const original = WebGL2RenderingContext.prototype.readPixels as (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) => void;
    // Test stub replacing an overloaded DOM method.
    WebGL2RenderingContext.prototype.readPixels = function (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) {
      original.apply(this, args);
      if (args[5] === this.FLOAT && args[6] instanceof Float32Array) {
        w.__floatReadbacks += 1;
        args[6].fill(0);
      }
    };
  });
  await open(page);
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-stage-flow", "rgba8");
  expect(
    await page.evaluate(() => (window as unknown as { __floatReadbacks: number }).__floatReadbacks),
    "the half-float probe ran and was rejected",
  ).toBe(1);
});

test.describe("renderer context creation failure", () => {
  // Three.js and React report the failed context creation; the page itself must be unaffected.
  test.use({ allowedErrors: [/WebGL|context|Error creating/i] });

  test("leaves the static design and never retries in the visit", async ({ page }) => {
    await stubDevice(page, { webgl2: true, failRendererContext: true });
    await open(page);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __webgl2Requests?: number }).__webgl2Requests ?? 0,
        ),
      )
      .toBeGreaterThanOrEqual(2);
    await expect(stage(page)).toHaveCount(0);
    await expect(page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeVisible();

    const attempts = await page.evaluate(
      () => (window as unknown as { __webgl2Requests: number }).__webgl2Requests,
    );
    await chooseMotion(page, "Off");
    await chooseMotion(page, "Full");
    await page.waitForTimeout(800);
    expect(
      await page.evaluate(
        () => (window as unknown as { __webgl2Requests: number }).__webgl2Requests,
      ),
    ).toBe(attempts);
  });
});
