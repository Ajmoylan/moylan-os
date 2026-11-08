# MOYLAN//OS

**Explore the systems. Meet the mind behind them.**

MOYLAN//OS is the portfolio of Alex Moylan, designed as a personal operating system. Visitors are welcomed by **NEX**, the host, and choose environments presented by four specialist guides:

| Agent      | Environment           | Focus                                                      |
| ---------- | --------------------- | ---------------------------------------------------------- |
| **NEX**    | Home                  | Guided navigation across the whole system                  |
| **FORGE**  | Engineering           | Software engineering, architecture, C#/.NET, Python, React |
| **SYN**    | AI & Machine Learning | Applied AI, medical-imaging research, evaluation           |
| **ATLAS**  | Technology Advisory   | Enterprise technology, stakeholders, business outcomes     |
| **CIPHER** | Cloud & Security      | Azure, identity, security principles                       |

The site is meant to be a working engineering demonstration: cinematic where it adds value, and fast, accessible, secure and private underneath.

> **Status: Milestone 2.1 implemented (runtime motion preferences).** The static, accessible foundation from Milestone 1 is the permanent fallback for the experience. The interactive WebGL agent system (one morphing GPU particle system shared by all five agents) is next. See [docs/ARCHITECTURE.md §15](docs/ARCHITECTURE.md#15-implementation-plan).

## Features

- **Prerendered pages:** every route is static HTML generated at build time, then hydrated. With JavaScript disabled, every page still shows its content and footer navigation (tested on every route). The mobile header menu needs JavaScript.
- **Agent-driven information architecture:** a typed route manifest maps every URL (including the 404 page and future project case studies) to its host agent.
- **Accessibility:** semantic landmarks, skip link, focus management on navigation, 44×44 touch targets, AA-contrast colour tokens. Every page is checked with axe-core on desktop and mobile.
- **Motion preferences:** a header control with System, Full, Reduced and Off. System follows the operating system's reduced-motion setting live. The choice drives CSS transitions and the 3D stage plan, and it is kept in memory only.
- **Security by design:** a hash-based Content Security Policy with no `unsafe-inline` or `unsafe-eval`, hardened headers, real 404s, no source maps, hardened outbound links, and SHA-pinned CI with CodeQL, dependency review and Dependabot.
- **Privacy by default:** no cookies, web storage, analytics, tracking or third-party requests. Fonts are self-hosted. All of this is verified by tests.
- **Ready for 3D:** a root-level adapter lazy-loads the WebGL stage only when local capability checks allow it (never with Save-Data or without WebGL2). The build enforces separate JS budgets for the initial app and the 3D chunk.

## Architecture

```
src/root.tsx (composition root)
 ├─ SiteShell: semantic DOM (header, main, footer), works without WebGL
 │    routes/ · components/ · content/ · agents/registry.ts
 └─ StageMount: local capability check → lazy import of experience/Stage (3D chunk)
      routing/manifest.ts → agentForPath(url) → which agent the stage shows
```

- **React Router 7 framework mode** with `ssr: false` and full static prerendering; output deploys to **Azure Static Web Apps** with no server.
- `config/staticwebapp.config.base.json` defines routing and security headers. `scripts/postbuild.mjs` hashes inline scripts into the CSP, checks the output and enforces bundle budgets.
- Routes and UI components can't import Three.js or the 3D layer (an ESLint rule enforces this).

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Technology

React 19 · React Router 7 · TypeScript 6 (strict) · Vite 8 · Tailwind CSS 4 · Zustand · Geist (self-hosted) · Vitest + Testing Library · Playwright + axe-core · ESLint (jsx-a11y strict) · Prettier · GitHub Actions · Azure Static Web Apps (planned)

Planned for the WebGL milestones: Three.js, React Three Fiber, GLSL, GSAP.

## Getting started

Requires **Node.js 22** (see `.nvmrc`).

```bash
npm ci
npm run dev          # development server (http://localhost:5173)
npm run build        # prerendered production build in build/client
npm run preview      # serve the production build with its real security headers (port 4173)
```

## Testing and quality checks

```bash
npm run check        # format, lint, typecheck, unit tests, build, end-to-end + accessibility
npm test             # unit and component tests (Vitest)
npm run test:e2e     # Playwright, desktop + mobile (build first; run `npx playwright install chromium` once)
npm run audit:prod   # production dependency audit (high/critical)
npm run audit:all    # full dependency-tree audit (high/critical)
```

End-to-end tests run against the production build, served with the same headers Azure will send. They cover every route's rendering, axe accessibility checks, CSP violations, security headers, touch targets, keyboard and focus behaviour, no-JavaScript mode, runtime motion preferences (including live operating-system changes), the absence of cookies, storage and third-party requests, and the lazy 3D loading rules.

## Documentation

| Document                                                 | Purpose                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| [docs/DESIGN-BRIEF.md](docs/DESIGN-BRIEF.md)             | Art direction, interaction and accessibility requirements                  |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | Technical decisions (ADRs), boundaries, budgets, milestones                |
| [docs/AGENT-PROFILES.md](docs/AGENT-PROFILES.md)         | NEX, FORGE, SYN, ATLAS and CIPHER                                          |
| [docs/SECURITY.md](docs/SECURITY.md)                     | Security architecture, threat model, vulnerability reporting, release gate |
| [docs/PRIVACY-COMPLIANCE.md](docs/PRIVACY-COMPLIANCE.md) | GDPR and Norwegian privacy design (ekomloven § 3-15)                       |

The original master plan and visual references live in `docs/references/`. They're kept locally for development and intentionally excluded from the repository.

## Engineering workflow

- **Feature branches and protected `main`:** changes land through pull requests that must pass CI (formatting, lint, type checks, unit tests, build-output and budget checks, end-to-end and accessibility tests), CodeQL and dependency review.
- **Recorded decisions:** architectural choices are documented as ADRs in [docs/ARCHITECTURE.md §14](docs/ARCHITECTURE.md#14-architecture-decision-records), and each milestone is independently reviewed before the next one begins.
- **Testing on every change:** unit and component tests, plus end-to-end, accessibility and security-header tests against the production build with its real headers, run on every pull request.
- **Maintenance:** exact dependency versions, SHA-pinned GitHub Actions, and weekly Dependabot updates with a cooldown period. Major upgrades that need migration work are deferred deliberately and documented ([docs/ARCHITECTURE.md §2](docs/ARCHITECTURE.md#deferred-major-upgrades)).

## Security

Please report vulnerabilities privately. See [docs/SECURITY.md](docs/SECURITY.md#1-reporting-a-vulnerability). Never commit secrets: everything under `src/`, and any `VITE_` variable, is shipped to the browser.

## Licence

No licence has been chosen yet, so all rights are reserved by default. Open licensing and provenance decisions:

- **Project licence:** to be chosen before the repository is made public (code and content may need different terms).
- **Reference artwork** (`docs/references/`): includes AI-generated concept illustrations whose generation terms and provenance haven't been reviewed. It's not published; final assets will be produced under verified commercial terms (DESIGN-BRIEF §11).
- **Higgsfield assets** (future): verify commercial licence terms before generating or publishing any.
- **Third-party components** keep their own licences: the Geist fonts under the SIL Open Font License 1.1, and npm dependencies under permissive licences checked by the dependency-review workflow.
- **Original site artwork** (favicon, static NEX emblem, icons) is code-generated SVG created for this project.
