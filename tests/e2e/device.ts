import type { Page } from "@playwright/test";

/**
 * Stub the device so WebGL-stage tests don't depend on the test machine's GPU or network hints.
 * Must be called before `page.goto()`.
 *
 * - `webgl2: true` creates **real** WebGL2 contexts, but drops `failIfMajorPerformanceCaveat`, so
 *   CI machines with only software rendering (SwiftShader) still run the stage. Production code
 *   keeps the caveat: real visitors on software rendering get the static design.
 * - `webgl2: false` makes every WebGL2 context request fail.
 * - `failRendererContext: true` lets the capability probe succeed but makes the renderer's own
 *   context creation fail (context creation failure after a successful probe).
 * - Save-Data comes from a controllable Network Information stub; `setSaveData(page, value)`
 *   changes it and fires `change`, as Chromium does.
 */
export async function stubDevice(
  page: Page,
  {
    webgl2,
    saveData = false,
    failRendererContext = false,
  }: { webgl2: boolean; saveData?: boolean; failRendererContext?: boolean },
) {
  await page.addInitScript(
    ([available, save, failRenderer]) => {
      const original = HTMLCanvasElement.prototype.getContext;
      let webgl2Requests = 0;
      // @ts-expect-error: test stub replacing an overloaded DOM method
      HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
        if (type === "webgl2") {
          webgl2Requests += 1;
          (window as unknown as { __webgl2Requests: number }).__webgl2Requests = webgl2Requests;
          if (!available) return null;
          // The first request is the capability probe; later ones come from the renderer.
          if (failRenderer && webgl2Requests > 1) return null;
          return original.call(this, type, { ...options, failIfMajorPerformanceCaveat: false });
        }
        return original.call(this, type, options);
      };

      const connection = new EventTarget() as EventTarget & { saveData: boolean };
      connection.saveData = save;
      Object.defineProperty(Navigator.prototype, "connection", {
        configurable: true,
        get: () => connection,
      });
      (window as unknown as { __setSaveData: (value: boolean) => void }).__setSaveData = (
        value: boolean,
      ) => {
        connection.saveData = value;
        connection.dispatchEvent(new Event("change"));
      };
      // Desktop-class hints, so the tier reflects the motion policy rather than the CI machine.
      Object.defineProperty(Navigator.prototype, "deviceMemory", {
        configurable: true,
        get: () => 8,
      });
      Object.defineProperty(Navigator.prototype, "hardwareConcurrency", {
        configurable: true,
        get: () => 8,
      });
    },
    [webgl2, saveData, failRendererContext] as const,
  );
}

export async function setSaveData(page: Page, value: boolean) {
  await page.evaluate(
    (v) => (window as unknown as { __setSaveData: (value: boolean) => void }).__setSaveData(v),
    value,
  );
}

/** Record requests for the lazy 3D stage chunk. */
export function trackStageRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/Stage-[\w-]+\.js$/.test(request.url())) requests.push(request.url());
  });
  return requests;
}

/** Long enough for requestIdleCallback's 2 s timeout to have fired. */
export const settle = (page: Page) => page.waitForTimeout(2500);
