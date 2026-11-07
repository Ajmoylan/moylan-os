import AxeBuilder from "@axe-core/playwright";
import { ROUTES, expect, test } from "./fixtures";

test.describe("every route", () => {
  for (const path of ROUTES) {
    test(`${path} renders, hydrates and passes axe (WCAG 2.2 AA)`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/MOYLAN\/\/OS/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://moylanos.dev${path === "/" ? "/" : path}`,
      );

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
});

test.describe("not found", () => {
  test.use({ allowedErrors: [/status of 404/] });

  test("unknown URLs return a real 404 with the designed page", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });
});

test("trailing slashes redirect to the canonical URL", async ({ request }) => {
  const response = await request.get("/projects/", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()["location"]).toBe("/projects");
});

test.describe("security headers", () => {
  test("HTML responses carry the hardened header set", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+;/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });

  test("hashed assets are immutable-cached", async ({ page, request }) => {
    await page.goto("/");
    const script = await page.locator('script[type="module"]').first().innerHTML();
    const asset = /\/assets\/[^"]+\.js/.exec(script)?.[0];
    expect(asset).toBeTruthy();
    const headers = (await request.get(asset!)).headers();
    expect(headers["cache-control"]).toContain("immutable");
  });
});

test.describe("privacy by default", () => {
  test("no cookies, web storage, service workers or third-party requests across the site", async ({
    page,
    context,
    baseURL,
  }) => {
    const foreign: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(baseURL!)) foreign.push(request.url());
    });
    for (const path of ROUTES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(await context.cookies()).toEqual([]);
    const storage = await page.evaluate(async () => ({
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
      indexedDB: (await indexedDB.databases()).length,
      cacheStorage: (await caches.keys()).length,
      serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
    }));
    expect(storage).toEqual({
      localStorage: 0,
      sessionStorage: 0,
      indexedDB: 0,
      cacheStorage: 0,
      serviceWorkers: 0,
    });
    expect(foreign).toEqual([]);
  });
});

test.describe("touch targets", () => {
  /**
   * Project goal: every standalone control is at least 44×44 CSS px. Links inside running text
   * are marked `data-inline` (WCAG 2.5.8 inline exception). Stretched card links are measured by
   * their card, which is the actual click target.
   */
  for (const path of ROUTES) {
    test(`${path} controls are at least 44×44`, async ({ page }) => {
      await page.goto(path);
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("a[href], button")]
          .filter((el) => !el.closest("[data-inline]") && !el.classList.contains("sr-only"))
          .flatMap((el) => {
            const target = el.hasAttribute("data-stretched-link") ? el.closest("article")! : el;
            const { width, height } = target.getBoundingClientRect();
            if (width === 0 && height === 0) return []; // not rendered at this viewport
            return width < 44 || height < 44
              ? [`"${el.textContent?.trim()}" ${Math.round(width)}×${Math.round(height)}`]
              : [];
          }),
      );
      expect(offenders).toEqual([]);
    });
  }
});
