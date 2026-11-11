import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * NEX's orbit-frame transport (Milestone 2.4b.1b), with a real renderer. The approved uniform
 * transport stays the default; `?orbits=texture` selects the RGBA32F texture transport when the
 * capability probe passes on the context. Instrumentation proves which transport actually runs:
 * the probe's 4×2 readbacks, the 3×21 RGBA32F table's allocations and per-frame uploads, and the
 * uniforms of every linked program (texture programs read `uOrbitTable`, never `uFrames`).
 */

const stage = (page: Page) => page.locator(".os-stage");

interface Counters {
  __orbitProbes: number;
  __orbitAllocations: number;
  __orbitUploads: number;
  __uniformNames: string[];
  __draws: number;
  __corruptOrbitProbe: boolean;
  __lose?: WEBGL_lose_context;
}

async function instrument(page: Page, { corruptProbe = false } = {}) {
  await page.addInitScript((corrupt) => {
    const w = window as unknown as Counters;
    Object.assign(w, {
      __orbitProbes: 0,
      __orbitAllocations: 0,
      __orbitUploads: 0,
      __uniformNames: [],
      __draws: 0,
      __corruptOrbitProbe: corrupt,
    });
    const proto = WebGL2RenderingContext.prototype;
    const wrap = <K extends keyof WebGL2RenderingContext>(
      name: K,
      before: (gl: WebGL2RenderingContext, args: unknown[]) => void,
      after?: (gl: WebGL2RenderingContext, args: unknown[], result: unknown) => void,
    ) => {
      const original = proto[name] as unknown as (...args: unknown[]) => unknown;
      (proto as unknown as Record<string, unknown>)[name] = function (
        this: WebGL2RenderingContext,
        ...args: unknown[]
      ) {
        before(this, args);
        const result = original.apply(this, args);
        after?.(this, args, result);
        return result;
      };
    };
    // The orbit probe reads its 4×2 RGBA8 target back once per context.
    wrap(
      "readPixels",
      () => {},
      (gl, args) => {
        if (args[2] !== 4 || args[3] !== 2 || args[5] !== gl.UNSIGNED_BYTE) return;
        w.__orbitProbes += 1;
        if (w.__corruptOrbitProbe) (args[6] as Uint8Array)[13] = 0; // one channel mismatched
      },
    );
    // The orbit table: a 3 × 21 RGBA32F texture, allocated once, updated in place.
    wrap("texStorage2D", (gl, args) => {
      if (args[2] === gl.RGBA32F && args[3] === 3 && args[4] === 21) w.__orbitAllocations += 1;
    });
    wrap("texSubImage2D", (gl, args) => {
      if (args[4] === 3 && args[5] === 21 && args[7] === gl.FLOAT) w.__orbitUploads += 1;
    });
    wrap(
      "getActiveUniform",
      () => {},
      (_gl, _args, info) => {
        const name = (info as WebGLActiveInfo | null)?.name;
        if (name) w.__uniformNames.push(name);
      },
    );
    for (const name of ["drawArrays", "drawElements"] as const) wrap(name, () => (w.__draws += 1));
  }, corruptProbe);
}

const read = <K extends keyof Counters>(page: Page, key: K) =>
  page.evaluate((k) => (window as unknown as Counters)[k], key) as Promise<Counters[K]>;

/** Counter increments and the most common draw count per rendered frame, over 40 frames. */
function sampleFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ frames: number; uploads: number; draws: number }>((resolve) => {
        const w = window as unknown as Counters;
        const counts: number[] = [];
        let last = w.__draws;
        const uploads = w.__orbitUploads;
        const tick = () => {
          counts.push(w.__draws - last);
          last = w.__draws;
          if (counts.length < 40) return requestAnimationFrame(tick);
          const rendered = counts.filter((n) => n > 0);
          const freq = new Map<number, number>();
          for (const n of rendered) freq.set(n, (freq.get(n) ?? 0) + 1);
          resolve({
            frames: rendered.length,
            uploads: w.__orbitUploads - uploads,
            draws: [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0,
          });
        };
        requestAnimationFrame(tick);
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await stubDevice(page, { webgl2: true });
});

test("by default NEX uses the approved uniform transport, and the probe never runs", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await expect(stage(page)).toHaveAttribute("data-stage-orbits", "uniforms");
  const names = await read(page, "__uniformNames");
  expect(names).toContain("uFrames[0]");
  expect(names).not.toContain("uOrbitTable");
  expect(await read(page, "__orbitProbes")).toBe(0);
  expect(await read(page, "__orbitAllocations")).toBe(0);
});

test("?orbits=texture draws NEX through the RGBA32F orbit table on a capable context", async ({
  page,
  isMobile,
}) => {
  await instrument(page);
  await page.goto("/?orbits=texture");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await expect(stage(page)).toHaveAttribute("data-stage-orbits", "texture");
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  expect(await read(page, "__orbitProbes")).toBe(1);
  // The linked NEX programs read the table; no program uses the uniform arrays.
  const names = await read(page, "__uniformNames");
  expect(names).toContain("uOrbitTable");
  expect(names).not.toContain("uFrames[0]");
  // One table, updated in place: one upload per rendered frame, never reallocated.
  const sample = await sampleFrames(page);
  expect(sample.draws).toBe(isMobile ? 7 : 8);
  expect(sample.frames).toBeGreaterThan(20);
  expect(sample.uploads).toBe(sample.frames);
  expect(await read(page, "__orbitAllocations")).toBe(1);
});

test("a context that fails the orbit probe falls back to the uniform transport", async ({
  page,
  isMobile,
}) => {
  await instrument(page, { corruptProbe: true });
  await page.goto("/?orbits=texture");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await expect(stage(page)).toHaveAttribute("data-stage-orbits", "uniforms");
  expect(await read(page, "__orbitProbes")).toBe(1);
  const names = await read(page, "__uniformNames");
  expect(names).toContain("uFrames[0]");
  expect(names).not.toContain("uOrbitTable");
  expect(await read(page, "__orbitAllocations")).toBe(0);
  expect((await sampleFrames(page)).draws).toBe(isMobile ? 7 : 8);
});

test("a restored context probes again and rebuilds the orbit table", async ({ page }) => {
  await instrument(page);
  await page.goto("/?orbits=texture");
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true");
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".os-stage canvas")!.getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context")!;
    (window as unknown as Counters).__lose = lose;
    lose.loseContext();
  });
  await expect(stage(page)).toHaveAttribute("data-stage-state", "lost");
  await page.evaluate(() => (window as unknown as Counters).__lose!.restoreContext());
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-stage-orbits", "texture");
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  expect(await read(page, "__orbitProbes")).toBe(2);
  expect(await read(page, "__orbitAllocations")).toBe(2);
  const sample = await sampleFrames(page);
  expect(sample.uploads).toBe(sample.frames);
});

test("reduced motion with the texture transport: one still frame, no continuous uploads", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await instrument(page);
  await page.goto("/?orbits=texture");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "static");
  await expect(stage(page)).toHaveAttribute("data-stage-orbits", "texture");
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  await page.waitForTimeout(500);
  const sample = await sampleFrames(page);
  expect(sample.frames).toBe(0);
  expect(sample.uploads).toBe(0);
});
