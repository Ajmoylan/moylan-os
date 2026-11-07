import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { notFoundRoute, pageRoutes } from "./routing/manifest";

/** React Router route config, generated from the route manifest (src/routing/manifest.ts). */
export default [
  ...pageRoutes.map((page) =>
    page.path === "/" ? index(page.file) : route(page.path.slice(1), page.file),
  ),
  route(notFoundRoute.path, notFoundRoute.file),
] satisfies RouteConfig;
