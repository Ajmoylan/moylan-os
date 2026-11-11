import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * Stage engine failure policy with a real renderer (Milestone 2.4a): fault injection into the WebGL
 * context the engine uses. A fatal error at any point must stop rendering at once, release the
 * stage (canvas included) and leave the static design (the NEX emblem) for the rest of the visit,
 * with no page errors and no retries.
 */

const stage = (page: Page) => page.locator(".os-stage");
const poster = (page: Page) => page.locator("[data-nex-poster]");
const emblem = (page: Page) => page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ });
const motionButton = (page: Page) => page.getByRole("button", { name: /^Motion/ });

async function chooseMotion(page: Page, option: "Full" | "Off") {
  const button = motionButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await page.getByRole("radio", { name: option, exact: true }).check();
  await page.keyboard.press("Escape");
}

/**
 * Faults on the stage's WebGL2 context only (not the capability probe's): draw calls that throw,
 * buffer creation that throws, or a renderer that cannot read shader precision (its constructor
 * then throws). Also counts draws and stage contexts created.
 */
async function injectFaults(page: Page, { precision = false } = {}) {
  await page.addInitScript((failPrecision) => {
    const w = window as unknown as {
      __faults: { draw: boolean; buffer: boolean };
      __draws: number;
      __stageContexts: number;
      __stageGl: WebGL2RenderingContext | null;
    };
    w.__faults = { draw: false, buffer: false };
    w.__draws = 0;
    w.__stageContexts = 0;
    w.__stageGl = null;
    const proto = WebGL2RenderingContext.prototype;
    const onStage = (gl: WebGL2RenderingContext) =>
      gl.canvas instanceof HTMLCanvasElement && gl.canvas.closest(".os-stage") !== null;
    for (const name of ["drawArrays", "drawElements"] as const) {
      const original = proto[name] as (...args: unknown[]) => void;
      (proto as unknown as Record<string, unknown>)[name] = function (
        this: WebGL2RenderingContext,
        ...args: unknown[]
      ) {
        if (onStage(this)) {
          if (w.__faults.draw) throw new Error("injected draw failure");
          w.__draws += 1;
        }
        return original.apply(this, args);
      };
    }
    const createBuffer = proto.createBuffer;
    proto.createBuffer = function (this: WebGL2RenderingContext) {
      if (w.__faults.buffer && onStage(this)) throw new Error("injected buffer failure");
      return createBuffer.call(this);
    };
    const precisionFormat = proto.getShaderPrecisionFormat;
    proto.getShaderPrecisionFormat = function (
      this: WebGL2RenderingContext,
      ...args: [GLenum, GLenum]
    ) {
      if (onStage(this)) {
        w.__stageContexts += 1;
        w.__stageGl = this; // the actual context the stage acquired
        if (failPrecision) return null;
      }
      return precisionFormat.apply(this, args);
    };
  }, precision);
}

/** Whether the stage's actual WebGL context (captured during renderer setup) has been released. */
const stageContextLost = (page: Page) =>
  page.evaluate(() => {
    const gl = (window as unknown as { __stageGl: WebGL2RenderingContext | null }).__stageGl;
    return gl === null ? null : gl.isContextLost();
  });

const draws = (page: Page) =>
  page.evaluate(() => (window as unknown as { __draws: number }).__draws);

async function expectStaticFallback(page: Page) {
  await expect(stage(page)).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(emblem(page)).toBeVisible();
  await expect(poster(page)).toHaveCSS("opacity", "1");
}

/** No retry in the visit: Off → Full creates no new stage context and draws nothing. */
async function expectNoRetry(page: Page) {
  const before = await draws(page);
  await chooseMotion(page, "Off");
  await chooseMotion(page, "Full");
  await page.waitForTimeout(1000);
  await expect(stage(page)).toHaveCount(0);
  expect(await draws(page)).toBe(before);
}

test.beforeEach(async ({ page }) => {
  await stubDevice(page, { webgl2: true });
});

test("a draw call that throws mid-visit stops rendering and leaves the static design", async ({
  page,
}) => {
  await injectFaults(page);
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  expect(await draws(page)).toBeGreaterThan(0);

  await page.evaluate(() => {
    (window as unknown as { __faults: { draw: boolean } }).__faults.draw = true;
  });
  await expectStaticFallback(page);
  expect(await stageContextLost(page), "the stage's WebGL context was released").toBe(true);
  // The loop stopped: the fault stays armed, yet nothing else is attempted.
  const attempts = await draws(page);
  await page.waitForTimeout(500);
  expect(await draws(page)).toBe(attempts);
  await page.evaluate(() => {
    (window as unknown as { __faults: { draw: boolean } }).__faults.draw = false;
  });
  await expectNoRetry(page);
});

test.describe("renderer construction failure", () => {
  // Three.js reports its own failed construction on the console; the page must be unaffected.
  test.use({ allowedErrors: [/THREE\.WebGLRenderer/] });

  test("a renderer that fails part-way through construction leaves no canvas behind", async ({
    page,
  }) => {
    await injectFaults(page, { precision: true });
    await page.goto("/");
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __stageContexts: number }).__stageContexts),
      )
      .toBeGreaterThanOrEqual(1);
    await expectStaticFallback(page);
    // Codex M2.4a final review: the context created before the constructor threw is released,
    // not merely detached with its canvas.
    expect(await stageContextLost(page), "the stage's WebGL context was released").toBe(true);
    await expectNoRetry(page);
  });
});

test("rebuilding after a context restore that fails falls back the same way", async ({ page }) => {
  await injectFaults(page);
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".os-stage canvas")!.getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context")!;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose = lose;
    lose.loseContext();
  });
  await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
  // The rebuilt layers' first upload fails.
  await page.evaluate(() => {
    const w = window as unknown as { __faults: { buffer: boolean }; __lose: WEBGL_lose_context };
    w.__faults.buffer = true;
    w.__lose.restoreContext();
  });
  await expectStaticFallback(page);
});

test("a context restore never deletes old GPU objects through the new context", async ({
  page,
}) => {
  // Chromium reports these as warnings, WebKit as errors: either way the old layers must be
  // released while the context is lost, never after the restore.
  const foreign: string[] = [];
  page.on("console", (message) => {
    if (/does not belong to this context/i.test(message.text())) foreign.push(message.text());
  });
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".os-stage canvas")!.getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context")!;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose = lose;
    lose.loseContext();
  });
  await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
  await page.evaluate(() =>
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext(),
  );
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  await expect(stage(page)).toHaveAttribute("data-nex-particles", /^\d+$/);
  await page.waitForTimeout(500);
  expect(foreign).toEqual([]);
});

/** WebGL draw calls per rendered frame on the stage canvas (most common value over 30 frames). */
function drawsPerFrame(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = window as unknown as { __draws: number };
        const counts: number[] = [];
        let last = w.__draws;
        const tick = () => {
          counts.push(w.__draws - last);
          last = w.__draws;
          if (counts.length < 30) requestAnimationFrame(tick);
          else {
            const freq = new Map<number, number>();
            for (const n of counts.filter((c) => c > 0)) freq.set(n, (freq.get(n) ?? 0) + 1);
            resolve([...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

async function loseAndRestore(page: Page) {
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".os-stage canvas")!.getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context")!;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose = lose;
    lose.loseContext();
  });
  await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
  await page.evaluate(() =>
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext(),
  );
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
}

test("repeated loss and restore keep one canvas, one loop and the exact draw calls", async ({
  page,
  isMobile,
}) => {
  const foreign: string[] = [];
  page.on("console", (message) => {
    if (/does not belong to this context/i.test(message.text())) foreign.push(message.text());
  });
  await injectFaults(page);
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  const expected = isMobile ? 7 : 8;
  expect(await drawsPerFrame(page)).toBe(expected);
  for (let cycle = 0; cycle < 2; cycle++) {
    await loseAndRestore(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    // A duplicated loop or layer set would multiply the draws per frame.
    expect(await drawsPerFrame(page)).toBe(expected);
    await expect(stage(page)).toHaveAttribute("data-nex-particles", /^\d+$/);
  }
  expect(await stageContextLost(page)).toBe(false);
  expect(foreign).toEqual([]);
});

test("the stage's WebGL context keeps the approved attributes", async ({ page }) => {
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  const attributes = await page.evaluate(() =>
    document
      .querySelector<HTMLCanvasElement>(".os-stage canvas")!
      .getContext("webgl2")!
      .getContextAttributes(),
  );
  expect(attributes).toMatchObject({
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
});

test.describe("flow format after a context restore", () => {
  /** Zero-fill float and/or byte readbacks, so the probe rejects those formats (as in nex.spec). */
  async function corruptReadbacks(page: Page, { float, byte }: { float: boolean; byte: boolean }) {
    await page.addInitScript(
      ([f, b]) => {
        const w = window as unknown as { __readbacks: number };
        w.__readbacks = 0;
        const original = WebGL2RenderingContext.prototype.readPixels as (
          this: WebGL2RenderingContext,
          ...args: unknown[]
        ) => void;
        WebGL2RenderingContext.prototype.readPixels = function (
          this: WebGL2RenderingContext,
          ...args: unknown[]
        ) {
          original.apply(this, args);
          w.__readbacks += 1;
          if (f && args[5] === this.FLOAT && args[6] instanceof Float32Array) args[6].fill(0);
          if (b && args[5] === this.UNSIGNED_BYTE && args[6] instanceof Uint8Array) args[6].fill(0);
        };
      },
      [float, byte] as const,
    );
  }
  const readbacks = (page: Page) =>
    page.evaluate(() => (window as unknown as { __readbacks: number }).__readbacks);

  test("RGBA8: the restored context is validated again and keeps RGBA8", async ({ page }) => {
    await corruptReadbacks(page, { float: true, byte: false });
    await page.goto("/");
    await expect(stage(page)).toHaveAttribute("data-stage-flow", "rgba8");
    const before = await readbacks(page);
    expect(before).toBe(2); // half-float rejected, RGBA8 accepted
    await loseAndRestore(page);
    await expect(stage(page)).toHaveAttribute("data-stage-flow", "rgba8");
    await expect(stage(page)).toHaveAttribute("data-nex-flow", "rgba8");
    expect(await readbacks(page)).toBe(before * 2);
  });

  test("analytic: nothing validates on the restored context either", async ({ page }) => {
    await corruptReadbacks(page, { float: true, byte: true });
    await page.goto("/");
    await expect(stage(page)).toHaveAttribute("data-stage-flow", "analytic");
    await loseAndRestore(page);
    await expect(stage(page)).toHaveAttribute("data-stage-flow", "analytic");
    await expect(stage(page)).toHaveAttribute("data-nex-flow", "analytic");
  });
});
