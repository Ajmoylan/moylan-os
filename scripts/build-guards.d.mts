/** Types for scripts/build-guards.mjs (imported by the TypeScript e2e tests). */
export declare const PLACEHOLDER: string;
export declare const MORPH_TEST_MARKER: string;
export declare function checkVoice(build: {
  outDir: string;
  files: string[];
  read: (file: string) => string;
  licensed: string | null;
  previewSetting: string | null | undefined;
  previewBuild: boolean;
  ci: boolean;
}): { problems: string[]; mode: string; preview: boolean };
export declare function morphTestFiles(files: string[], read: (file: string) => string): string[];
export declare function morphTestBuildStatus(assetsDir: string, required: boolean): boolean;
