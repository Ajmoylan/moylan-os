/**
 * Adapts the guarded production build (`npm run build`) for Cloudflare Pages. Run only after it:
 * `npm run build:pages`. Nothing here weakens a guard; it translates the same output.
 *
 * 1. Headers: Pages has no staticwebapp.config.json, so its `globalHeaders` (the hash-based CSP
 *    and every other security header) become a `/*` rule in `_headers`, and the long-lived cache
 *    rule for hashed `/assets/*` becomes its own rule. HTML keeps Pages' default
 *    `public, max-age=0, must-revalidate` (same effect as the SWA config's `no-cache`); setting
 *    Cache-Control in both rules would make Pages join the two values.
 * 2. URLs without a trailing slash (the SWA config's `trailingSlash: "never"`, matching every
 *    canonical link): Pages serves `about.html` at `/about` and redirects `/about/` there, but it
 *    would redirect `/about` to `/about/` for `about/index.html`. So `x/index.html` becomes `x.html`.
 * 3. 404s: Pages serves the root `404.html` (made by postbuild) with status 404 for unknown URLs.
 * 4. The SWA config itself is removed from the published files.
 */
import { existsSync } from "node:fs";
import { readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "build", "client");
const configPath = join(outDir, "staticwebapp.config.json");
const fail = (message) => {
  console.error(`✖ cloudflare-pages: ${message}`);
  process.exit(1);
};

if (!existsSync(configPath)) fail("run `npm run build` first (staticwebapp.config.json missing).");
if (!existsSync(join(outDir, "404.html"))) fail("404.html missing.");
const config = JSON.parse(await readFile(configPath, "utf8"));

// 1. _headers -----------------------------------------------------------------------------------
const { "Cache-Control": htmlCache, ...security } = config.globalHeaders;
if (!security["Content-Security-Policy"]?.includes("default-src 'none'")) fail("CSP missing.");
if (htmlCache !== "no-cache") fail(`unexpected HTML Cache-Control "${htmlCache}".`);
const assetsRule = config.routes.find((route) => route.route === "/assets/*");
if (!assetsRule) fail("no /assets/* cache rule.");
const lines = ["/*", ...Object.entries(security).map(([name, value]) => `  ${name}: ${value}`)];
lines.push("", "/assets/*");
for (const [name, value] of Object.entries(assetsRule.headers)) lines.push(`  ${name}: ${value}`);
for (const line of lines) if (line.length > 2000) fail("a _headers line exceeds Pages' limit.");
await writeFile(join(outDir, "_headers"), `${lines.join("\n")}\n`);

// 2. x/index.html -> x.html ----------------------------------------------------------------------
let flattened = 0;
for (const entry of await readdir(outDir, { withFileTypes: true })) {
  const index = join(outDir, entry.name, "index.html");
  if (!entry.isDirectory() || !existsSync(index)) continue;
  if (existsSync(join(outDir, `${entry.name}.html`))) fail(`${entry.name}.html already exists.`);
  await rename(index, join(outDir, `${entry.name}.html`));
  await rmdir(join(outDir, entry.name)).catch(() => {}); // only if now empty
  flattened++;
}

// 4. -------------------------------------------------------------------------------------------
await rm(configPath);

console.log(
  `✔ cloudflare-pages: _headers with ${Object.keys(security).length} security headers, ` +
    `${flattened} pages served without a trailing slash, 404.html kept.`,
);
