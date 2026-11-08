import { settle, stubDevice, trackStageRequests } from "./device";
import { expect, test } from "./fixtures";

/**
 * The WebGL stage pipeline (ARCHITECTURE §9.4): the 3D chunk loads lazily after hydration, only
 * when local capability checks allow it, and never with Save-Data or without WebGL2.
 * WebGL2 availability is stubbed so results don't depend on the CI machine's GPU. Runtime motion
 * preference behaviour is covered in motion.spec.ts.
 */

test("with WebGL2, the stage loads lazily after the page and follows the route's agent", async ({
  page,
}) => {
  await stubDevice(page, { webgl2: true });
  const stageRequests = trackStageRequests(page);
  await page.goto("/");
  const stage = page.locator(".os-stage");
  await expect(stage).toHaveAttribute("data-agent", "nex");
  await expect(stage).toHaveAttribute("aria-hidden", "true");
  expect(stageRequests).toHaveLength(1);

  await page
    .getByRole("region", { name: "Choose an environment" })
    .getByRole("link", { name: "Engineering" })
    .click();
  await expect(stage).toHaveAttribute("data-agent", "forge");
  expect(stageRequests, "the stage persists across routes").toHaveLength(1);
});

test.describe("route-to-agent mapping", () => {
  test.use({ allowedErrors: [/status of 404/] });

  test("each page, and the 404 page, is hosted by its manifest agent", async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    for (const [path, agent] of [
      ["/projects", "nex"],
      ["/experience", "atlas"],
      ["/cloud-security", "cipher"],
      ["/no-such-page", "nex"],
    ] as const) {
      await page.goto(path);
      await expect(page.locator(".os-stage"), path).toHaveAttribute("data-agent", agent);
    }
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("loads the low tier in reduced-motion mode", async ({ page }) => {
    await stubDevice(page, { webgl2: true });
    await page.goto("/");
    const stage = page.locator(".os-stage");
    await expect(stage).toHaveAttribute("data-stage-tier", "1");
    await expect(stage).toHaveAttribute("data-stage-motion", "reduced");
    await expect(stage).toHaveAttribute("data-stage-pointer", "off");
  });
});

test("without WebGL2, the 3D chunk is never downloaded", async ({ page }) => {
  await stubDevice(page, { webgl2: false });
  const stageRequests = trackStageRequests(page);
  await page.goto("/");
  await settle(page);
  expect(stageRequests).toEqual([]);
  await expect(page.locator(".os-stage")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /NEX, the MOYLAN\/\/OS host/ })).toBeVisible();
});

test("with Save-Data, the 3D chunk is never downloaded even on capable hardware", async ({
  page,
}) => {
  await stubDevice(page, { webgl2: true, saveData: true });
  const stageRequests = trackStageRequests(page);
  await page.goto("/");
  await settle(page);
  expect(stageRequests).toEqual([]);
  await expect(page.locator(".os-stage")).toHaveCount(0);
});
