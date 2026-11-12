import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * Device-specific agent viability and shader-failure paths (Milestone 2.4b.2 remediation; proposal
 * §6.6), with a real renderer and the diagnostic TEST shape (`?morph=test`):
 * - a constrained device (vertex-uniform limit and a failed float-texture probe) makes NEX
 *   unsupported: its accessible poster stays, the Stage keeps running, and TEST still draws;
 * - an idle program that fails to link: one fallback transport, else the agent is unsupported,
 *   never retried in the context, never a Stage failure;
 * - the context lost and restored while compilation is pending: nothing from the old context
 *   generation reaches the restored one, no GL error, no shader left behind, no polling left over.
 */

const stage = (page: Page) => page.locator(".os-stage");
/** NEX's arrival (≈ 3 s of frames) under CPU contention; the assertion itself is unchanged. */
const ARRIVAL_TIMEOUT = 15_000;
const poster = (page: Page) => page.locator("[data-nex-poster]");

interface Probe {
  __programs: Record<string, number>;
  __liveShaders: number;
  __crossContext: string[];
  __generation: number;
  __hold: boolean;
  __timers10: number;
  __lose?: WEBGL_lose_context;
}

interface Faults {
  /** MAX_VERTEX_UNIFORM_VECTORS reported to the stage. */
  maxVectors?: number;
  /** Corrupt the orbit probe's readback (the float-texture probe fails). */
  corruptProbe?: boolean;
  /** Programs (by label) whose link status is reported as failed. */
  failLink?: string[];
  /** Hold KHR_parallel_shader_compile completion for programs with these labels while __hold. */
  hold?: string[];
}

async function instrument(page: Page, faults: Faults = {}) {
  await page.addInitScript((f: Faults) => {
    const w = window as unknown as Probe;
    Object.assign(w, {
      __programs: {},
      __liveShaders: 0,
      __crossContext: [],
      __generation: 0,
      __hold: true,
      __timers10: 0,
    });
    const proto = WebGL2RenderingContext.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const sources = new WeakMap<object, string>();
    const vertexOf = new WeakMap<object, string>();
    const generation = new WeakMap<object, number>();
    const label = (source: string) =>
      /void particleA\(/.test(source) && /void particleB\(/.test(source)
        ? "pair"
        : /void particleB\(/.test(source)
          ? "test"
          : /uniform mat3 uFrames\[/.test(source)
            ? "nex-uniforms"
            : /uOrbitTable/.test(source)
              ? "nex-texture"
              : "other";
    const labelOf = (program: object) => label(vertexOf.get(program) ?? "");
    const wrap = (
      name: string,
      fn: (gl: WebGL2RenderingContext, args: unknown[], next: () => unknown) => unknown,
    ) => {
      const original = proto[name]!;
      proto[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
        return fn(this, args, () => original.apply(this, args));
      };
    };
    // Old-generation handles passed to GL after a restore.
    for (const name of [
      "deleteShader",
      "deleteProgram",
      "getProgramParameter",
      "getShaderParameter",
      "getAttachedShaders",
      "useProgram",
      "attachShader",
      "getUniformLocation",
      "getActiveUniform",
    ]) {
      wrap(name, (_gl, args, next) => {
        for (const a of args) {
          if (
            a &&
            typeof a === "object" &&
            generation.has(a) &&
            generation.get(a)! < w.__generation
          ) {
            w.__crossContext.push(name);
          }
        }
        return next();
      });
    }
    wrap("createShader", (_gl, _args, next) => {
      const s = next() as object;
      if (s) generation.set(s, w.__generation);
      w.__liveShaders++;
      return s;
    });
    wrap("deleteShader", (_gl, args, next) => {
      if (args[0] && generation.get(args[0] as object) === w.__generation) w.__liveShaders--;
      return next();
    });
    wrap("shaderSource", (_gl, args, next) => {
      sources.set(args[0] as object, args[1] as string);
      return next();
    });
    wrap("createProgram", (_gl, _args, next) => {
      const p = next() as object;
      if (p) generation.set(p, w.__generation);
      return p;
    });
    wrap("attachShader", (_gl, args, next) => {
      const source = sources.get(args[1] as object) ?? "";
      if (/gl_Position|void particle[AB]\(/.test(source)) {
        vertexOf.set(args[0] as object, source);
        const l = label(source);
        w.__programs[l] = (w.__programs[l] ?? 0) + 1;
      }
      return next();
    });
    const COMPLETION = 0x91b1;
    wrap("getExtension", (_gl, args, next) => {
      const ext = next();
      if (args[0] === "KHR_parallel_shader_compile" && !ext && f.hold)
        return { COMPLETION_STATUS_KHR: COMPLETION };
      return ext;
    });
    wrap("getProgramParameter", (gl, args, next) => {
      const [program, pname] = args as [object, number];
      if (pname === COMPLETION && f.hold) {
        if (w.__hold && f.hold.includes(labelOf(program))) return false;
        const native = next();
        return native === null || native === undefined ? true : native;
      }
      if (pname === gl.LINK_STATUS && f.failLink?.includes(labelOf(program))) {
        next();
        return false;
      }
      return next();
    });
    wrap("getParameter", (gl, args, next) =>
      f.maxVectors && args[0] === gl.MAX_VERTEX_UNIFORM_VECTORS ? f.maxVectors : next(),
    );
    if (f.corruptProbe) {
      wrap("readPixels", (_gl, args, next) => {
        const r = next();
        if (args[2] === 4 && args[3] === 2) (args[6] as Uint8Array)[13] = 0; // the orbit probe's 4×2
        return r;
      });
    }
    // Three's compileAsync polls with 10 ms timers: count them (a lingering poll keeps adding).
    const setTimeoutNative = window.setTimeout.bind(window);
    (window as unknown as { setTimeout: unknown }).setTimeout = (
      cb: TimerHandler,
      ms?: number,
      ...rest: unknown[]
    ) => {
      if (ms === 10) w.__timers10++;
      return setTimeoutNative(cb, ms, ...rest);
    };
  }, faults);
}

const read = <K extends keyof Probe>(page: Page, key: K) =>
  page.evaluate((k) => (window as unknown as Probe)[k], key) as Promise<Probe[K]>;

const toEngineering = (page: Page) =>
  page
    .getByRole("region", { name: "Choose an environment" })
    .getByRole("link", { name: "Engineering" })
    .click();
const toHome = (page: Page) => page.getByRole("link", { name: "Return to NEX" }).first().click();

test.beforeEach(async ({ page }) => {
  await stubDevice(page, { webgl2: true });
});

test("a constrained device: NEX unsupported (poster, Stage running), TEST still draws, nothing NEX compiled", async ({
  page,
}) => {
  await instrument(page, { maxVectors: 100, corruptProbe: true }); // 112 > 68; texture probe fails
  await page.goto("/?morph=test");
  await expect(stage(page)).toHaveAttribute("data-agent-support", "unsupported");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await expect(stage(page)).toHaveAttribute("data-agent-state", "unsupported");
  await expect(poster(page)).toHaveCSS("opacity", "1");
  await expect(page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect((await read(page, "__programs"))["nex-uniforms"] ?? 0).toBe(0);
  expect((await read(page, "__programs"))["nex-texture"] ?? 0).toBe(0);
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible"); // 22 ≤ 68: supported
  await expect(stage(page)).not.toHaveAttribute("data-agent-support", /./);
  await toHome(page);
  await expect(stage(page)).toHaveAttribute("data-agent-support", "unsupported");
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running"); // never fail()ed
  expect((await read(page, "__programs"))["nex-uniforms"] ?? 0).toBe(0);
  expect((await read(page, "__programs"))["pair"] ?? 0).toBe(0); // no morph to or from it
});

test("TEST's idle program fails to link while preparing: unsupported, never drawn, never retried", async ({
  page,
}) => {
  await instrument(page, { failLink: ["test"] });
  await page.goto("/?morph=test");
  // NEX's arrival takes ≈ 3 s of frames; under CPU contention that can exceed the default 5 s.
  await expect(stage(page)).toHaveAttribute("data-nex-formed", "true", {
    timeout: ARRIVAL_TIMEOUT,
  });
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toEngineering(page);
  await expect(stage(page)).toHaveAttribute("data-agent-support", "unsupported");
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "unsupported");
  await expect(stage(page)).not.toHaveAttribute("data-test-state", /./);
  await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
  await toHome(page);
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  await expect(stage(page)).not.toHaveAttribute("data-agent-support", /./);
  await toEngineering(page); // again: the verdict is cached for this context
  await expect(stage(page)).toHaveAttribute("data-agent-support", "unsupported");
  expect((await read(page, "__programs"))["test"]).toBe(1); // compiled once in this context
});

test("NEX's uniform-transport programs fail to link: the texture transport is used, once", async ({
  page,
}) => {
  await instrument(page, { failLink: ["nex-uniforms"] });
  await page.goto("/engineering?morph=test");
  await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await toHome(page);
  await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
  await expect(stage(page)).toHaveAttribute("data-stage-orbits", "texture");
  await expect(stage(page)).not.toHaveAttribute("data-agent-support", /./);
  const programs = await read(page, "__programs");
  expect(programs["nex-texture"]).toBeGreaterThan(0);
});

for (const gap of [150, 0]) {
  test(`context lost and restored ${gap ? "150 ms later" : "at once"} while compilation is pending: no old handle, no GL error, nothing left`, async ({
    page,
  }) => {
    await instrument(page, { hold: ["pair", "test"] });
    await page.goto("/?morph=test");
    await expect(stage(page)).toHaveAttribute("data-nex-formed", "true", {
      timeout: ARRIVAL_TIMEOUT,
    });
    await page.waitForFunction(() => "__reactRouterRouteModules" in window);
    await toEngineering(page);
    await expect(stage(page)).toHaveAttribute("data-stage-transition", "preparing");
    await expect(stage(page)).toHaveAttribute("data-morph-program", "compiling");
    // A restore "at once" lands before Three's next 10 ms poll: the pending compiles resolve on the
    // restored context, the case the generation guard exists for.
    await page.evaluate((delay) => {
      const w = window as unknown as Probe;
      const gl = document
        .querySelector<HTMLCanvasElement>(".os-stage canvas")!
        .getContext("webgl2")!;
      const lose = gl.getExtension("WEBGL_lose_context")!;
      w.__lose = lose;
      const restore = () => {
        w.__generation++; // handles created from here on belong to the restored context
        w.__liveShaders = 0;
        lose.restoreContext();
      };
      gl.canvas.addEventListener("webglcontextlost", () => setTimeout(restore, delay), {
        once: true,
      });
      lose.loseContext();
    }, gap);
    await expect(stage(page)).toHaveAttribute("data-stage-state", "running");
    await page.evaluate(() => ((window as unknown as Probe).__hold = false));
    await expect(stage(page)).toHaveAttribute("data-test-state", "visible");
    await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
    await page.waitForTimeout(300);
    // No 10 ms poll is still running.
    const before = await read(page, "__timers10");
    await page.waitForTimeout(400);
    expect(await read(page, "__timers10")).toBe(before);
    expect(await read(page, "__crossContext")).toEqual([]);
    expect(await read(page, "__liveShaders")).toBe(0);
    const glError = await page.evaluate(() => {
      const gl = document
        .querySelector<HTMLCanvasElement>(".os-stage canvas")!
        .getContext("webgl2")!;
      return gl.getError();
    });
    expect(glError).toBe(0);
    // And a morph on the restored context still works.
    await toHome(page);
    await expect(stage(page)).toHaveAttribute("data-stage-transition", "morphing");
    await expect(stage(page)).toHaveAttribute("data-stage-transition", "idle", { timeout: 10_000 });
    await expect(stage(page)).toHaveAttribute("data-nex-state", "visible");
    expect(await read(page, "__crossContext")).toEqual([]);
  });
}
