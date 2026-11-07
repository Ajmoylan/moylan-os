import { ROUTES, expect, test } from "./fixtures";

test("the skip link is the first focusable element and moves focus to main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("choosing a pathway navigates client-side and focuses the new heading", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  const pathways = page.getByRole("region", { name: "Choose an environment" });
  await pathways.getByRole("link", { name: "Engineering" }).click();
  await expect(page).toHaveURL(/\/engineering$/);
  const heading = page.getByRole("heading", { level: 1, name: "Engineering" });
  await expect(heading).toBeFocused();
  await expect(page.getByText("Let me show you how the systems are built.")).toBeVisible();
  await expect(page).toHaveTitle("Engineering · FORGE · MOYLAN//OS");
});

test("every environment links back to NEX", async ({ page }) => {
  for (const path of ["/engineering", "/ai", "/advisory", "/cloud-security"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Return to NEX" })).toHaveAttribute("href", "/");
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the prerendered homepage is complete and navigable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Alex Moylan" })).toBeVisible();
    await expect(
      page.getByText("Welcome to MOYLAN//OS. What would you like to explore?"),
    ).toBeVisible();
    const pathways = page.getByRole("region", { name: "Choose an environment" });
    await expect(pathways.getByRole("link")).toHaveCount(5);
    await pathways.getByRole("link", { name: "Cloud & Security" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Cloud & Security" })).toBeVisible();
  });

  for (const path of ROUTES) {
    test(`${path} renders its content and site navigation from static HTML`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("main")).not.toBeEmpty();
      // Footer navigation is the global-access route on every viewport (the header menu needs JS
      // on mobile; on desktop the primary nav is plain links).
      const footer = page.getByRole("contentinfo");
      const siteNav = footer.getByRole("navigation", { name: "Site" });
      for (const name of ["Projects", "Experience", "About", "Contact", "Privacy"]) {
        await expect(siteNav.getByRole("link", { name, exact: true })).toHaveAttribute(
          "href",
          /^\//,
        );
      }
      await expect(
        footer
          .getByRole("navigation", { name: "Environments" })
          .getByRole("link", { name: /Engineering/ }),
      ).toHaveAttribute("href", "/engineering");
    });
  }

  test.describe("not found", () => {
    test.use({ allowedErrors: [/status of 404/] });

    test("unknown URLs show the designed 404 page", async ({ page }) => {
      const response = await page.goto("/no-such-page");
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Return to NEX" })).toHaveAttribute("href", "/");
    });
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("pathway cards do not animate", async ({ page }) => {
    await page.goto("/");
    const card = page.locator(".os-pathway").first();
    const duration = await card.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(",").every((d) => parseFloat(d) <= 0.01)).toBe(true);
  });
});

test("layout never scrolls horizontally", async ({ page }) => {
  for (const path of ["/", "/engineering", "/projects", "/privacy"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

test("the mobile menu exposes every destination", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  const button = page.getByRole("button", { name: "Menu" });
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("navigation", { name: "Mobile" });
  for (const name of ["Home", "Engineering", "Projects", "Contact", "CV"]) {
    await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("back navigation restores scroll position without using storage", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => "__reactRouterRouteModules" in window);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForFunction(() => window.scrollY >= 890);
  await page
    .getByRole("region", { name: "Choose an environment" })
    .getByRole("link", { name: "Engineering" })
    .click();
  await expect(page).toHaveURL(/\/engineering$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(890);
  expect(await page.evaluate(() => sessionStorage.length + localStorage.length)).toBe(0);
});
