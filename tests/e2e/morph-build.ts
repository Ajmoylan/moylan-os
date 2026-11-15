import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "./fixtures";

/**
 * Whether the build under test includes the development-only TEST morph diagnostic
 * (`npm run build:morph-test`). Production builds compile it out, so the `?morph=test` tests skip
 * there and run in CI's second, flagged build. Detected from the build itself: `uTFrames`, a
 * uniform only TEST's shaders declare (scripts/postbuild.mjs uses the same marker).
 */
export const MORPH_TEST_BUILD = (() => {
  const assets = join(process.cwd(), "build/client/assets");
  try {
    return readdirSync(assets).some(
      (file) =>
        file.endsWith(".js") && readFileSync(join(assets, file), "utf8").includes("uTFrames"),
    );
  } catch {
    return false;
  }
})();

/** Skips the calling test unless the build includes the TEST diagnostic. */
export function requireMorphTestBuild() {
  test.skip(!MORPH_TEST_BUILD, "development-only TEST diagnostic: run `npm run build:morph-test`");
}
