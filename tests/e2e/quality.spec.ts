import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * Adaptive quality with a real renderer (ARCHITECTURE §9.2, runtime adaptation).
 *
 * Slowness is made deterministic by busy-waiting inside every animation frame while
 * `window.__slow` is true (frames then take > 40 ms, well over the 24 ms threshold), so the
 * frame monitor steps quality down every two seconds regardless of the test machine's speed.
 * The tests then check that the renderer, the geometry and the reported statistics agree, and
 * that Stage re-renders (route, visibility and motion changes) never undo an adaptation.
 *
 * A heavily loaded machine may also be genuinely slow, and the monitor then rightly steps down
 * further. Assertions are therefore "at or below" a level (quality never rises) except at the
 * floor of the ladder, which is exact.
 */

test.use({ deviceScaleFactor: 2 });
test.skip(({ isMobile }) => isMobile, "desktop tier 3 (DPR cap 2) is the full quality ladder");

const stage = (page: Page) => page.locator(".os-stage");

async function slowFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __slow: boolean };
    w.__slow = false;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        if (w.__slow) {
          const end = performance.now() + 45;
          while (performance.now() < end) {
            // Busy-wait: simulate a GPU/CPU that can't keep up.
          }
        }
        callback(time);
      });
  });
}

const setSlow = (page: Page, slow: boolean) =>
  page.evaluate((value) => {
    (window as unknown as { __slow: boolean }).__slow = value;
  }, slow);

interface Observed {
  dpr: number;
  particles: number;
  /** The drawing buffer's real pixel ratio, independent of what the stage reports. */
  actualDpr: number;
}

const observe = (page: Page): Promise<Observed> =>
  page.evaluate(() => {
    const element = document.querySelector<HTMLElement>(".os-stage")!;
    const canvas = element.querySelector("canvas")!;
    return {
      dpr: Number(element.dataset.stageDpr),
      particles: Number(element.dataset.stageParticles),
      actualDpr: canvas.width / canvas.clientWidth,
    };
  });

const agrees = (q: Observed) => Math.abs(q.actualDpr - q.dpr) < 0.01;
const atOrBelow = (q: Observed, dpr: number, particles: number) =>
  q.dpr < dpr || (q.dpr === dpr && q.particles <= particles);

/** Quality reaches (or passes) a level of the ladder, with renderer and report in agreement. */
async function expectAtOrBelow(page: Page, dpr: number, particles: number) {
  await expect
    .poll(async () => {
      const q = await observe(page);
      return agrees(q) && atOrBelow(q, dpr, particles);
    })
    .toBe(true);
}

/** The floor of the ladder: DPR 1 and a quarter of tier 3's 12,000 particles. */
async function expectLowest(page: Page) {
  await expect
    .poll(() => observe(page), { timeout: 15_000 })
    .toEqual({
      dpr: 1,
      particles: 3_000,
      actualDpr: 1,
    });
}

async function chooseMotion(page: Page, option: "Full" | "Reduced") {
  const button = page.getByRole("button", { name: /^Motion/ });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await page.getByRole("radio", { name: option, exact: true }).check();
  await page.keyboard.press("Escape");
}

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

/** Every kind of Stage re-render: route, visibility, motion (tier) and a context restore. */
async function rerenderStage(page: Page) {
  await page
    .getByRole("link", { name: /engineering/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/engineering$/);
  await setHidden(page, true);
  await expect(stage(page)).toHaveAttribute("data-stage-state", "paused");
  await setHidden(page, false);
  await chooseMotion(page, "Reduced");
  await expect(stage(page)).toHaveAttribute("data-stage-tier", "1");
  await chooseMotion(page, "Full");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-stage-tier", "3");
  // A context restore remounts the field (new geometry, new monitor) under the same Stage.
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".os-stage canvas")!.getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context")!;
    lose.loseContext();
    setTimeout(() => lose.restoreContext(), 100);
  });
  await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
}

test.beforeEach(async ({ page }) => {
  await stubDevice(page, { webgl2: true });
  await slowFrames(page);
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-stage-tier", "3");
  await expectAtOrBelow(page, 2, 12_000);
});

test("reaches the lowest quality, and a Stage re-render keeps it", async ({ page }) => {
  test.setTimeout(60_000);
  await setSlow(page, true);
  await expectLowest(page);
  await setSlow(page, false);

  await rerenderStage(page);
  await page.waitForTimeout(500);
  await expectLowest(page);
});

test("keeps stepping down from where it was after a Stage re-render", async ({ page }) => {
  test.setTimeout(60_000);
  await setSlow(page, true);
  await expectAtOrBelow(page, 1.5, 12_000);
  await setSlow(page, false);
  const adapted = await observe(page);

  await rerenderStage(page);
  await page.waitForTimeout(500);
  // Before the fix, the renderer returned to DPR 2 here while the stage still reported 1.5.
  const after = await observe(page);
  expect(agrees(after), "renderer DPR matches the reported DPR").toBe(true);
  expect(atOrBelow(after, adapted.dpr, adapted.particles), "quality never rises").toBe(true);

  await setSlow(page, true);
  await expectLowest(page);
});
