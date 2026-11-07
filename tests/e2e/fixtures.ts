import { test as base, expect } from "@playwright/test";

export const ROUTES = [
  "/",
  "/engineering",
  "/ai",
  "/advisory",
  "/cloud-security",
  "/projects",
  "/experience",
  "/about",
  "/contact",
  "/privacy",
] as const;

/**
 * Collects console errors, CSP violations and page errors for every test, and fails the test if
 * any occur. This makes "no CSP violations, no hydration errors" a property of the whole suite.
 */
export const test = base.extend<{ allowedErrors: RegExp[]; problems: string[] }>({
  /** Console errors a specific test expects (e.g. the 404 status of a deliberate 404 page). */
  allowedErrors: [[], { option: true }],
  problems: [
    async ({ page, allowedErrors }, use) => {
      const problems: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI}`);
        });
      });
      page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "error" && !allowedErrors.some((re) => re.test(text))) {
          problems.push(text);
        }
      });
      page.on("pageerror", (error) => problems.push(error.message));
      await use(problems);
      expect(problems, "console errors / CSP violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
