import type { Config } from "@react-router/dev/config";

/**
 * Static prerendering, no runtime server (ADR-001).
 * Every route is rendered to HTML at build time; the browser then hydrates into an SPA.
 * Output in build/client is deployed as-is to Azure Static Web Apps.
 */
export default {
  appDirectory: "src",
  ssr: false,
  // Opt in early to React Router v8 behaviour. This app uses no loaders, actions or middleware,
  // so these flags change nothing functionally; they remove deprecation warnings and ease a
  // future v8 migration (docs/ARCHITECTURE.md §2).
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
  async prerender({ getStaticPaths }) {
    // "/404" renders the catch-all route; scripts/postbuild.mjs moves it to /404.html
    // so Azure Static Web Apps can serve it for unknown URLs with a real 404 status.
    return [...getStaticPaths(), "/404"];
  },
} satisfies Config;
