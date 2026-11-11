import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Banned everywhere in the application (security and CSP). */
const restrictedSyntax = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML is banned (SECURITY.md §9: XSS).",
  },
  {
    selector: "JSXAttribute[name.name='style']",
    message:
      "Inline style attributes break the strict CSP in prerendered HTML. Use classes or data-* attributes (SECURITY.md §8.3).",
  },
];

/**
 * Three.js is only tree-shaken through named imports. A namespace import or re-export of `three`
 * pulls the whole library into the lazy 3D chunk (Milestone 2.4a measured ≈ 55 KB gz of otherwise
 * unused Three.js code). Type-only namespace imports are allowed: they emit nothing.
 */
const threeNamespace = [
  {
    selector:
      "ImportDeclaration[importKind!='type'][source.value=/^three(\\/.*)?$/] > ImportNamespaceSpecifier",
    message:
      'Import named Three.js classes (`import { Mesh } from "three"`), not the namespace: it defeats tree-shaking of the 3D chunk (ARCHITECTURE §9.3).',
  },
  {
    selector: "ExportAllDeclaration[source.value=/^three(\\/.*)?$/]",
    message: "Re-exporting the whole Three.js namespace defeats tree-shaking of the 3D chunk.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "build/",
      ".react-router/",
      "node_modules/",
      "playwright-report/",
      "test-results/",
      "coverage/",
      // Local-only reference material (git-ignored; never shipped or published).
      "docs/references/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      "no-restricted-syntax": ["error", ...restrictedSyntax],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // 3D boundary (ADR-002): only src/experience/ may use Three.js, and only the
    // composition root may reference src/experience/. Routes and UI stay WebGL-free.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/experience/**", "src/composition/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["~/experience/*", "**/experience/*", "three", "three/*"],
              message:
                "UI and route modules must not import the 3D layer. Compose it in src/composition/ (ARCHITECTURE §3).",
            },
          ],
        },
      ],
    },
  },
  {
    // The 3D layer mutates Three.js objects (uniforms, geometry draw ranges, render targets) in
    // effects and the render loop by design: ADR-007 keeps per-frame state out of React. This
    // React Compiler rule (the project doesn't use the compiler) treats those objects as
    // immutable React values, so it is disabled for src/experience/ only. All other hook rules
    // stay on here, and the rule stays on for the DOM application.
    files: ["src/experience/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
      "no-restricted-syntax": ["error", ...restrictedSyntax, ...threeNamespace],
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,ts}", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
