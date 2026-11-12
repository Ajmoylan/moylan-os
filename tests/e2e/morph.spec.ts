import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * The first real morph (Milestone 2.4b.2 stage D), with a real renderer and real client-side
 * navigation. `?morph=test` lazily loads the diagnostic TEST shape and draws it on FORGE's route;
 * without the switch nothing changes (TEST is never loaded). Instrumentation records the stage's
 * transition states as they are published, draw calls per frame, and live GPU buffer bytes.
 */

const stage = (page: Page) => page.locator(".os-stage");

interface Probe {
  __states: string[];
  __draws: number;
  __live: number;
  __peak: number;
  __programs: number;
  __lose?: WEBGL_lose_context;
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Probe;
    Object.assign(w, { __states: [], __draws: 0, __live: 0, __peak: 0, __programs: 0 });
    const sizes = new Map<WebGLBuffer, number>();
    const bound = new Map<number, WebGLBuffer | null>();
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, unknown>;
    const wrap = (name: string, fn: (gl: WebGL2RenderingContext, args: unknown[]) => void) => {
      const original = proto[name] as (...args: unknown[]) => unknown;
      proto[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
        fn(this, args);
        return original.apply(this, args);
      };
    };
    wrap("bindBuffer", (_gl, [target, buffer]) =>
      bound.set(target as number, buffer as WebGLBuffer | null),
    );
    wrap("bufferData", (_gl, [target, data]) => {
      const buffer = bound.get(target as number);
      if (!buffer) return;
      const bytes = typeof data === "number" ? data : (data as ArrayBufferView).byteLength;
      w.__live += bytes - (sizes.get(buffer) ?? 0);
      sizes.set(buffer, bytes);
      w.__peak = Math.max(w.__peak, w.__live);
    });
    wrap("deleteBuffer", (_gl, [buffer]) => {
      w.__live -= sizes.get(buffer as WebGLBuffer) ?? 0;
      sizes.delete(buffer as WebGLBuffer);
    });
    wrap("createProgram", () => (w.__programs += 1));
    wrap("deleteProgram", () => (w.__programs -= 1));
    for (const name of ["drawArrays", "drawElements"]) wrap(name, () => (w.__draws += 1));
    // Every value of `data-stage-transition`, in order (consecutive repeats collapsed).
    new MutationObserver(() => {
      const value = document.querySelector<HTMLElement>(".os-stage")?.dataset.stageTransition;
      if (value && w.__states.at(-1) !== value) w.__states.push(value);
    }).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-stage-transition"],
    });
  });
}

const read = <K extends keyof Probe>(page: Page, key: K) =>
  page.evaluate((k) => (window as unknown as Probe)[k], key) as Promise<Probe[K]>;

/** The largest and the most common number of draws per rendered frame, over `frames` frames. */
function sampleDraws(page: Page, frames = 40) {
  return page.evaluate(
    (n) =>
      new Promise<{ max: number; mode: number }>((resolve) => {
        const w = window as unknown as Probe;
        const counts: number[] = [];
        let last = w.__draws;
        const tick = () => {
          const drawn = w.__draws - last;
          last = w.__draws;
          if (drawn > 0) counts.push(drawn);
          if (counts.length < n) return requestAnimationFrame(tick);
          const freq = new Map<number, number>();
          for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
          resolve({
            max: Math.max(...counts),
            mode: [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0],
          });
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );
}

const toEngineering = (page: Page) =>
  page
    .getByRole("region", { name: "Choose an environment" })
    .getByRole("link", { name: "Engineering" })
    .click();
const toHome = (page: Page) => page.getByRole("link", { name: "Return to NEX" }).first().click();

test.beforeEach(async ({ page }) => {
  await stubDevice(page, { webgl2: true });
});

test("without the switch TEST is never loaded and /engineering keeps today's behaviour", async ({
  page,
}) => {
  const chunks: string[] = [];
  page.on("request", (request) => chunks.push(request.url()));
  await instrument(page);
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(page).toHaveURL(/\/engineering$/);
  await expect(stage(page)).toHaveAttribute("data-agent-state", "hidden"); // NEX fades out
  expect(chunks.filter((url) => /\/assets\/test-[^/]*\.js$/.test(url))).toEqual([]);
  await expect(stage(page)).not.toHaveAttribute("data-test-state", /./);
  expect(await read(page, "__states")).not.toContain("preparing");
});

test("?morph=test: NEX morphs into TEST on navigation, and back, within the draw budget", async ({
  page,
  isMobile,
}) => {
  await instrument(page);
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  const idle = await sampleDraws(page);
  expect(idle.mode).toBe(isMobile ? 7 : 8);
  const baseline = await read(page, "__live");

  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "morphing");
  const during = await sampleDraws(page, 20);
  expect(during.max).toBeLessThanOrEqual(10);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
  await expect(stage(page)).not.toHaveAttribute("data-nex-state", /./); // NEX's view released
  expect(await read(page, "__states")).toEqual(
    expect.arrayContaining(["preparing", "morphing", "settling", "idle"]),
  );
  // The morph geometry borrowed both views' buffers: settled, one particle set is live again.
  const settled = await read(page, "__live");
  expect(settled - baseline).toBeLessThanOrEqual(1_000_000);

  await toHome(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "morphing");
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await expect(stage(page)).not.toHaveAttribute("data-test-state", /./);
  expect((await sampleDraws(page)).mode).toBe(isMobile ? 7 : 8);
  expect((await read(page, "__live")) - baseline).toBeLessThanOrEqual(1_000_000);
  expect(await read(page, "__peak")).toBeLessThanOrEqual(baseline + 2_100_000);
});

test("?morph=test with Reduced Motion: TEST appears formed at once, no morph", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await instrument(page);
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "static");
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
  const states = await read(page, "__states");
  expect(states).not.toContain("preparing");
  expect(states).not.toContain("morphing");
});

test("?morph=test, rapid navigation: the latest destination wins, nothing left over", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "morphing");
  await toHome(page);
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/engineering$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/\?morph=test$/); // back to the first entry
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  await expect(stage(page)).not.toHaveAttribute("data-test-state", /./);
});

test("?morph=test, context lost mid-morph: restored with the latest destination drawn", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "morphing");
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".os-stage canvas")!.getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context")!;
    (window as unknown as Probe).__lose = lose;
    lose.loseContext();
  });
  await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
  await page.evaluate(() => (window as unknown as Probe).__lose!.restoreContext());
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
});

const motionButton = (page: Page) => page.getByRole("button", { name: /^Motion/ });

async function chooseMotion(page: Page, option: "Full" | "Reduced" | "Off") {
  const button = motionButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await page.getByRole("radio", { name: option, exact: true }).check();
  await page.keyboard.press("Escape");
}

test("?morph=test, motion set to Off mid-morph: the static design; Full returns to the latest agent", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "morphing");
  await chooseMotion(page, "Off");
  await expect(stage(page)).toHaveCount(0); // no canvas, no loop: the static design
  expect(await read(page, "__live")).toBe(0); // every buffer released with the stage
  await chooseMotion(page, "Full");
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
});

test("?morph=test, motion set to Reduced mid-morph: the destination at once, formed and still", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "morphing");
  await chooseMotion(page, "Reduced");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "static");
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle");
  await expect(stage(page)).not.toHaveAttribute("data-nex-state", /./);
});

test("?morph=test, navigation while the tab is hidden: one swap at the first visible frame", async ({
  page,
}) => {
  await instrument(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __hidden: boolean };
    w.__hidden = false;
    Object.defineProperty(Document.prototype, "hidden", {
      configurable: true,
      get: () => w.__hidden,
    });
    Object.defineProperty(Document.prototype, "visibilityState", {
      configurable: true,
      get: () => (w.__hidden ? "hidden" : "visible"),
    });
  });
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      (window as unknown as { __hidden: boolean }).__hidden = h;
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await setHidden(true);
  await expect(stage(page)).toHaveAttribute("data-stage-state", "paused");
  await page.evaluate(() => (window as unknown as Probe).__states.splice(0));
  await toEngineering(page);
  await expect(page).toHaveURL(/\/engineering$/);
  await setHidden(false);
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
  const states = await read(page, "__states");
  expect(states).not.toContain("preparing");
  expect(states).not.toContain("morphing");
});
