// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MORPH_TEST_MARKER,
  checkVoice,
  morphTestBuildStatus,
  morphTestFiles,
} from "./build-guards.mjs";

/**
 * The production build's guards (review of PR #17): unsafe voice configurations fail a production
 * build locally as well as in CI, and a morph test run that requires the TEST shape fails without it.
 */

const outDir = "/build/client";
/** A build: file paths with their text (anything not listed reads as empty). */
const build = (contents = {}) => {
  const files = [
    `${outDir}/index.html`,
    `${outDir}/assets/home-abc.js`,
    `${outDir}/nex-emblem.svg`,
    ...Object.keys(contents),
  ];
  return { files: [...new Set(files)], read: (file) => contents[file] ?? "" };
};
const production = {
  outDir,
  licensed: null,
  previewSetting: undefined,
  previewBuild: false,
  ci: false,
};

describe("checkVoice: production builds (local and CI)", () => {
  it("a clean, text-only build passes", () => {
    for (const ci of [false, true]) {
      const result = checkVoice({ ...production, ...build(), ci });
      expect(result.problems).toEqual([]);
      expect(result.mode).toBe("text-only (no licensed recording yet)");
      expect(result.preview).toBe(false);
    }
  });

  it("fails locally, not only in CI, on a placeholder recording copied from public/audio/", () => {
    const files = build({ [`${outDir}/audio/nex-intro.ryan-f0.placeholder.mp3`]: "" });
    for (const ci of [false, true]) {
      const { problems } = checkVoice({ ...production, ...files, ci });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/local voice preview would be published.*placeholder\.mp3/);
      expect(problems[0]).toMatch(/npm run build:voice-preview/);
    }
  });

  it("fails on a reference to a placeholder in the built JavaScript or HTML", () => {
    for (const file of [`${outDir}/assets/voice-x.js`, `${outDir}/index.html`]) {
      const { problems } = checkVoice({
        ...production,
        ...build({ [file]: 'src:"/audio/nex-intro.placeholder.m4a"' }),
      });
      expect(problems[0]).toMatch(/local voice preview would be published/);
    }
  });

  it("fails whenever VITE_NEX_VOICE_PREVIEW is set, whatever the file is called", () => {
    const { problems } = checkVoice({
      ...production,
      ...build(),
      previewSetting: "/audio/intro.mp3",
    });
    expect(problems[0]).toMatch(/VITE_NEX_VOICE_PREVIEW=\/audio\/intro\.mp3/);
  });

  it("fails on a placeholder or missing LICENSED_RECORDING", () => {
    expect(
      checkVoice({ ...production, ...build(), licensed: "/audio/x.placeholder.mp3" }).problems[0],
    ).toMatch(/LICENSED_RECORDING is a placeholder/);
    expect(
      checkVoice({ ...production, ...build(), licensed: "/audio/nex-intro.mp3" }).problems[0],
    ).toMatch(/missing from the build/);
  });
});

describe("checkVoice: the explicit local voice-preview build", () => {
  const preview = {
    ...production,
    ...build({
      [`${outDir}/audio/nex-intro.ryan-f0.placeholder.mp3`]: "",
      [`${outDir}/assets/voice-x.js`]: 'src:"/audio/nex-intro.ryan-f0.placeholder.mp3"',
    }),
    previewSetting: "/audio/nex-intro.ryan-f0.placeholder.mp3",
    previewBuild: true,
  };

  it("is allowed locally, and labelled as never to be deployed", () => {
    const result = checkVoice(preview);
    expect(result.problems).toEqual([]);
    expect(result.preview).toBe(true);
    expect(result.mode).toMatch(/never deploy/);
  });

  it("is refused in CI", () => {
    expect(checkVoice({ ...preview, ci: true }).problems).toEqual([
      "voice-preview builds are local only: CI never builds one.",
    ]);
  });
});

describe("morph TEST detection (shared by postbuild and the e2e tests)", () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "nex-morph-build-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const assets = () => join(dir, "build", "client", "assets");
  const writeAsset = async (name, text) => {
    await mkdir(assets(), { recursive: true });
    await writeFile(join(assets(), name), text);
  };

  it("finds the TEST shape by its marker in JavaScript only", () => {
    const files = ["/a/test-1.js", "/a/Stage-2.js", "/a/notes.txt"];
    const read = (file) =>
      file.endsWith("test-1.js") || file.endsWith(".txt") ? MORPH_TEST_MARKER : "";
    expect(morphTestFiles(files, read)).toEqual(["/a/test-1.js"]);
  });

  it("required: a build without the TEST shape fails (it must not let every morph test skip)", async () => {
    await writeAsset("Stage-abc.js", "production stage");
    expect(() => morphTestBuildStatus(assets(), true)).toThrow(
      /MORPH_TEST_REQUIRED.*no TEST shape/,
    );
    // No build at all fails the same way.
    expect(() => morphTestBuildStatus(join(dir, "missing"), true)).toThrow(/no TEST shape/);
  });

  it("required: a flagged build with the TEST shape passes", async () => {
    await writeAsset("test-abc.js", `uniform mat3 ${MORPH_TEST_MARKER}[2];`);
    expect(morphTestBuildStatus(assets(), true)).toBe(true);
  });

  it("not required (the production e2e run): absent means the morph tests skip", async () => {
    await writeAsset("Stage-abc.js", "production stage");
    expect(morphTestBuildStatus(assets(), false)).toBe(false);
    expect(morphTestBuildStatus(join(dir, "missing"), false)).toBe(false);
  });
});
