import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * NEX in the live stage (Milestone 2.3), with a real renderer: NEX is drawn by the same canvas
 * as the ambient field at the home page's layout anchor, replaces the static poster only while it
 * is actually drawn, follows the motion policy, leaves and returns with its page, and survives a
 * context restore. The poster (the static emblem) keeps NEX's text equivalent throughout.
 */

const stage = (page: Page) => page.locator(".os-stage");
const poster = (page: Page) => page.locator("[data-nex-poster]");
const motionButton = (page: Page) => page.getByRole("button", { name: /^Motion/ });

async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(motionButton(page)).toBeEnabled();
}

async function chooseMotion(page: Page, option: "Full" | "Reduced" | "Off") {
  const button = motionButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await page.getByRole("radio", { name: option, exact: true }).check();
  await page.keyboard.press("Escape");
}

/** Counts WebGL draw calls, so draw calls per rendered frame can be measured exactly. */
async function countDrawCalls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    const proto = WebGL2RenderingContext.prototype;
    for (const name of ["drawArrays", "drawElements"] as const) {
      const original = proto[name] as (...args: unknown[]) => void;
      (proto as unknown as Record<string, unknown>)[name] = function (
        this: unknown,
        ...args: unknown[]
      ) {
        w.__draws += 1;
        return original.apply(this, args);
      };
    }
  });
}

/** The most common number of draw calls per rendered frame, over 40 frames. */
function drawCallsPerFrame(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = window as unknown as { __draws: number };
        const counts: number[] = [];
        let last = w.__draws;
        const tick = () => {
          counts.push(w.__draws - last);
          last = w.__draws;
          if (counts.length < 40) requestAnimationFrame(tick);
          else {
            const rendered = counts.filter((n) => n > 0);
            const freq = new Map<number, number>();
            for (const n of rendered) freq.set(n, (freq.get(n) ?? 0) + 1);
            resolve([...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0]);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Pointer-move listeners registered on window (ADR-004: exactly one, the shared tracker). */
async function countPointerListeners(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __pointerListeners: number };
    w.__pointerListeners = 0;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "pointermove") w.__pointerListeners += 1;
      return (add as (...args: unknown[]) => void)(type, ...rest);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "pointermove") w.__pointerListeners -= 1;
      return (remove as (...args: unknown[]) => void)(type, ...rest);
    }) as typeof window.removeEventListener;
  });
}

/** Counts layout measurements of NEX's anchor (getBoundingClientRect on the anchor element). */
async function countAnchorMeasurements(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __anchorReads: number };
    w.__anchorReads = 0;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.matches('[data-stage-anchor="nex"]')) w.__anchorReads += 1;
      return original.call(this);
    };
  });
}

const anchorReads = (page: Page) =>
  page.evaluate(() => (window as unknown as { __anchorReads: number }).__anchorReads);

/** Readbacks for the flow-format probe: float and/or byte readbacks return wrong values. */
async function corruptReadbacks(page: Page, formats: { float: boolean; byte: boolean }) {
  await page.addInitScript((corrupt) => {
    const original = WebGL2RenderingContext.prototype.readPixels as (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) => void;
    WebGL2RenderingContext.prototype.readPixels = function (
      this: WebGL2RenderingContext,
      ...args: unknown[]
    ) {
      original.apply(this, args);
      const out = args[6];
      if (corrupt.float && args[5] === this.FLOAT && out instanceof Float32Array) out.fill(0);
      if (corrupt.byte && args[5] === this.UNSIGNED_BYTE && out instanceof Uint8Array) out.fill(0);
    };
  }, formats);
}

test.describe("with WebGL2 and full motion", () => {
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
  });

  test("NEX is drawn in the shared stage at its anchor and replaces the static poster", async ({
    page,
  }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    // Tiers 2 (touch) and 3 (desktop) both draw the approved density; tier 3 adds the glow layer.
    await expect(stage(page)).toHaveAttribute("data-nex-particles", "30000");
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(poster(page)).toHaveCSS("opacity", "0");
    // The poster stays in the accessibility tree as NEX's text equivalent; the canvas is hidden.
    await expect(page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toHaveCount(1);
    await expect(stage(page)).toHaveAttribute("aria-hidden", "true");
    await expect(stage(page)).toHaveCSS("pointer-events", "none");
  });

  test("draws an exact, small number of calls per frame with the ambient field", async ({
    page,
    isMobile,
  }) => {
    await countDrawCalls(page);
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    // Ambient particles + the flow-map pass + NEX: atmosphere, ring hairlines, particles, shell
    // and core glow, plus the tier-3 glow layer on desktop. No extra flow or pointer passes.
    expect(await drawCallsPerFrame(page)).toBe(isMobile ? 7 : 8);
  });

  test("NEX samples the shared flow map: one pointer listener, one simulation", async ({
    page,
  }) => {
    await countPointerListeners(page);
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-flow", /^(half-float|rgba8)$/);
    const flow = await stage(page).getAttribute("data-stage-flow");
    await expect(stage(page)).toHaveAttribute("data-nex-flow", flow!);
    expect(
      await page.evaluate(
        () => (window as unknown as { __pointerListeners: number }).__pointerListeners,
      ),
    ).toBe(1);
  });

  test("a switch to Reduced during the arrival leaves NEX fully formed", async ({ page }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "false");
    await chooseMotion(page, "Reduced");
    await expect(stage(page)).toHaveAttribute("data-stage-state", "static");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    await expect(stage(page)).toHaveAttribute("data-nex-flow", "none");
  });

  test("measures its anchor only after layout changes, never on every frame", async ({ page }) => {
    await countAnchorMeasurements(page);
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    const idle = await anchorReads(page);
    await page.waitForTimeout(1000);
    expect(await anchorReads(page), "no measurement while nothing moves").toBe(idle);

    await page.evaluate(() => window.scrollBy(0, 200));
    await expect.poll(() => anchorReads(page)).toBeGreaterThan(idle);
    const scrolled = await anchorReads(page);

    // Enlarged browser text (WCAG 1.4.4) reflows the page: observed, so NEX is placed again.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
    await expect.poll(() => anchorReads(page)).toBeGreaterThan(scrolled);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  });

  test("NEX leaves with its page and returns when the visitor comes back", async ({ page }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await page
      .getByRole("region", { name: "Choose an environment" })
      .getByRole("link", { name: "Engineering" })
      .click();
    await expect(stage(page)).toHaveAttribute("data-agent", "forge");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "hidden");

    await page.goBack();
    await expect(stage(page)).toHaveAttribute("data-agent", "nex");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(poster(page)).toHaveCSS("opacity", "0");
  });

  test("Off removes the canvas and shows the static NEX; Full brings NEX back", async ({
    page,
  }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await chooseMotion(page, "Off");
    await expect(stage(page)).toHaveCount(0);
    await expect(poster(page)).toHaveCSS("opacity", "1");
    await expect(page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeVisible();

    await chooseMotion(page, "Full");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(poster(page)).toHaveCSS("opacity", "0");
  });

  test("a lost context shows the static NEX at once; restoration brings NEX back", async ({
    page,
  }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await page.evaluate(() => {
      const gl = document
        .querySelector<HTMLCanvasElement>(".os-stage canvas")!
        .getContext("webgl2")!;
      const lose = gl.getExtension("WEBGL_lose_context")!;
      (window as unknown as { __lose: WEBGL_lose_context }).__lose = lose;
      lose.loseContext();
    });
    await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
    await expect(poster(page)).toHaveCSS("opacity", "1");

    await page.evaluate(() =>
      (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext(),
    );
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(poster(page)).toHaveCSS("opacity", "0");
  });

  test("scrolling NEX out of view keeps the page responsive and error-free", async ({ page }) => {
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  });
});

test.describe("NEX consumes the shared interaction on every flow-format path", () => {
  test("RGBA8: half-float fails validation", async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await corruptReadbacks(page, { float: true, byte: false });
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-flow", "rgba8");
    await expect(stage(page)).toHaveAttribute("data-nex-flow", "rgba8");
  });

  test("analytic: no render-target format validates", async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await corruptReadbacks(page, { float: true, byte: true });
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-flow", "analytic");
    await expect(stage(page)).toHaveAttribute("data-nex-flow", "analytic");
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the fully formed NEX as a still frame, without pointer effects", async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await open(page);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "static");
    await expect(stage(page)).toHaveAttribute("data-stage-pointer", "off");
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    await expect(stage(page)).toHaveAttribute("data-nex-particles", "12000");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
    await expect(stage(page)).toHaveAttribute("data-nex-flow", "none");
    await expect(poster(page)).toHaveCSS("opacity", "0");
  });
});

test("without WebGL2, the static NEX emblem is the visible NEX", async ({ page }) => {
  await stubDevice(page, { webgl2: false });
  await open(page);
  await page.waitForTimeout(2500);
  await expect(stage(page)).toHaveCount(0);
  await expect(poster(page)).toHaveCSS("opacity", "1");
  await expect(page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeVisible();
});
