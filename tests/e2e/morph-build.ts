import { join } from "node:path";
import { morphTestBuildStatus } from "../../scripts/build-guards.mjs";
import { test } from "./fixtures";

/**
 * Whether the build under test includes the development-only TEST morph diagnostic
 * (`npm run build:morph-test`). Production builds compile it out, so the `?morph=test` tests skip
 * there and run in CI's second, flagged build. Detected from the build itself (the marker is shared
 * with scripts/postbuild.mjs). With MORPH_TEST_REQUIRED=1 (`npm run test:e2e:morph`, CI), a build
 * without it fails the run here instead of letting every morph test skip and pass.
 */
export const MORPH_TEST_BUILD = morphTestBuildStatus(
  join(process.cwd(), "build/client/assets"),
  process.env.MORPH_TEST_REQUIRED === "1",
);

/** Skips the calling test unless the build includes the TEST diagnostic. */
export function requireMorphTestBuild() {
  test.skip(!MORPH_TEST_BUILD, "development-only TEST diagnostic: run `npm run build:morph-test`");
}
