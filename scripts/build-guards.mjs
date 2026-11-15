/**
 * The production build's licensing and diagnostics guards, as small functions shared by
 * scripts/postbuild.mjs and the e2e tests, and tested in scripts/build-guards.test.mjs.
 *
 * - NEX's voice: only a licensed recording may ever be published. A local voice preview (an
 *   unlicensed audition or stand-in, `public/audio/*.placeholder.*`, wired in by
 *   `VITE_NEX_VOICE_PREVIEW`) is allowed only in an explicitly local preview build
 *   (`npm run build:voice-preview`, which sets NEX_VOICE_PREVIEW_BUILD=1) and never in CI.
 * - The first-morph TEST diagnostic: only a build made with VITE_MORPH_TEST=1 may contain it, and a
 *   test run that requires it (MORPH_TEST_REQUIRED=1) fails, rather than skips, without it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every local voice preview or stand-in recording has this in its name (Git-ignored). */
export const PLACEHOLDER = ".placeholder.";
/** A uniform only the TEST shape's shaders declare: in a build exactly when TEST is compiled in. */
export const MORPH_TEST_MARKER = "uTFrames";

/**
 * NEX's voice in a build: the problems that must fail it, and the configuration it has.
 *
 * @param {object} build
 * @param {string} build.outDir The client build directory.
 * @param {string[]} build.files Every file in it (absolute paths).
 * @param {(file: string) => string} build.read Reads a text file.
 * @param {string | null} build.licensed `LICENSED_RECORDING` from src/content/voice.ts.
 * @param {string | null | undefined} build.previewSetting `VITE_NEX_VOICE_PREVIEW` as Vite saw it.
 * @param {boolean} build.previewBuild The build is an explicit local preview build.
 * @param {boolean} build.ci Running in CI.
 */
export function checkVoice({ outDir, files, read, licensed, previewSetting, previewBuild, ci }) {
  const problems = [];
  const placeholderFiles = files.filter((file) => file.includes(PLACEHOLDER));
  const placeholderRefs = files.filter(
    (file) => /\.(?:js|html)$/.test(file) && read(file).includes(PLACEHOLDER),
  );
  if (licensed?.includes(PLACEHOLDER)) {
    problems.push(`LICENSED_RECORDING is a placeholder (${licensed}).`);
  }
  if (licensed && !existsSync(join(outDir, ...licensed.split("/").filter(Boolean)))) {
    problems.push(`NEX's licensed recording ${licensed} is missing from the build.`);
  }
  const traces = [
    ...(previewSetting ? [`VITE_NEX_VOICE_PREVIEW=${previewSetting}`] : []),
    ...placeholderFiles,
    ...placeholderRefs,
  ];
  if (traces.length > 0 && !previewBuild) {
    problems.push(
      `a local voice preview would be published (${traces.join(", ")}). Production builds never ` +
        "contain one: use `npm run build:voice-preview` for a local preview build, or remove the " +
        "preview setting and the placeholder files from public/audio/.",
    );
  }
  if (previewBuild && ci) {
    problems.push("voice-preview builds are local only: CI never builds one.");
  }
  const preview = previewBuild && traces.length > 0;
  const mode = preview
    ? "local preview recording (never deploy this build)"
    : licensed
      ? `licensed recording ${licensed}`
      : "text-only (no licensed recording yet)";
  return { problems, mode, preview };
}

/** The files of a build that contain the TEST diagnostic. */
export function morphTestFiles(files, read) {
  return files.filter((file) => file.endsWith(".js") && read(file).includes(MORPH_TEST_MARKER));
}

/**
 * Whether the client build's assets include the TEST diagnostic, for the e2e tests. With `required`
 * (MORPH_TEST_REQUIRED=1, set by `npm run test:e2e:morph` and CI), a build without it throws, so the
 * morph tests fail instead of all skipping and passing.
 */
export function morphTestBuildStatus(assetsDir, required) {
  let present = false;
  try {
    present =
      morphTestFiles(
        readdirSync(assetsDir).map((name) => join(assetsDir, name)),
        (file) => readFileSync(file, "utf8"),
      ).length > 0;
  } catch {
    present = false;
  }
  if (required && !present) {
    throw new Error(
      `MORPH_TEST_REQUIRED is set, but the build in ${assetsDir} has no TEST shape. ` +
        "Build it with `npm run build:morph-test` first.",
    );
  }
  return present;
}
