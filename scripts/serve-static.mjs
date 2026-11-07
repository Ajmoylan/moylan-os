#!/usr/bin/env node
/**
 * Local production preview that emulates the Azure Static Web Apps behaviour we rely on,
 * using the generated build/client/staticwebapp.config.json:
 *   - globalHeaders + route headers (so the real CSP and security headers are exercised)
 *   - trailingSlash: "never" (301 to the slash-less URL)
 *   - folder routes: /about -> /about/index.html
 *   - responseOverrides["404"].rewrite with a 404 status
 * Used by `npm run preview` and the Playwright suite. Not a production server.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "build", "client");
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";

const configPath = join(root, "staticwebapp.config.json");
if (!existsSync(configPath)) {
  console.error("build/client/staticwebapp.config.json not found. Run `npm run build` first.");
  process.exit(1);
}
// Re-read on every request so a rebuild (new CSP hashes) never meets stale headers.
let config = JSON.parse(readFileSync(configPath, "utf8"));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
};

function routeHeaders(pathname) {
  const headers = { ...config.globalHeaders };
  for (const route of config.routes ?? []) {
    const pattern = route.route.endsWith("/*") ? route.route.slice(0, -1) : route.route;
    const matches = route.route.endsWith("/*")
      ? pathname.startsWith(pattern)
      : pathname === pattern;
    if (matches && route.headers) Object.assign(headers, route.headers);
  }
  return headers;
}

/** Resolve a URL path to a file inside root, refusing path traversal. */
function resolveFile(pathname) {
  const candidates = [pathname, join(pathname, "index.html")];
  for (const candidate of candidates) {
    const full = normalize(join(root, candidate));
    if (!full.startsWith(root + sep) && full !== root) return null;
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

function send(res, status, file, pathname) {
  res.writeHead(status, {
    ...routeHeaders(pathname),
    "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  config = JSON.parse(readFileSync(configPath, "utf8"));
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (config.trailingSlash === "never" && pathname.length > 1 && pathname.endsWith("/")) {
    res.writeHead(301, { ...routeHeaders(pathname), Location: pathname.replace(/\/+$/, "") });
    res.end();
    return;
  }

  const file = resolveFile(pathname);
  if (file) {
    send(res, 200, file, pathname);
    return;
  }

  const notFound = config.responseOverrides?.["404"]?.rewrite;
  const notFoundFile = notFound ? resolveFile(notFound) : null;
  if (notFoundFile) {
    send(res, 404, notFoundFile, pathname);
  } else {
    res.writeHead(404, routeHeaders(pathname)).end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`MOYLAN//OS production preview: http://${host}:${port}`);
});
