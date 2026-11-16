import type { Page } from "@playwright/test";
import { stubDevice } from "./device";
import { expect, test } from "./fixtures";

/**
 * NEX's companion mirror (src/experience/nex/mirror.ts) copies the dock's region of the stage's
 * frame into a canvas above the page. It must line up exactly with NEX drawn behind the page: in
 * Safari a mirror box that reached past the screen's edge was drawn stretched across its visible
 * part, which put its rings beside NEX's own (doubled, blurry rings in companion mode).
 */

const mirror = (page: Page) => page.locator("canvas[data-nex-mirror]");

async function dock(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await expect(page.locator(".os-stage")).toHaveAttribute("data-nex-formed", "true");
  await page.locator("#work-title").evaluate((el) => el.scrollIntoView());
  await expect(mirror(page)).toHaveAttribute("data-visible", "");
}

test.describe("NEX's companion mirror", () => {
  test.beforeEach(async ({ page }) => {
    await stubDevice(page, { webgl2: true });
  });

  test("stays inside the screen at phone, tablet and desktop sizes", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await dock(page);
    for (const [width, height] of [
      [320, 640],
      [375, 667],
      [390, 844],
      [440, 956],
      [768, 1024],
      [1280, 800],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => mirror(page).evaluate((m) => m.getBoundingClientRect().width))
        .toBeGreaterThan(0);
      const box = await mirror(page).evaluate((m) => m.getBoundingClientRect().toJSON());
      expect(box.left, `${width}×${height}`).toBeGreaterThanOrEqual(0);
      expect(box.top, `${width}×${height}`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${width}×${height}`).toBeLessThanOrEqual(width);
      expect(box.bottom, `${width}×${height}`).toBeLessThanOrEqual(height);
    }
  });

  test.describe("pixel registration", () => {
    // WebKit: Playwright's own screenshot step injects an inline style, which the site's CSP refuses
    // (the page itself adds none; every other test fails on any CSP violation).
    test.use({
      // One pattern: `test.use` reads a two-element array as a [value, options] pair.
      allowedErrors: [
        /^(Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'|CSP violation: style-src-elem blocked inline$)/,
      ],
    });

    test("lines up exactly with NEX behind the page (no doubled rings)", async ({ page }) => {
      await page.setViewportSize({ width: 440, height: 956 });
      // Record the mirror's copies, to repeat its last one exactly with a known frame below.
      await page.addInitScript(() => {
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        const w = window as unknown as { __mirrorRect: number[] };
        CanvasRenderingContext2D.prototype.drawImage = function (
          this: CanvasRenderingContext2D,
          ...args: unknown[]
        ) {
          if (this.canvas.hasAttribute("data-nex-mirror"))
            w.__mirrorRect = args.slice(1, 5) as number[];
          return (draw as (...a: unknown[]) => void).apply(this, args);
        } as typeof draw;
      });
      await dock(page);
      // Freeze the stage (no further frames), then draw a marker at the dock's centre in its canvas
      // and copy the region again exactly as the mirror does.
      const expected = await page.evaluate(
        () =>
          new Promise<[number, number]>((resolve) => {
            requestAnimationFrame(() => {
              window.requestAnimationFrame = () => 0;
              setTimeout(() => {
                const stage = document.querySelector<HTMLCanvasElement>(
                  ".os-stage canvas:not([data-nex-mirror])",
                )!;
                const copy = document.querySelector<HTMLCanvasElement>("canvas[data-nex-mirror]")!;
                const gl = stage.getContext("webgl2")!;
                const spot = document
                  .querySelector('[data-nex-slot="dock"]')!
                  .getBoundingClientRect();
                const cx = spot.left + spot.width / 2;
                const cy = spot.top + spot.height / 2;
                const scale = stage.width / stage.clientWidth;
                gl.disable(gl.BLEND);
                gl.enable(gl.SCISSOR_TEST);
                gl.scissor(0, 0, stage.width, stage.height);
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.scissor(
                  Math.round(cx * scale) - 3,
                  stage.height - Math.round(cy * scale) - 3,
                  6,
                  6,
                );
                gl.clearColor(1, 1, 1, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.disable(gl.SCISSOR_TEST);
                const [x, y, w, h] = (window as unknown as { __mirrorRect: number[] }).__mirrorRect;
                const context = copy.getContext("2d")!;
                context.clearRect(0, 0, copy.width, copy.height);
                context.drawImage(stage, x!, y!, w!, h!, 0, 0, copy.width, copy.height);
                copy.style.transition = "none";
                copy.style.maskImage = "none";
                copy.style.opacity = "1";
                // Only the two canvases are shown (the page's own white text would look like a marker).
                document.body.style.visibility = "hidden";
                stage.style.visibility = "visible";
                copy.style.visibility = "visible";
                resolve([cx, cy]);
              }, 100);
            });
          }),
      );
      const marker = async () => {
        const shot = (await page.screenshot({ caret: "initial" })).toString("base64");
        // Decoded on a blank page (the site's CSP rightly refuses data: images).
        const blank = await page.context().newPage();
        const found = await blank.evaluate(async (b64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${b64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const g = canvas.getContext("2d")!;
          g.drawImage(image, 0, 0);
          const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
          let sx = 0;
          let sy = 0;
          let n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i]! > 200 && data[i + 1]! > 200 && data[i + 2]! > 200) {
              const p = i / 4;
              sx += p % canvas.width;
              sy += Math.floor(p / canvas.width);
              n++;
            }
          }
          return n ? [sx / n, sy / n] : null;
        }, shot);
        await blank.close();
        return found;
      };
      const ratio = await page.evaluate(() => devicePixelRatio);
      // The marker as the stage shows it (mirror hidden), then as the mirror shows it (stage hidden).
      await mirror(page).evaluate((m) => (m.style.visibility = "hidden"));
      const below = await marker();
      await mirror(page).evaluate((m) => {
        m.style.visibility = "visible";
        document.querySelector<HTMLCanvasElement>(
          ".os-stage canvas:not([data-nex-mirror])",
        )!.style.visibility = "hidden";
      });
      const above = await marker();
      expect(below).not.toBeNull();
      expect(above).not.toBeNull();
      const [bx, by] = below!.map((v) => v / ratio);
      const [ax, ay] = above!.map((v) => v / ratio);
      expect(Math.abs(bx! - expected[0])).toBeLessThan(1.5);
      expect(Math.abs(by! - expected[1])).toBeLessThan(1.5);
      // The mirror's copy lands on the same spot, within a CSS pixel.
      expect(Math.abs(ax! - bx!)).toBeLessThan(1);
      expect(Math.abs(ay! - by!)).toBeLessThan(1);
    });
  });
});
