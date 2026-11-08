import type { Page } from "@playwright/test";

/**
 * Stub the device so WebGL-stage tests don't depend on the CI machine's GPU or network hints.
 * Must be called before `page.goto()`.
 */
export async function stubDevice(
  page: Page,
  { webgl2, saveData = false }: { webgl2: boolean; saveData?: boolean },
) {
  await page.addInitScript(
    ([available, save]) => {
      const original = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error: test stub replacing an overloaded DOM method
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type === "webgl2")
          return available ? { getExtension: () => ({ loseContext() {} }) } : null;
        return original.call(this, type, ...args);
      };
      Object.defineProperty(Navigator.prototype, "connection", {
        configurable: true,
        get: () => ({ saveData: save }),
      });
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
    [webgl2, saveData] as const,
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
