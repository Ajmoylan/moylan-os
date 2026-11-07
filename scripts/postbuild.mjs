#!/usr/bin/env node
/**
 * Post-build hardening for the static output in build/client (docs/SECURITY.md §8, §13).
 *
 * 1. Moves the prerendered catch-all page to /404.html (served with status 404 by SWA).
 * 2. Removes the unused SPA fallback (every route is prerendered; unknown URLs must 404).
 * 3. Fails the build if any HTML contains inline style attributes or inline event handlers,
 *    which the strict CSP would block.
 * 4. Hashes every inline <script> (React Router's hydration bootstrap) and writes the hashes into
 *    the Content-Security-Policy of build/client/staticwebapp.config.json.
 * 5. Fails if the config exceeds the Azure Static Web Apps 20 KB limit or source maps are present.
 * 6. Enforces separate performance budgets (ARCHITECTURE §9.3): the JavaScript each prerendered
 *    page loads up front, and the lazily loaded 3D stage chunk (including any chunks it imports
 *    dynamically), which must never be part of the initial set.
 * 7. Generates sitemap.xml from the prerendered pages.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "build", "client");
const configTemplate = join(root, "config", "staticwebapp.config.base.json");
const SITE_URL = "https://moylanos.dev";
const CONFIG_LIMIT_BYTES = 20 * 1024;
const BUDGET_INITIAL_JS_GZ = 125 * 1024; // per page, everything loaded before/at hydration
const BUDGET_STAGE_JS_GZ = 250 * 1024; // lazy 3D chunk + its exclusive dependencies

const fail = (message) => {
  console.error(`\n✖ postbuild: ${message}\n`);
  process.exit(1);
};

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat();
}

if (!existsSync(outDir)) fail(`missing ${relative(root, outDir)}; run react-router build first.`);

// 1 + 2. 404 page and SPA fallback --------------------------------------------------------
const prerendered404 = join(outDir, "404", "index.html");
if (!existsSync(prerendered404)) fail("prerendered /404 page not found.");
await rename(prerendered404, join(outDir, "404.html"));
await rmdir(join(outDir, "404")).catch(() => {});
await rm(join(outDir, "__spa-fallback.html"), { force: true });

// 3 + 4. Inspect HTML and hash inline scripts -----------------------------------------------
const files = await walk(outDir);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const hashes = new Set();
const inlineScript = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const inlineStyleAttr = /<[a-z][^>]*\sstyle\s*=/i;
const inlineHandler = /<[a-z][^>]*\son[a-z]+\s*=/i;

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const name = relative(outDir, file);
  if (inlineStyleAttr.test(html))
    fail(`${name} contains an inline style attribute (blocked by CSP).`);
  if (inlineHandler.test(html)) fail(`${name} contains an inline event handler (blocked by CSP).`);
  for (const [, content] of html.matchAll(inlineScript)) {
    if (!content) continue;
    hashes.add(`'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`);
  }
}

// 5. Write the final SWA config ---------------------------------------------------------------
const config = JSON.parse(await readFile(configTemplate, "utf8"));
delete config.$comment;
const csp = config.globalHeaders["Content-Security-Policy"];
if (!csp.includes("__INLINE_SCRIPT_HASHES__"))
  fail("CSP template is missing __INLINE_SCRIPT_HASHES__.");
config.globalHeaders["Content-Security-Policy"] = csp.replace(
  "__INLINE_SCRIPT_HASHES__",
  [...hashes].sort().join(" "),
);
const serialized = `${JSON.stringify(config, null, 2)}\n`;
const size = Buffer.byteLength(serialized);
if (size > CONFIG_LIMIT_BYTES) {
  fail(
    `staticwebapp.config.json is ${size} bytes (limit ${CONFIG_LIMIT_BYTES}). See SECURITY.md §8.3.`,
  );
}
await writeFile(join(outDir, "staticwebapp.config.json"), serialized);

const maps = files.filter((file) => file.endsWith(".map"));
if (maps.length > 0)
  fail(`source maps found in output: ${maps.map((m) => relative(outDir, m)).join(", ")}`);

// 6. Performance budgets ------------------------------------------------------------------------
const assetsDir = join(outDir, "assets");
const gzSize = async (file) => gzipSync(await readFile(file)).length;
const jsRefs = (text) =>
  [...text.matchAll(/["'(](?:\/assets\/|\.\/)([\w.-]+\.js)["')]/g)].map((m) => m[1]);

/**
 * JS files reachable from the given entries. Static imports only by default (what a page loads up
 * front). With `includeDynamic`, also follows `import("./x.js")` targets, so lazily split parts of
 * the 3D layer (e.g. a post-processing chunk loaded on demand) count towards the 3D budget.
 */
async function closure(entries, { includeDynamic = false } = {}) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name) || !existsSync(join(assetsDir, name))) continue;
    seen.add(name);
    const code = await readFile(join(assetsDir, name), "utf8");
    for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([\w.-]+\.js)["']/g)) queue.push(m[1]);
    if (includeDynamic) {
      for (const m of code.matchAll(/import\(\s*[`"']\.\/([\w.-]+\.js)[`"']\s*\)/g))
        queue.push(m[1]);
    }
  }
  return seen;
}
const sum = async (names) => {
  let total = 0;
  for (const name of names) total += await gzSize(join(assetsDir, name));
  return total;
};

const stageChunks = (await readdir(assetsDir)).filter((name) => /^Stage-[\w-]+\.js$/.test(name));
if (stageChunks.length !== 1)
  fail(`expected exactly one lazy Stage chunk, found ${stageChunks.length}.`);

let largestInitial = { page: "", bytes: 0 };
const initialUnion = new Set();
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const entries = new Set(jsRefs(html));
  const initial = await closure(entries);
  const name = relative(outDir, file);
  if (initial.has(stageChunks[0]))
    fail(`${name} loads the 3D stage chunk up front; it must be lazy.`);
  initial.forEach((chunk) => initialUnion.add(chunk));
  const bytes = await sum(initial);
  if (bytes > largestInitial.bytes) largestInitial = { page: name, bytes };
  if (bytes > BUDGET_INITIAL_JS_GZ) {
    fail(
      `${name} loads ${(bytes / 1024).toFixed(1)} KB gz of JS (budget ${BUDGET_INITIAL_JS_GZ / 1024} KB).`,
    );
  }
}
const stageOnly = [...(await closure(stageChunks, { includeDynamic: true }))].filter(
  (chunk) => !initialUnion.has(chunk),
);
const stageBytes = await sum(stageOnly);
if (stageBytes > BUDGET_STAGE_JS_GZ) {
  fail(
    `3D stage chunk is ${(stageBytes / 1024).toFixed(1)} KB gz (budget ${BUDGET_STAGE_JS_GZ / 1024} KB).`,
  );
}

// 7. Sitemap -----------------------------------------------------------------------------------
const pages = htmlFiles
  .filter((file) => file.endsWith(`${sep}index.html`) || file === join(outDir, "index.html"))
  .map((file) => {
    const path = relative(outDir, dirname(file)).split(sep).join("/");
    return path ? `/${path}` : "/";
  })
  .sort();
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((path) => `  <url><loc>${SITE_URL}${path === "/" ? "/" : path}</loc></url>`).join("\n")}
</urlset>
`;
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "sitemap.xml"), sitemap);

console.log(
  `✔ postbuild: ${htmlFiles.length} HTML files checked, ${hashes.size} inline script hashes in CSP, ` +
    `config ${(size / 1024).toFixed(1)} KB, ${pages.length} URLs in sitemap.\n` +
    `  budgets: initial JS ≤ ${(largestInitial.bytes / 1024).toFixed(1)} KB gz (largest: ${largestInitial.page}; ` +
    `budget ${BUDGET_INITIAL_JS_GZ / 1024} KB), lazy 3D stage ${(stageBytes / 1024).toFixed(1)} KB gz ` +
    `(budget ${BUDGET_STAGE_JS_GZ / 1024} KB).`,
);
