import type { Page } from "@playwright/test";
import { ROUTES, expect, test } from "./fixtures";

/**
 * Reflow at normal and enlarged browser text sizes (WCAG 1.4.4 Resize Text, 1.4.10 Reflow).
 *
 * Text enlargement uses Chromium's DevTools protocol to set the browser's default font size, the
 * same preference as Settings → Appearance → Font size. Unlike a CSS override, it also scales
 * `rem` in media queries, as real users' settings do. Both Playwright projects run Chromium.
 */

const PAGES = [...ROUTES, "/no-such-page"] as const;

async function setTextSize(page: Page, percent: 100 | 150 | 200) {
  const cdp = await page.context().newCDPSession(page);
  const standard = (16 * percent) / 100;
  await cdp.send("Page.setFontSizes", {
    fontSizes: { standard, fixed: Math.round((standard * 13) / 16) },
  });
}

/**
 * Problems on the current page: horizontal page overflow, or visible text that runs outside the
 * viewport or outside an ancestor that clips its overflow (so it would be cut off, not scrollable).
 */
function reflowProblems(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const problems: string[] = [];
    const overflow = document.documentElement.scrollWidth - vw;
    if (overflow > 0) problems.push(`page scrolls sideways by ${overflow}px`);

    const visuallyHidden = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.closest("[hidden]")) return true;
        const style = getComputedStyle(node);
        // Visually hidden (Tailwind's sr-only, e.g. the unfocused skip link): clipped away.
        if (style.clipPath === "inset(50%)") return true;
        if (style.position === "absolute" && node.getBoundingClientRect().width <= 1) return true;
      }
      return false;
    };
    const clippingAncestor = (el: Element) => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === "hidden" || overflowX === "clip") return node;
      }
      return null;
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (!text.textContent?.trim() || !parent || visuallyHidden(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const box = range.getBoundingClientRect();
      if (!box.width) continue;
      const label = `"${text.textContent.trim().slice(0, 40)}"`;
      if (box.left < -0.5 || box.right > vw + 0.5) problems.push(`${label} outside the viewport`);
      const clipper = clippingAncestor(parent);
      if (clipper) {
        const clip = clipper.getBoundingClientRect();
        if (box.left < clip.left - 0.5 || box.right > clip.right + 0.5) {
          problems.push(`${label} clipped by its container`);
        }
      }
    }
    return problems;
  });
}

test.describe("reflow at normal and enlarged text sizes", () => {
  // The 404 page is visited deliberately.
  test.use({ allowedErrors: [/status of 404/] });

  for (const percent of [100, 150, 200] as const) {
    for (const width of [320, 375, 412]) {
      test(`${percent}% text at ${width}px: no page scrolls sideways or clips text`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await setTextSize(page, percent);
        for (const path of PAGES) {
          await page.goto(path);
          expect(await reflowProblems(page), path).toEqual([]);
        }
      });
    }
  }

  test("wider layouts (tablet and desktop) also reflow at 200% text", async ({ page }) => {
    await setTextSize(page, 200);
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path);
        expect(await reflowProblems(page), `${path} at ${width}px`).toEqual([]);
      }
    }
  });
});

test.describe("normal text size keeps the original typography", () => {
  test("headings are full size and never split or hyphenated", async ({ page }) => {
    for (const width of [320, 375, 412]) {
      await page.setViewportSize({ width, height: 800 });
      for (const [path, title] of [
        ["/engineering", "Engineering"],
        ["/advisory", "Technology Advisory"],
        ["/cloud-security", "Cloud & Security"],
      ] as const) {
        await page.goto(path);
        const h1 = page.getByRole("heading", { level: 1, name: title });
        const metrics = await h1.evaluate((el) => {
          const style = getComputedStyle(el);
          const words = el.textContent!.trim().split(/\s+/);
          return {
            fontSize: parseFloat(style.fontSize),
            hyphens: style.hyphens,
            // Every word renders on a single line: no word is broken across lines.
            wordsIntact: words.every((word) => {
              const node = [...el.childNodes].find((n) => n.textContent?.includes(word))!;
              const range = document.createRange();
              const start = node.textContent!.indexOf(word);
              range.setStart(node, start);
              range.setEnd(node, start + word.length);
              return range.getClientRects().length === 1;
            }),
          };
        });
        // 3rem from 360px up; eases to no less than 2.25rem on narrower screens.
        expect(metrics.fontSize).toBeGreaterThanOrEqual(width >= 360 ? 47.9 : 36);
        expect(metrics.hyphens).toBe("manual");
        expect(metrics.wordsIntact, `${title} at ${width}px`).toBe(true);
      }
    }
  });

  test("notice and status rows keep their single-row layout", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/engineering");
    const note = page.getByRole("note");
    const [label, text] = await note.evaluate((el) =>
      [...el.children].map((child) => child.getBoundingClientRect().top),
    );
    expect(Math.abs(label! - text!)).toBeLessThan(8);
    const row = page
      .locator("li")
      .filter({ has: page.locator(".os-status") })
      .first();
    const [rowTop, badgeTop] = await row.evaluate((el) => [
      el.firstElementChild!.getBoundingClientRect().top,
      el.querySelector(".os-status")!.getBoundingClientRect().top,
    ]);
    expect(Math.abs(rowTop! - badgeTop!)).toBeLessThan(12);
    await expect(page.getByRole("button", { name: "Menu" })).toContainText("Menu");
  });
});

test("at 200% text on a 320px screen, header controls keep their names and targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await setTextSize(page, 200);
  await page.goto("/");
  for (const button of [
    page.getByRole("button", { name: "Menu" }),
    page.getByRole("button", { name: /^Motion: / }),
  ]) {
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  const wordmark = (await page.getByRole("link", { name: /^MOYLAN ?\/\/OS home$/ }).boundingBox())!;
  expect(wordmark.x + wordmark.width).toBeLessThanOrEqual(320);

  // The skip link, once focused, fits on screen too.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  const box = (await skip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
});
