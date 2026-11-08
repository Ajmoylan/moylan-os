import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "build/",
      ".react-router/",
      "node_modules/",
      "playwright-report/",
      "test-results/",
      "coverage/",
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
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is banned (SECURITY.md §9: XSS).",
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            "Inline style attributes break the strict CSP in prerendered HTML. Use classes or data-* attributes (SECURITY.md §8.3).",
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // 3D boundary (ADR-002): only src/experience/ may use Three.js / R3F, and only the
    // composition root may reference src/experience/. Routes and UI stay WebGL-free.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/experience/**", "src/composition/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["~/experience/*", "**/experience/*", "three", "three/*", "@react-three/*"],
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
    rules: { "react-hooks/immutability": "off" },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,ts}", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
