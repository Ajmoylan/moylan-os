import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Portfolio Content 1.0: About (Meet the human), Experience, Projects and Contact carry Alex's
 * real, CV-sourced details; the portrait is responsive, accessible and loaded only on About; no
 * private contact details are published.
 */

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
}

const wide = (page: Page) => page.viewportSize()!.width >= 1024;

test("About introduces the human: NEX's line, the portrait and the professional story", async ({
  page,
}) => {
  await open(page, "/about");
  await expect(page.getByRole("heading", { level: 1, name: "Meet the human" })).toBeVisible();
  await expect(
    page.getByText("You've met the system. Now meet the human who built it."),
  ).toBeVisible();
  const portrait = page.getByRole("img", { name: /^Alex Moylan smiling/ });
  await expect(portrait).toBeVisible();
  // Loaded, in a modern format, at its natural proportions (3:4), never stretched.
  const image = await portrait.evaluate((img: HTMLImageElement) => ({
    loaded: img.complete && img.naturalWidth > 0,
    src: img.currentSrc,
    ratio: img.getBoundingClientRect().width / img.getBoundingClientRect().height,
  }));
  expect(image.loaded).toBe(true);
  expect(image.src).toMatch(/alex-moylan-\d+-[\w-]+\.(avif|webp)$/);
  expect(image.ratio).toBeCloseTo(1086 / 1448, 2);
  const heading = page.getByRole("heading", { level: 2, name: "Alex Moylan" });
  const photo = (await portrait.boundingBox())!;
  const intro = (await heading.boundingBox())!;
  if (wide(page)) {
    // Beside the introduction on desktop.
    expect(photo.x + photo.width).toBeLessThanOrEqual(intro.x);
  } else {
    // Above it on phones and tablets.
    expect(photo.y + photo.height).toBeLessThanOrEqual(intro.y);
  }
  for (const fact of ["Oslo, Norway", "British and Irish", /UK and EU\/EEA/]) {
    await expect(page.getByText(fact).first()).toBeVisible();
  }
  await expect(page.getByText(/Completed 2026 · First-Class Honours expected/)).toBeVisible();
  await expect(page.getByText(/predicted/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Beyond the code" })).toBeVisible();
});

test("the portrait is requested only by the About page", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (/alex-moylan-\d+/.test(request.url())) requested.push(request.url());
  });
  for (const path of ["/", "/experience", "/projects", "/contact"]) await open(page, path);
  expect(requested).toEqual([]);
  await open(page, "/about");
  await expect.poll(() => requested.length).toBe(1); // one size, one format: the browser's pick
});

test("Experience lists the CV's four roles, most recent first, with documented achievements", async ({
  page,
}) => {
  await open(page, "/experience");
  const roles = page.getByRole("list", { name: "Roles, most recent first" }).getByRole("heading");
  await expect(roles).toHaveText([
    "Key Leader",
    "Market Manager, Reality Labs",
    "Business Development Manager, Indirect Channel",
    "Innovation Manager and Customer Experience Centre Lead",
  ]);
  await expect(page.getByText("1,000+", { exact: true })).toBeVisible();
  await expect(page.getByText("£500,000", { exact: true })).toBeVisible();
});

test("Projects: finished work without public code says so and links to none", async ({ page }) => {
  await open(page, "/projects");
  const mri = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Medical Image Segmentation for MRI" }),
  });
  await expect(mri.getByText("Completed · not yet public")).toBeVisible();
  await expect(mri.getByRole("link", { name: /View the code/ })).toHaveCount(0);
  await expect(page.getByText(/Insurance/i)).toHaveCount(0);
  // The two live demos link to their dashboards and code.
  for (const [title, demo] of [
    ["COPILOT // LAUNCHPAD", "https://ajmoylan.github.io/copilot-launchpad/"],
    ["Repo Posture", "https://ajmoylan.github.io/repo-posture/"],
  ] as const) {
    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: title }) });
    await expect(card.getByRole("link", { name: /Open live demo/ })).toHaveAttribute("href", demo);
  }
});

test("the CV downloads as Alex's PDF", async ({ page, request }) => {
  const response = await request.get("/cv/Alex_Moylan_CV.pdf");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toBe(
    'attachment; filename="Alex_Moylan_CV.pdf"',
  );
  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  await open(page, "/");
  // Wide screens: the navigation's button; phones: the opening's (the menu has one too).
  const link = wide(page)
    ? page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Download CV (PDF)" })
    : page
        .getByRole("region", { name: "Alex Moylan" })
        .getByRole("link", { name: "Download CV (PDF)" });
  const [download] = await Promise.all([page.waitForEvent("download"), link.first().click()]);
  expect(download.suggestedFilename()).toBe("Alex_Moylan_CV.pdf");
});

test("Contact offers call, email and CV, with selectable details and copy buttons", async ({
  page,
}) => {
  await open(page, "/contact");
  await expect(page.getByRole("link", { name: "Call me" })).toHaveAttribute(
    "href",
    "tel:+4748901849",
  );
  await expect(page.getByRole("link", { name: "Email me" })).toHaveAttribute(
    "href",
    "mailto:alex@moylanos.dev",
  );
  await expect(page.getByText("+47 489 01 849", { exact: true })).toBeVisible();
  await expect(page.getByText("alex@moylanos.dev", { exact: true })).toBeVisible();
  const copy = page.getByRole("button", { name: /Copy email/ });
  await copy.click();
  await expect(copy).toHaveText(/Copied ✓|Select and copy/);
  // Exact addresses (anchored names, exact hrefs).
  await expect(
    page.getByRole("link", { name: /^www\.linkedin\.com\/in\/alex-moylan\b/ }),
  ).toHaveAttribute("href", "https://www.linkedin.com/in/alex-moylan");
  await expect(page.getByRole("link", { name: /^github\.com\/Ajmoylan\b/ })).toHaveAttribute(
    "href",
    "https://github.com/Ajmoylan",
  );
  const text = await page.locator("body").innerText();
  expect(text.toLowerCase()).not.toContain("gmail");
  // Only the number Alex chose to publish.
  expect(text.replaceAll("+47 489 01 849", "")).not.toMatch(
    /\+\d{2}[\s\d]{7,}|\b\d{3}\s?\d{2}\s?\d{3}\b/,
  );
});
