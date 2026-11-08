# MOYLAN//OS — Architecture

**Status:** v0.7 · 8 November 2026 · Milestone 1 and Milestone 2.1 complete and reviewed; Milestone 2.2 (first live WebGL environment) implemented, visual direction approved, independent-review findings remediated (§18); ADR-004 and ADR-007 accepted
**Sources:** master plan v1.0 (PDF + Apple Notes text) and blueprint illustration in `docs/references/` (kept locally; not published in the repository).
**Companion documents:** [`DESIGN-BRIEF.md`](DESIGN-BRIEF.md) · [`AGENT-PROFILES.md`](AGENT-PROFILES.md) · [`SECURITY.md`](SECURITY.md) · [`PRIVACY-COMPLIANCE.md`](PRIVACY-COMPLIANCE.md)

> Items marked **(proposed)** are recommendations still awaiting approval; **(approved)** items were confirmed in the 7 November 2026 review. Exact versions are pinned in `package-lock.json` (`save-exact`).

---

## 1. Architectural principles

1. **Layering rule (from the master plan):** semantic content and primary navigation must work even if WebGL, video, microphone access or AI APIs are unavailable. 3D and agent personality are enhancements, not dependencies.
2. **Content-first DOM, independent canvas.** The informative HTML layer is rendered and usable before (and without) the 3D layer.
3. **One persistent scene.** A single WebGL canvas lives for the whole session and is never torn down between routes. This makes cinematic agent morphs possible without reloads.
4. **Animation outside React's render loop.** Per-frame values (pointer, morph progress, uniforms) are mutated directly on GPU uniforms/refs, never pushed through React state.
5. **Data-driven agents and content.** Agents, projects and experience are typed data. No hard-coded one-off layouts.
6. **Adaptive quality.** Every visual feature declares its cost and has a lower-tier and static equivalent.
7. **Static by default, backend only when needed.** No server until a feature genuinely needs one; keys always server-side.
8. **Secure and private by design (approved).** Security and privacy controls ship with each milestone, not before launch: see [`SECURITY.md`](SECURITY.md) and [`PRIVACY-COMPLIANCE.md`](PRIVACY-COMPLIANCE.md).
9. **Room to grow (approved).** New projects, including the separate C#/.NET application, are added as content entries and case-study pages without restructuring the site (§12).

---

## 2. Technology stack

Versions as installed for Milestone 1 (Node.js 22 LTS locally and in CI).

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript 6** (strict, `noUncheckedIndexedAccess`) | TS 7 is not yet supported by React Router 7's tooling. |
| UI framework | **React 19.3** | `@react-router/node` and `isbot` are runtime dependencies even though no app code imports them: React Router's default server entry uses them to prerender pages at build time. |
| Build tool | **Vite 8** | Per the master plan and project instruction. Known harmless warning: "The `envFile` option is deprecated" is emitted because `@react-router/dev` 7.18.5 passes `envFile: false` to Vite internally; it can't be fixed without patching that package or downgrading Vite a major version. |
| Routing / prerender | **React Router 7.18 (v7 line), framework mode, `ssr: false` + `prerender`** **(approved)** | Every route is static HTML at build time, then hydrates into an SPA. No runtime server; output in `build/client` deploys as-is to Azure Static Web Apps. React Router v8 exists; v7 is still maintained, and v8 needs Node ≥ 22.22. Migration is a separate, later decision. All five `v8_*` future flags are enabled now (no functional effect here: no loaders/actions/middleware), which removes the deprecation warnings and eases that migration. See ADR-001. |
| 3D | **Three.js 0.186 + React Three Fiber 9.8** **(approved; in use since Milestone 2.2)** | WebGL2 renderer, lazy-loaded in the stage chunk only. R3F 9 supports React 19 (< 19.4) and shares the app's Zustand 5. Both pinned to releases older than the Dependabot cooldown (three 0.187 was 9 days old). Known upstream console warning: R3F 9.8 still uses `THREE.Clock`, which three 0.186 marks deprecated. |
| 3D helpers | **@react-three/drei** (selectively) | `PerformanceMonitor`, `AdaptiveDpr` and similar. Import per-module to keep bundles lean. |
| Shaders | **GLSL** via `vite-plugin-glsl` **(proposed)** | `#include` chunks for shared noise/curl functions. |
| Post-processing | **pmndrs `postprocessing`** (high tier only) | Bloom (mipmap blur), subtle vignette/noise. Lower tiers fake glow in the particle shader. |
| Animation | **GSAP 3** (+ ScrollTrigger; SplitText for text reveals) | GSAP and all its plugins are now free to use. |
| Smooth scroll | **Lenis: not in v1** | Only if it clearly improves the result without breaking native behaviour (plan rule). Re-evaluate in Phase 3. |
| State | **Zustand 5** **(accepted with constraints, ADR-007)** | Low-frequency semantic state only (selected agent, transition requests, quality tier, pause, motion preference). Continuous data lives in refs and GPU uniforms; never `set` per frame. In use since Milestone 2.1 for the motion preference store (`src/motion/store.ts`); ≈ 1 KB gz in the initial bundle. |
| Styling | **Tailwind CSS 4.3** | CSS-first `@theme` tokens in `src/styles/app.css`; agent accents via `[data-agent]` scopes (no inline styles, for CSP). |
| Fonts | **Geist / Geist Mono** via `@fontsource-variable` **(approved)** | Self-hosted, bundled by Vite; Latin subset preloaded. |
| GPU capability | **Local detection** (`src/experience/capabilities.ts`) + runtime frame-time adaptation | Replaces the earlier *detect-gpu* proposal, which fetches benchmark data from a CDN by default (a third-party request, and blocked by `connect-src 'self'`). ADR-013. |
| Testing | **Vitest 5** + Testing Library (jsdom); **Playwright** + `@axe-core/playwright`; Lighthouse CI (Phase 6) | See §11. |
| Quality gates | ESLint 9 (typescript-eslint, jsx-a11y *strict*, react-hooks), Prettier, `tsc` | ESLint 10 awaits jsx-a11y support. Custom rules ban `dangerouslySetInnerHTML` and inline `style`. |
| Source control | GitHub; feature branches; PRs; required checks | See SECURITY.md §10. |
| Hosting | **Azure Static Web Apps** (Free plan) via **GitHub Actions** | Deployment workflow is added only with your approval (Phase 6). |
| Optional backend | SWA managed **Azure Functions** (`/api/*`) or a separate ASP.NET Core API | Only for Version 2 chat or a contact form. |

### Considered and not chosen (for now)

- **Next.js** (named in the blueprint's tech-stack panel). The master plan and project instruction specify Vite, and React Router prerendering provides the SEO/first-paint benefit without a Node server. Recorded as a deliberate deviation from the illustration.
- **WebGPU + TSL.** Three's WebGPU renderer (with WebGL2 fallback) and compute shaders are attractive for particles. However, the plan specifies GLSL, our particle budgets fit comfortably in WebGL2, and the WebGL post-processing/R3F ecosystem is more mature. Revisit after Phase 3. Keeping shader logic modular keeps a later port feasible.
- **XState.** The transition state machine is small enough to implement as a typed reducer in the store.

### Deferred major upgrades

Dependabot ignores **major-version updates only** for the packages below (`.github/dependabot.yml`). Their minor and patch releases still arrive automatically. Dependabot alerts and the CI `npm audit` gates still report any vulnerability, including one fixed only in a new major, so a security issue can't be silently skipped. **A vulnerability that can only be fixed by one of these major upgrades must be reviewed and prioritised despite the exclusion.** Deferring the upgrade is never a reason to leave a known vulnerability unaddressed. Each upgrade is a deliberate decision, made in its own PR with the full check suite.

| Package | Held at | Why deferred | Revisit when |
|---|---|---|---|
| `eslint`, `@eslint/js` | 9.x | `eslint-plugin-jsx-a11y` (our strict accessibility linting) supports ESLint only up to 9 | jsx-a11y releases ESLint 10 support |
| `react-router`, `@react-router/dev`, `@react-router/node` | 7.x | The three packages must move together; v8 is a coordinated framework migration that needs Node ≥ 22.22 | A coordinated React Router v8 migration is deliberately scheduled (all v8 future flags are already enabled) |
| `@types/node` | 22.x | Type definitions should match the Node.js 22 runtime used locally and in CI (`.nvmrc`) | The project moves to a newer Node LTS (e.g. 24) |

---

## 3. System overview

```
┌──────────────────────────────── Browser ────────────────────────────────┐
│                                                                          │
│  src/root.tsx: COMPOSITION ROOT                                          │
│   ├─ <SiteShell>  DOM LAYER: semantic, prerendered, always functional   │
│   │    SkipLink · <header> wordmark + nav · <main> route content ·       │
│   │    <footer> · RouteAnnouncer · ScrollManager                         │
│   │    (routes/ and components/ never import the 3D layer: lint rule)    │
│   │                                                                      │
│   └─ <StageMount>  src/composition/StageMount.tsx: the only bridge       │
│        1. waits for idle after hydration                                  │
│        2. planStage(readCapabilitySignals()): local, no network          │
│        3. tier 0 → render nothing (static design remains)                │
│        4. else lazy import("~/experience/Stage") inside an error         │
│           boundary; agent = agentForPath(location) (route manifest)      │
│                                                                          │
│  STAGE LAYER (.os-stage: fixed, z −1, aria-hidden, pointer-events none)  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ src/experience/Stage.tsx (lazy chunk; placeholder in Milestone 1)  │  │
│  │ Milestone 2+: <Canvas> persistent across routes                    │  │
│  │   FlowField (pointer → velocity render target)                     │  │
│  │   AmbientField (background particles + network lines)              │  │
│  │   AgentCore (one morphing GPU particle system for all 5 agents)    │  │
│  │   AgentOverlays · CameraRig · PostFX (tier 3)                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  BACKDROP (.os-backdrop, z −2): CSS gradients + grid; with the static    │
│  NEX emblem, this is the complete tier-0 experience                      │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Data flow:** today the stage receives the current agent (from the route manifest) and its plan as props; the plan combines local capability signals with the effective motion mode from the motion store (§10, Milestone 2.1). ADR-007 applies: a small store holds **low-frequency semantic state** (selected agent, transition requests, tier, pause, motion preference); **continuous data** (pointer position and velocity, frame timing, interpolation) lives in mutable refs and preallocated structures inside the stage; **continuous visual state** lives in GPU uniforms and textures.
- **Pointer input** is captured on `window` (not the canvas), so the scene reacts while the DOM stays fully interactive above it.
- **The shared GPU particle-system architecture is unchanged** (§6): NEX, FORGE, SYN, ATLAS and CIPHER are equal-N shapes morphed by one `AgentCore` inside the stage chunk.

---

## 4. Routing and information architecture

| Route | Owner agent | Content |
|---|---|---|
| `/` | NEX | Positioning, intro, five pathways, featured work |
| `/engineering` | FORGE | Project gallery, walkthroughs, architecture, GitHub |
| `/ai` | SYN | MRI segmentation, AI Communications Assistant, methods, evaluation |
| `/advisory` | ATLAS | Enterprise experience, stakeholder engagement, solution design, impact |
| `/cloud-security` | CIPHER | AZ-900, Azure/cloud architecture, security concepts, future learning |
| `/projects` | NEX | All projects, filterable by agent/domain/status |
| `/projects/:slug` | Project's owner agent | Case study |
| `/about` | NEX | Biography, verifiable credentials |
| `/experience` | ATLAS | Timeline |
| `/contact` | NEX | Contact form or mailto, LinkedIn, GitHub |
| `/privacy` | NEX | Privacy notice (PRIVACY-COMPLIANCE §10) |
| any unknown URL | NEX | Designed 404 page, served with HTTP 404 |
| CV | n/a | `/cv/Alex-Moylan-CV.pdf` static download, linked globally |

Each route module exports `meta` (title, description, canonical URL, Open Graph via `src/content/meta.ts`).

**Route-to-agent mapping: one authoritative mechanism (ADR-012).** `src/routing/manifest.ts` lists every page as `{ path, file, agent }`, plus the catch-all `notFoundRoute` and the `/projects/` prefix for future case studies.

- `src/routes.ts` **generates** React Router's config from the manifest, so a page can't exist without an agent.
- `agentForPath(pathname)` resolves *any* URL: manifest pages → their agent; `/projects/<slug>` → the owning agent from `src/content/projects.ts` (so adding the C#/.NET project needs no routing change); everything else → NEX (the 404 host). Trailing slashes are ignored.
- The registry's `route` (each agent's home environment) is typed as a manifest path and unit-tested to be hosted by that agent.
- Route `handle` exports are **not** used for agent mapping (a URL that matches no route, i.e. the 404 page, still needs an agent).

---

## 5. Source layout

As implemented in Milestone 1 (`appDirectory: "src"`); `experience/`, `transitions/` and `state/` arrive with the WebGL milestones.

```
moylan-os/
├─ config/
│  └─ staticwebapp.config.base.json  # SWA routing + security headers template (source of truth)
├─ docs/                             # briefs, security, privacy, references (not deployed)
├─ public/                           # favicon.svg, robots.txt (later: assets/, cv/, .well-known/)
├─ scripts/
│  ├─ postbuild.mjs                  # 404 page, CSP hashes, output checks, sitemap
│  └─ serve-static.mjs               # local production preview emulating SWA headers/routing
├─ src/
│  ├─ root.tsx                       # html shell, fonts, error boundary
│  ├─ routes.ts                      # React Router config, generated from routing/manifest.ts
│  ├─ routes/                        # one module per page (+ home.test.tsx)
│  ├─ agents/registry.ts             # AgentId → name, epithet, home route, colours, copy (+ tests)
│  ├─ routing/                       # manifest.ts (pages ↔ agents), agent-for-path.ts (+ tests)
│  ├─ composition/StageMount.tsx     # root-level adapter: capability gate + lazy Stage import
│  ├─ content/                       # site.ts (links), projects.ts, meta.ts
│  ├─ components/
│  │  ├─ layout/                     # SiteShell, SiteHeader, SiteFooter, SkipLink,
│  │  │                              # RouteAnnouncer, ScrollManager, Wordmark
│  │  ├─ ui/                         # PathwayCard, AgentTag, AgentIcon, StatusBadge,
│  │  │                              # NexEmblem (static fallback), PageIntro, ExternalLink
│  │  └─ AgentEnvironment.tsx        # specialist environment template
│  ├─ lib/contrast.ts                # WCAG contrast maths (used by token tests)
│  ├─ styles/app.css                 # Tailwind entry, @theme tokens, os-* components
│  ├─ experience/                    # 3D layer: capabilities.ts (eager, no Three.js),
│  │                                 # Stage.tsx (lazy chunk; placeholder until Milestone 2)
│  ├─ transitions/                   # (Phase 3) transition controller + GSAP timelines
│  └─ state/                         # (Milestone 2+) experience + preference stores
├─ tests/e2e/                        # Playwright: routes, axe, headers, privacy, navigation
└─ .github/                          # ci, codeql, dependency-review workflows; dependabot
```

**Boundary rule (lint-enforced):** outside `src/experience/` and `src/composition/`, ESLint forbids importing `~/experience/*`, `three` or `@react-three/*`. Only `StageMount` references the 3D layer, and only `Stage.tsx` (lazy) will import Three.js. The build fails if any page loads the stage chunk up front (§9.3). This keeps the 3D layer lazily loadable, testable and removable without breaking the site.

## 6. The interactive 3D agent system

### 6.1 One morphing particle system, five forms

All five agents are rendered by a **single `AgentCore` particle system** with a fixed particle count `N` (per quality tier). Each agent is defined by a **shape generator**: a pure function that returns `N` target positions plus per-particle attributes.

```ts
// experience/shapes/types.ts
export interface AgentShape {
  positions: Float32Array;   // N × 3 target positions
  attributes: Float32Array;  // N × 4: [role, phase, size, intensity]
                             // role: 0 core · 1 filament · 2 node · 3 spark …
}
export type ShapeGenerator = (n: number, seed: number) => AgentShape;
```

| Agent | Shape recipe (summary; full detail in AGENT-PROFILES) |
|---|---|
| NEX | Points along ~12–24 tilted orbital rings and great-circle filaments around a dense core; sparse halo particles. |
| FORGE | Points on the edges and faces of nested/fragmented polyhedra (icosa/dodeca shards), plus spark particles. |
| SYN | Fibonacci-sphere nodes; points distributed along arcs between k-nearest neighbours (synapses). |
| ATLAS | Lat/long globe lattice, 2–3 inclined rings, great-circle data-path arcs. |
| CIPHER | Shield silhouette (extruded outline) filled with a hexagonal lattice, plus layered offset outlines. |

Because every shape has the same `N`, a **morph** is a GPU interpolation between two attribute buffers (`aPositionFrom`, `aPositionTo`) driven by one uniform, `uMorph ∈ [0,1]`:

- **Per-particle stagger:** each particle's local progress is `smoothstep(delay_i, delay_i + w, uMorph)`, where `delay_i` derives from position/role. Forms dissolve and reassemble in waves, not as a uniform lerp.
- **Mid-flight turbulence:** curl-noise displacement weighted by `sin(π · progress_i)`. Particles swirl apart in the middle of the morph and lock into the new form at the end ("particle reassembly").
- **Colour and size** interpolate per agent; the agent's palette arrives through uniforms.
- **Overlays** (line segments, wireframes, shells, hex meshes) are separate light-weight meshes per agent, cross-faded by the same timeline.

Shape generators are **pure and seeded**: deterministic, unit-testable, and run once per tier (in a Web Worker if they exceed ~4ms).

### 6.2 Why this approach

- **Genuinely interactive:** every particle is GPU-driven and responds to the cursor, idle animation and morph state every frame. These aren't pre-rendered videos or sprites.
- **Signature transitions:** "NEX morphs into the specialist" is literally true. The same particles physically rearrange.
- **Performant:** one draw call for the core (+ a few for overlays); no per-frame CPU work proportional to `N`.
- **Maintainable:** adding or tuning an agent means writing one pure generator + config + optional overlay.

### 6.3 Particle rendering

- `THREE.Points` with a custom `ShaderMaterial`: soft round sprites, additive blending, depth-write off, size attenuation, an intensity-to-HDR mapping so cores can feed bloom on the high tier.
- **Fake glow on lower tiers:** radial falloff in the fragment shader plus a large, faint duplicate "halo" point layer gives most of the bloom look at a fraction of the cost.
- Lines (filaments, synapses, network edges) use `LineSegments` with the **same displacement function** in their vertex shader as the points they connect. Lines stay attached to moving particles with no CPU updates.

---

## 7. Fluid, mouse-responsive background

### 7.1 Flow field (shared interaction substrate): ADR-004, implemented in Milestone 2.2

**One shared, low-resolution pointer flow map**: a ping-pong render target (64² / 128² / 256² by tier) storing a 2D velocity field. Both the ambient field and AgentCore sample it in their vertex shaders (via screen-space projected positions) to displace particles. One cheap simulation drives every reaction, so cursor behaviour is consistent across the scene.

Each frame, three simple passes:

1. **Inject:** splat the pointer's velocity at its position (Gaussian falloff). Pointer samples are accumulated in mutable fields by `PointerTracker` (a `window` `pointermove` listener), never React state.
2. **Advect:** sample the previous frame offset by its own velocity (semi-Lagrangian). This gives fluid-like swirling trails.
3. **Dissipate, frame-rate independent:** `v *= pow(d, Δt / (1/60))` with `d ≈ 0.95–0.97` defined per 60 Hz frame, and `Δt` clamped (e.g. ≤ 1/20 s) after tab switches or hitches. The field settles in the same wall-clock time at 30, 60 or 120 Hz.

**Constraints (ADR-004):**

- **No pressure projection in Milestone 2:** no divergence pass and no Jacobi solver. A stable-fluids upgrade would need its own ADR, with performance evidence, after M2.
- **Render-target format fallback:** half-float → RGBA8 (biased encoding) → analytic pointer falloff with no render target (§9.4).
- **Reduced motion:** when the effective motion mode is `reduced` or `off`, the flow map is **not allocated**, pointer listeners for displacement are **not attached**, and no pointer-driven displacement occurs. Switching to reduced motion at runtime disposes the render targets and detaches the listeners; switching back re-creates them.

**Implementation (Milestone 2.2):** `src/experience/flow/FlowField.ts` is independent of React: one oversized-triangle pass does advect → dissipate → inject, ping-ponging two targets. `policy.ts` holds the pure fallback order and `dissipationFor(d, Δt) = pow(d, clamp(Δt, 0, 0.1)·60)`. Each format is validated once per renderer by `flow/probe.ts` (§9.4: render, sample, filter and read back), then the two full-size targets are checked for framebuffer completeness (half-float needs `EXT_color_buffer_half_float` or `EXT_color_buffer_float`). RGBA8 encodes velocity around 0.5 within ±8 NDC/s, with a dead zone so quantisation can't leave a permanent drift. Particles sample the field at their screen position and are displaced by it, so they ripple away from the cursor and settle back as it dissipates. The stage publishes the chosen format as `data-stage-flow`.

### 7.2 Ambient field

**Implemented in Milestone 2.2 (particles only; the node network and agent re-parameterisation come later):** `src/experience/ambient/`. One `Points` draw call; positions are computed in the vertex shader from static attributes (deterministic seeded positions, depth and per-particle seeds) and a time uniform, so nothing is uploaded per frame. A slow left-to-right current with depth parallax and layered travelling-wave meanders gives coherent flowing bands; soft additive glow sprites in the NEX palette; brightness dimmed behind the main text column (from the left on wide screens, evenly on narrow ones) and at the top and bottom edges. Every visual parameter is in `ambient/config.ts`.

**Original design notes:**

- ~2k–12k drifting background particles (tier-dependent) plus a sparse "network" of a few hundred nodes connected by precomputed nearest-neighbour edges, drawn as faint lines.
- Drift is computed **in the shader** from time and seeded noise (no CPU), and lines reuse the same function so connections stay attached.
- Agent environments recolour and re-parameterise this field (FORGE sparks drift upward; SYN connections brighten near the cursor; CIPHER switches to a hex-aligned lattice with sparse vertical "encryption streams").

### 7.3 Touch

Touch-drag injects into the same flow map. A tap emits a single radial impulse ripple. No interaction is hover-only.

### 7.4 Upgrade path: full GPGPU

If later phases need true per-particle physics (inertia, collisions with the cursor, springs back to targets), switch AgentCore to a **GPGPU ping-pong simulation** (position + velocity textures via `GPUComputationRenderer`). The shape generators and morph timeline stay the same; only the material changes. This is deliberately **not** in Milestone 2.

---

## 8. Cinematic transitions

### 8.1 Transition controller

A small typed state machine in the experience store:

```
idle ──select(agent)──▶ exiting ──▶ morphing ──▶ entering ──▶ idle
          ▲                 │            │           │
          └─── interrupt: retarget timeline to the newest agent ────┘
```

A **single GSAP master timeline** per transition orchestrates both layers:

| Phase | DOM layer | WebGL layer |
|---|---|---|
| exiting (~300ms) | Current content fades/masks out; focus is parked. | Current agent "exhales" (brightness up, slight expansion). |
| morphing (~1.2–1.6s) | Route swaps at the midpoint (React Router `navigate`), new content mounts hidden. | `uMorph` 0→1 with stagger + curl turbulence; colour uniforms tween; overlays cross-fade; ambient field retints; camera drifts toward the agent's sector of the system map. |
| entering (~400ms) | Heading decodes in, panels rise; focus moves to `<h1>`, the route is announced. | New agent settles, idle animation resumes. |

- **Interruptible:** a new selection mid-transition retargets from the current visual state. The CPU recomputes each particle's in-flight base position (the same staggered lerp the shader uses, minus turbulence; a few milliseconds even at 80k particles) and uploads it as the new `aPositionFrom`, then the timeline restarts toward the newest agent. No GPU readback is needed.
- **Browser back/forward and direct deep links** use the same controller. A deep link to `/ai` starts at SYN with an arrival animation rather than a morph from NEX.
- **Reduced motion:** the controller swaps to a 150–200ms opacity cross-fade and no morph.
- **View Transitions API:** not used for v1; GSAP owns both layers so they stay in sync.

### 8.2 Scroll choreography

GSAP ScrollTrigger drives section reveals, parallax depth and agent "reactions" to scroll (e.g., ATLAS arcs reconfiguring into a timeline as the experience section enters). Rules: never hijack or snap native scroll in v1; every scroll-linked effect has a no-motion equivalent; triggers are created and killed with `gsap.context()` inside `useGSAP` for clean unmounts.

---

## 9. Performance strategy

### 9.1 Loading sequence

1. **Prerendered HTML + CSS** paints instantly: wordmark, headline, tagline, NEX intro line, pathways, nav. This is the LCP element (text, not canvas).
2. **App JS hydrates**, with no Three.js in it (≈ 119.8 KB gz for the home page after Milestone 2.1, mostly React 19 + React Router). `MotionSync` reads `prefers-reduced-motion` and starts following it (§10).
3. **When idle** (`requestIdleCallback` with a 2 s timeout; `setTimeout` fallback), `StageMount` reads local capability signals once and combines them with the effective motion mode to plan a tier. Tier 0 stops here: no 3D download. With motion Off, no capability probe runs at all until motion is turned back on. The plan is recomputed (without re-probing) whenever the effective motion mode changes.
4. Otherwise the stage chunk is dynamically imported and fades in over the static design. Shape buffers are generated (in a worker if needed) and NEX coalesces from drifting particles.

Nothing waits on the 3D chunk. If it fails to load, throws, or WebGL is unavailable, the static design remains: an error boundary around the stage renders nothing.

### 9.2 Quality tiers (implemented policy: `planStage()`)

| Tier | Trigger (initial plan, local signals only) | AgentCore N | Ambient | Flow map | DPR cap | PostFX |
|---|---|---|---|---|---|---|
| **0 Static** | Effective motion `off`, Save-Data, no WebGL2, or software rendering (`failIfMajorPerformanceCaveat`) | n/a | n/a | n/a | n/a | CSS + SVG poster |
| **1 Low** | Effective motion `reduced` (§10), ≤ 2 GB device memory or ≤ 2 cores | ~12k | ~2k | 64² (none when motion is reduced) | 1.0 | none (shader glow) |
| **2 Medium** | Coarse pointer (touch) or ≤ 4 GB device memory | ~30k | ~6k | 128² | 1.5 | none |
| **3 High** | Everything else (including browsers that don't expose memory/cores) | ~60–80k | ~12k | 256² | 2.0 | bloom (mipmap blur) |

- **Runtime adaptation (implemented in Milestone 2.2, step-down only):** a frame-time monitor (one-second windows) asks for a step after two consecutive windows over 24 ms: first the DPR (−0.5 per step, not below 1), then the share of particles drawn (halved, not below 25%). It never steps back up automatically; stepping up cautiously after a sustained recovery is planned. The adapted values are the stage's single source of truth for quality (`performance/quality.ts`, held as low-frequency React state in `Stage`): the Canvas `dpr` and the geometry draw range are derived from them on every render, so route, visibility and motion changes, tier changes and context restores keep the adapted quality. It resets only when the stage unmounts (motion Off, Save-Data) and is then re-learned.
- **Backing-pixel limit (implemented in the Milestone 2.2 review):** independently of the DPR cap, the drawing buffer is kept within a per-tier pixel budget (tier 1: 1920×1080, tier 2: 2560×1440, tier 3: 3840×2160 backing pixels). On larger viewports the DPR is lowered to fit (floored to 0.125 steps, minimum 0.5). The minimum DPR takes precedence over the pixel target: on exceptionally large viewports, above four times the tier's pixel budget in CSS pixels (for example beyond 7680×4320 CSS pixels on tier 3), DPR 0.5 still exceeds the target and the buffer is allowed to, bounded at a quarter of the CSS pixel area. A 27-inch 5K display renders at DPR 1.5 rather than 2 (≈ 33 MB instead of ≈ 59 MB of colour buffer), while typical laptops and phones keep their full tier cap. Points are sized by DPR, so the look is unchanged apart from sharpness. Every later full-screen pass (bloom, NEX effects) inherits this bound.
- **Render only when visible:** stop the frame loop when the tab is hidden (`visibilitychange`), when the canvas is scrolled fully out of view, or when the user pauses.
- **No allocations in `useFrame`**; reuse vectors; uniforms mutated in place.
- **Draw-call budget:** < 15 on any view.

### 9.3 Budgets

Two separate JavaScript budgets, **enforced on every build** by `scripts/postbuild.mjs` (the build fails if either is exceeded):

| Budget | Limit (gzip) | Measured (Milestone 1) | How it's measured |
|---|---|---|---|
| **Initial application JS**, per prerendered page | ≤ 125 KB | ≈ 120.7 KB (home, Milestone 2.2) | Every script the page's HTML references, plus their static-import closure |
| **Lazy 3D stage** | ≤ 250 KB | ≈ 240.4 KB (Milestone 2.2 after review: Three.js + R3F + the ambient field, flow map, probe and quality control) | The `Stage-*.js` chunk plus everything reachable from it through static **and nested dynamic** `import()`s, minus chunks already in any page's initial set |
| Stage isolation | Must be 0 | 0 | The build fails if any page's initial set contains the stage chunk |

**Nested 3D chunks:** if the 3D layer is later split further (e.g. post-processing or a shape-generation worker loaded on demand), those chunks are found by following dynamic imports from the stage chunk and count towards the 3D budget, not the initial one. If the 3D layer grows past 250 KB in total, sub-budgets per lazy chunk (e.g. core stage vs. tier-3 post-processing) will be introduced rather than raising the cap silently. Web Worker files emitted by Vite (`new Worker(new URL(...), { type: "module" })`) aren't reached through `import()`; when the first worker is added, the budget script will be extended to include `*.worker-*.js` assets in the 3D total.

The 125 KB initial budget was revised from 90 KB because the React 19 + React Router framework baseline alone is ≈ 110 KB. That leaves little headroom: new initial-bundle dependencies need justification.

**Headroom and the NEX allocation (proposed, Milestone 2.2 review).** Both budgets stay as they are; raising either needs explicit approval.

| | Budget | Now | Headroom |
|---|---|---|---|
| Initial JS (largest page) | 125 KB | 120.7 KB | ≈ 4.3 KB |
| Lazy 3D closure | 250 KB | 240.4 KB | ≈ 9.6 KB |

The 3D figure is the **whole lazy dependency closure**: the stage chunk plus every chunk reachable from it through static and dynamic imports that no page loads up front (today the zustand and scheduler helpers R3F needs). Of the 240.4 KB, the project's own stage code (stage, ambient field, flow map, probe, quality control and shaders) is ≈ 7 KB; the rest is Three.js and R3F, which tree-shake poorly. Using more Three.js classes therefore costs little, but any new package or Three.js addon (`three/examples/jsm/...`) counts in full.

Proposed allocation for the NEX core (Milestone 3), within the existing 9.6 KB:

| Part | Allocation (gzip) | Notes |
|---|---|---|
| AgentCore component and lifecycle (arrival, idle, palette, quality hooks) | ≤ 3.5 KB | Reuses the Stage, flow map, monitor and quality state |
| Shape generation (procedural NEX geometry, deterministic like `generateParticles`) | ≤ 2.5 KB | Code, not model files; binary point clouds would need their own asset budget |
| NEX shaders (GLSL strings) | ≤ 2.0 KB | Shares noise/flow-sampling chunks with the ambient shaders |
| Reserve for fixes | ≈ 1.6 KB | Not to be spent on features |

Nothing for NEX goes into the initial bundle: the ≈ 4.3 KB initial headroom is kept for the route/agent wiring the DOM already has. **Not affordable without a new decision:** GSAP or any animation library inside the stage, post-processing (bloom) and the other four agents' shapes. These need either a separately budgeted lazy sub-chunk (§9.3 nested chunks) or an approved budget change, decided with measurements before they are built.

Other targets (measured with Lighthouse CI from Phase 6):

| Metric | Target |
|---|---|
| LCP (4G mobile, mid-tier) | < 2.0s |
| CLS | < 0.02 |
| INP | < 150ms |
| Frame rate | 60fps on capable desktops; ≥ 30fps sustained on tier 1 |
| Lighthouse (desktop) | Performance ≥ 90, Accessibility 100, Best Practices ≥ 95, SEO 100 |

### 9.4 WebGL compatibility and resilience (implemented in Milestone 2.2 unless noted)

**Capability detection is local** (ADR-013): WebGL2 probe with `failIfMajorPerformanceCaveat` (the probe context is released immediately via `WEBGL_lose_context`), `prefers-reduced-motion`, Network Information `saveData`, `pointer: coarse`, `navigator.deviceMemory` and `hardwareConcurrency` when exposed. No GPU benchmark databases, renderer-string fingerprinting (`WEBGL_debug_renderer_info`) or network requests. Measured frame times refine the initial guess at runtime.

**Flow-map render target fallback** (§7.1), probed once when the stage starts:

1. **Half-float** (`HalfFloatType`): requires `EXT_color_buffer_half_float` or `EXT_color_buffer_float` in WebGL2. Some drivers advertise support that fails in practice, so the format is validated by exercising the path the simulation needs (`flow/probe.ts`, implemented in the Milestone 2.2 review): two known texels (signed values, as velocities are) are rendered into a 2×1 target of the format, sampled with linear filtering exactly between their centres into a 1×1 target of the same format, and read back once (`RGBA`/`FLOAT`). The format is accepted only if both framebuffers are complete, the readback equals the texels' average (which also proves linear filtering) and WebGL raised no error. Renderer state (render target, clear colour) is restored and every probe resource disposed, whether the probe passes, fails or throws. The same probe validates RGBA8 (biased values, `UNSIGNED_BYTE` readback). Cost: two tiny draws and one 1-pixel readback when the flow map is first created.
2. **RGBA8** (`UnsignedByteType`): velocity encoded as `0.5 + v * scale` per channel with clamping. Lower precision and range, so dissipation and injection are tuned per format to avoid banding and drift.
3. **Disabled:** no flow map. Particles keep idle motion and a cheap analytic pointer falloff computed in the vertex shader (no render targets).

The chosen format is published as `data-stage-flow` (for debugging) and cached per renderer, so the probe runs once per stage, never per frame; a later flow map (switching Reduced → Full) reuses the result.

**Context creation failure:** renderer creation is wrapped in try/catch. On failure the stage unmounts itself and reports to `StageMount`, which records tier 0 for the session (in memory only, no storage) and leaves the static design.

**Context loss and recovery:**

- Listen for `webglcontextlost` on the canvas and call `preventDefault()` so the browser may restore it. Immediately stop the frame loop and fade the canvas out so the static backdrop shows (no frozen frame).
- On `webglcontextrestored`, rebuild GPU resources (geometries, materials, render targets) from retained CPU-side data (shape buffers are pure and deterministic, so they can be regenerated), then fade back in.
- If the context isn't restored within ~3 s, or is lost more than twice in a session, give up: drop to tier 0 for the session.
- **Tests (implemented in Milestone 2.2, `webgl.spec.ts`):** Playwright forces loss and restoration with `WEBGL_lose_context` (`loseContext()` / `restoreContext()`) on the real renderer and asserts the fade to static, the recovery, giving up after the third loss and giving up when no restore arrives within 3 s, with no retry for the rest of the visit. `quality.spec.ts` also checks that a restore keeps the adapted quality.

**Motion and data preferences:**

- Effective motion `reduced` (from the OS preference under System, or an explicit Reduced choice): tier ≤ 1, `pointerEffects: false` (fully assembled forms, slow idle, no flow map and no cursor displacement, no arrival or morph animation; cross-fades instead). **Implemented in Milestone 2.1:** the OS preference is followed live through a `matchMedia` change listener, and the stage plan updates on every change (tested in `motion.spec.ts`).
- Save-Data: tier 0. The 3D chunk is never requested, even with an explicit Full choice (implemented and tested). **Runtime changes (implemented in Milestone 2.2):** where the browser fires the Network Information `change` event (Chromium-based browsers), `StageMount` follows it with one feature-detected listener, removed on cleanup: Save-Data on → tier 0, which unmounts the stage and releases its GPU resources; off → the stage loads again (the chunk is already cached). Where no change event exists (Safari, Firefox), Save-Data is sampled at initial detection and respected for the rest of the visit. Both directions are tested at runtime in `webgl.spec.ts`.
- Effective motion `off` (visible control, implemented in Milestone 2.1): tier 0. `StageMount` unmounts a loaded stage and downloads nothing if it hasn't loaded yet. From Milestone 2.2 the render loop stops and the canvas fades to the static design before unmounting. Interaction with the OS preference is defined in §10 (motion preference policy).
- **Stage failure** (load or render error) disables the stage for the rest of the session, held in memory in `StageMount`, so turning motion Off and on again never retries a failed stage.

**Separation from essential content:** enforced by the composition boundary (§5), the lazy import, the build's stage-isolation check (§9.3) and Playwright tests confirming the stage chunk isn't requested with Save-Data or without WebGL2.

**Content Security Policy stays restrictive.** Three.js and R3F need neither `unsafe-eval` nor `unsafe-inline`: GLSL is compiled by the GPU driver, not JavaScript `eval`. Planned, reviewed additions only:
- `worker-src 'self'` if shape generation moves to a Web Worker (Vite emits workers as same-origin files; no `blob:`).
- No `img-src`/`connect-src` changes: textures and any assets are same-origin.
- Runtime style changes by GSAP use the CSSOM, which `style-src 'self'` allows.

---

## 10. Accessibility architecture

**Implemented in Milestone 1:**

- **Semantic, prerendered HTML** with one `<h1>` per page, landmark regions (`header`, `main`, labelled `nav`s, `footer`) and labelled sections.
- **Skip link** as the first focusable element, targeting `<main>`.
- **RouteAnnouncer:** after client-side navigation, focus moves to the new `<h1>` and a polite `aria-live` region announces the page title. From Phase 3 this runs after transitions finish.
- **ScrollManager:** scroll restoration kept in memory. React Router's `<ScrollRestoration>` is deliberately not used because it writes to `sessionStorage` (device storage under ekomloven § 3-15).
- **Mobile menu:** disclosure button with `aria-expanded`/`aria-controls`; Escape closes it and returns focus.
- **Visible focus** (2px accent outline) on every interactive element.
- **Touch targets:** standalone controls are ≥ 44×44 CSS px (project goal, above WCAG 2.2 AA's 24×24). Links inside running text are marked `data-inline` and rely on the WCAG 2.5.8 inline exception. Stretched card links are measured by their card.
- **Runtime motion preferences** (Milestone 2.1): see the policy below. CSS transitions follow the *effective* mode through `<html data-motion>`; without JavaScript (no attribute) they follow `prefers-reduced-motion` directly.
- **Colour contrast:** every text/accent token meets WCAG AA on every surface (unit-tested).
- **Reflow and enlarged text** (Milestone 2.1): no page scrolls sideways or clips text at 100%, 150% or 200% browser text size, from 320 px phones to desktop, on every route including the 404 page (tested). Measures:
  - Fluid display sizes (`--text-display`: `clamp(2.25rem, 13.333vw, 3rem)` for the large page headings; `--text-title`: `clamp(1.875rem, 10vw, 2.25rem)` for secondary page headings). They're identical to the previous `text-5xl`/`text-4xl` on screens 360 px and wider at normal text size, and the `sm`/`lg` steps are unchanged. The `rem` minimum keeps headings growing with the visitor's text setting.
  - Mobile single-column grids use `grid-cols-1` (`minmax(0, 1fr)`), so a long word can't widen a column past the screen.
  - `overflow-wrap: break-word` on body text and `anywhere` on h1–h3: a word breaks only when it can't fit on a line by itself, which never happens at normal text sizes. Contact links (URLs, email addresses) use `wrap-anywhere`.
  - In very narrow layouts in `rem` terms (`width < 18rem`, reached only with enlarged text; 288 px at the default size), text is hyphenated (`hyphens: auto`, `lang="en-GB"`).
  - Rows that pair text with a label or badge (the development notice, environment contents, pathway cards) let the label/badge wrap below only when the text would get less than 8–10rem, which never happens at normal sizes down to 320 px. The wordmark may wrap after "MOYLAN", and below 10.5rem the Menu button shows only its icon (accessible name "Menu").
- **Non-WebGL experience:** fully functional and complete; the static NEX emblem has a text alternative.

**Motion preference policy (implemented in Milestone 2.1):**

| Site setting | Effective motion | When the OS preference changes |
|---|---|---|
| **System** (default) | `reduced` if `prefers-reduced-motion: reduce`, else `full` | Follows it live (`matchMedia` change listener) |
| **Full** (explicit choice) | `full`, within what the device allows (Save-Data, missing WebGL2 and low-end tiers still apply) | Ignored. The visitor chose on this site; the control stays visible to change back |
| **Reduced** (explicit choice) | `reduced`: minimal decorative movement, no pointer-driven effects | Ignored |
| **Off** (explicit choice) | `off`: no decorative animation, static design, no 3D work | Ignored |

- **Rules:** the default always honours the OS; only an **explicit, visible** choice overrides it. Choosing **System** again returns to following the OS.
- **No persistence (decided for Milestone 2.1):** the choice lives in memory only. Nothing is written to cookies, web storage or any other device storage, so a reload or a new visit starts on System again (PRIVACY-COMPLIANCE §4.3). Client-side navigation within a visit keeps the choice.
- **Implementation:**
  - `src/motion/policy.ts`: the pure policy (`resolveMotion`).
  - `src/motion/store.ts`: a Zustand store holding `setting`, `systemPrefersReduced` and `effective` (ADR-007). Its initial state is fixed (`system`/`full`) so prerendered HTML and hydration always match. No-op updates never notify subscribers. `startMotionSync()` reads and follows the OS preference (with the legacy `addListener` API as a fallback), mirrors the effective mode onto `<html data-motion>` through a store subscription (no React re-render), and removes every listener on cleanup.
  - `src/motion/MotionSync.tsx`: mounts the sync for the shell's lifetime.
  - `src/composition/StageMount.tsx`: subscribes to `effective` only and recomputes the stage plan when it changes.
  - `src/styles/app.css`: under `data-motion="reduced"` or `"off"`, transitions and animations collapse and hover lifts are removed; an explicit `full` keeps the site's subtle transitions even when the OS prefers reduced motion.
- **The control** (`src/components/layout/MotionControl.tsx`), in the header on every page:
  - A disclosure button (`aria-expanded`, `aria-controls`) whose accessible name states the setting and the mode in effect, e.g. "Motion: System, Reduced". The visible label starts with "Motion" (WCAG 2.5.3); on wide screens the state is also shown in mono next to it, and a three-bar glyph shows the effective mode on every width.
  - The panel is a native radio group in a `fieldset` with legend "Motion", so keyboard behaviour is the platform's own: Tab into the group, arrow keys to choose. Each option has a short description (`aria-describedby`). The panel shows the mode in effect and says the choice isn't saved.
  - Escape closes the panel and returns focus to the button; focus or a click moving outside closes it. Each option row is at least 44 px high.
  - **Short and enlarged layouts:** the panel is anchored to the header's content container and never wider than the space available. Its height is capped to the viewport below the header (`100dvh`, with a `100vh` fallback, minus the header offset and safe-area insets). Its contents scroll internally with `overscroll-behavior: contain`, and focusing an option scrolls its whole row into view. The mobile menu has the same height cap. Below 360 CSS px (e.g. 1280 px at 400% zoom) the button shows only its glyph, so the header never scrolls sideways; its accessible name still starts with "Motion".
  - **Enlarged text** (the browser's font-size setting, which also scales `rem` breakpoints): when the wordmark and controls no longer fit on one line, the header row wraps them onto a second row instead of overflowing. `SiteHeader` measures the row with a `ResizeObserver` and writes its height to `--os-header-row`, a CSSOM write on resize only that the CSP allows and that causes no React re-render. Both panels size themselves from that variable. A wrapped header gets `data-wrapped` and stops being sticky, so a two-row header can't cover a large part of a small screen. At the default text size the header is unchanged: one 64 px sticky row.
  - **One header disclosure at a time:** `SiteHeader` holds a single local `"menu" | "motion" | null` value. Opening Motion closes the mobile menu and vice versa, so Escape always acts on the one open panel and returns focus to its own button. This needs no global state or extra dependency.
  - It needs JavaScript, so the prerendered button is `invisible` and `disabled` (reserving its space, so there's no layout shift) until hydration. Without JavaScript there's no decorative animation to control, and CSS follows the OS preference.

**Planned (later milestones):**

- **Canvas:** `aria-hidden="true"`, `pointer-events: none` (the placeholder stage layer already follows this).
- **DecodeText component:** renders the final string in the DOM (`aria-label` on the wrapper, decorative glyph spans `aria-hidden`) and does nothing under reduced motion.
- **Developer console (optional):** `role="dialog"` with `aria-modal`, combobox/listbox pattern, opened with `` ` `` or `Ctrl/⌘+K`; Escape closes; focus returns to the trigger.

**What automated testing does and doesn't cover:** axe-core catches a subset of WCAG failures (roughly a third to a half of issues), and keyboard/focus/touch-target tests cover specific behaviours. **Not yet done:** manual screen-reader testing (VoiceOver, NVDA), manual keyboard review of every page, zoom/reflow at 400%, Windows high-contrast mode. These are scheduled for the Phase 6 release gate, so the site is described as *built to* WCAG 2.2 AA, not certified.

---

## 11. Testing and quality gates

Current coverage (Milestone 2.2, after the independent-review remediation): **141 unit/component tests** (Vitest, 16 files) and **206 end-to-end tests** (103 scenarios × desktop + Pixel 7; four mouse- or desktop-DPR-only scenarios are skipped on one project each, so 202 run). The WebGL tests use a **real renderer**: the test stub only drops `failIfMajorPerformanceCaveat`, so CI machines with software rendering still exercise the stage, while production keeps the caveat. Milestone 1 ended with 59 unit and 98 end-to-end tests.

| Layer | Tool | What is covered now |
|---|---|---|
| Unit | Vitest | Agent registry (manifest consistency, CSS-token sync, **WCAG AA contrast of every colour token**, voice rule); route manifest and `agentForPath` (every page, trailing slashes, 404, project slugs); `planStage` tier policy combined with each motion mode (Off → tier 0, Reduced → ≤ tier 1 without pointer effects, Full never overriding device limits) and `probeWebGL2`; motion policy table; motion store (OS changes followed only under System, explicit overrides, no-op updates don't notify, a subscriber re-renders only when its slice changes, no storage writes); `startMotionSync` (initial read, live changes, legacy `addListener`, missing or throwing `matchMedia`, cleanup removes listener, subscription and attribute); `StageMount` with a manual idle queue, fake timers and mocked Stage modules (one probe per visit, re-planning without re-probing, Off before the idle probe cancels it, unmount cancels it, the `setTimeout` fallback is cancellable, a failed lazy import and a render failure both stay failed after switching Off and on, with no retry); 3D layer: particle generation, tier table, flow-format fallback order, frame-rate-independent dissipation, pointer-tracker listener lifecycle, frame monitor, the quality ladder, monotonic quality, backing-pixel limit, and flow-target validation with a scripted renderer (wrong values, nearest filtering, WebGL errors, incomplete framebuffers and exceptions all reject half-float, restore renderer state and dispose probe resources; RGBA8 is then selected; one probe per renderer); projects truthfulness rule; contrast maths |
| Component | Vitest + Testing Library (jsdom) | Header nav, `aria-current`, mobile menu (Escape, focus return, closes on navigation); Home (single h1, NEX first-person intro, five pathway links, emblem text alternative, no inline styles); `ExternalLink` (enforced `target`/`rel`, unsafe URLs rendered as text); `MotionControl` (accessible name with setting and effective mode, labelled radio group with descriptions, keyboard operation with arrow keys and Escape focus return, live OS updates, closing on outside focus/click, invisible and disabled in prerendered HTML); `SiteHeader` disclosures never overlap (pointer and keyboard, Escape focus return); `Stage` quality state with recording Canvas/field mocks (the Canvas receives the adapted DPR range across route re-renders, tier changes, visibility changes, stale steps and viewport resizes) |
| E2E | Playwright against the **production build with real headers** | Every route: 200, one `h1`, title, canonical URL; real 404 status; trailing-slash redirect; client-side navigation with focus management; skip link; **JavaScript disabled: every route and the 404 page render their content, heading and footer navigation from static HTML, plus a homepage-to-environment journey**; reduced motion; no horizontal overflow; mobile menu; scroll restoration without storage |
| Accessibility | `@axe-core/playwright` | Zero violations (WCAG 2.0/2.1/2.2 A + AA + best practice) on every route, desktop and mobile; **44×44 touch targets** on every route |
| WebGL pipeline | Playwright (WebGL2/Save-Data stubbed), real renderer | Stage loads lazily only when allowed; persists across routes; follows the route manifest (including 404); low tier without pointer effects under reduced motion; never downloaded without WebGL2 or with Save-Data. **Live environment (`webgl.spec.ts`):** decorative canvas behind content, no DOM changes on pointer movement, live motion changes, hidden-tab pause, context loss/restore and both give-up paths, Save-Data on/off at runtime, renderer creation failure without retry, axe with the canvas, and a half-float target whose readback fails falling back to RGBA8. **Adaptive quality (`quality.spec.ts`, desktop at DPR 2, deterministic slowness by busy-waiting in each frame):** the full ladder to the lowest quality, then route, visibility, motion (tier) changes and a context restore keep it, with the renderer's real DPR, the draw count and the published statistics in agreement; and stepping continues from the adapted level afterwards |
| Motion preferences | Playwright (`emulateMedia` for live OS changes) | Default System following the OS on first load; live OS changes update `<html data-motion>`, the control, CSS transitions and the stage plan without reloading the chunk; explicit Full/Reduced/Off override the OS until System is chosen; Off removes the stage, keeps the static design and persists across client-side navigation, and turning motion back on restores the stage; keyboard operation and focus return; axe with the panel open, panel inside the viewport, 44 px option rows; no storage, cookies or third-party requests after changes, and a reload returns to System; without WebGL2 or with Save-Data an explicit Full never downloads the chunk; without JavaScript the control is hidden and CSS follows the OS; **short and zoomed layouts** (667×375, 667×320, 640×360 = 1280×720 at 200%, 320×256 = 1280×1024 at 400%): the panel stays inside the viewport with no sideways scrolling, every option is reachable by pointer (desktop), touch (mobile) and arrow keys with the focused row fully visible, 44 px rows, contained overscroll, and the mobile menu stays inside the viewport; opening Motion closes the mobile menu and vice versa; **enlarged text** at 150% and 200% (the browser default font size, set through Chromium's DevTools protocol) at 320×568, 412×915 and 667×375: every header control inside the viewport, ≥ 44×44 and not covered, the accessible name unchanged, a wrapped header not sticky, the Motion panel inside the viewport with each focused option's radio and name visible (and its whole row whenever it fits), the mobile menu inside the viewport; at the default text size the header stays one sticky row; between 640 and 767 px the open panel starts below the header and leaves the header controls usable |
| Security / privacy | Playwright + postbuild checks | CSP and security headers; **no CSP violations or console errors anywhere** (suite-wide fixture); no cookies, local/session storage, IndexedDB, Cache Storage, service workers or third-party requests; build fails on inline `style`/event-handler attributes, source maps, an oversized SWA config, budget overruns or a non-lazy stage chunk |
| Supply chain | npm audit (production + full tree), CodeQL, dependency review, Dependabot | CI (see SECURITY.md §10) |
| Static | `tsc` (strict), ESLint (`jsx-a11y` strict, react-hooks, CSP/XSS rules, 3D import boundary), Prettier | |
| Performance | Lighthouse CI | Not yet: Phase 6 |

Visual-regression snapshots of WebGL are flaky; we snapshot DOM/fallback states only and review 3D by eye on PR preview environments.

---

## 12. Content model

Typed data in `src/content/`, validated at build time **(proposed: Zod)**:

```ts
type Status = 'completed' | 'in-progress' | 'planned';

interface Project {
  slug: string;
  title: string;
  agent: AgentId;                 // FORGE | SYN | ATLAS | CIPHER
  status: Status;                 // rendered as a visible badge: truthfulness rule
  summary: string;
  role: string;
  stack: string[];
  evidence: { repo?: string; demo?: string; writeup?: string; credential?: string };
  metrics?: { label: string; value: string; context?: string }[];
  diagram?: string;               // SVG path
  featured?: boolean;
}
```

The schema **refuses** `status: 'completed'` without at least one evidence link. Long-form case studies use **MDX** (Phase 4 decision). New projects (e.g., the C#/.NET insurance-claims demo) are added by creating one data entry + optional MDX file.

---

## 13. Hosting, CI/CD and security

The security architecture, threat model and release gate live in [`SECURITY.md`](SECURITY.md); privacy rules in [`PRIVACY-COMPLIANCE.md`](PRIVACY-COMPLIANCE.md). This section covers how the build implements them.

### Build pipeline

```
react-router build ──▶ build/client/**/index.html (prerendered) + hashed /assets
        │
        ▼
scripts/postbuild.mjs
  ├─ /404/index.html → /404.html; remove unused __spa-fallback.html
  ├─ FAIL on inline style attributes, inline event handlers or *.map files
  ├─ SHA-256 hash every inline <script> (React Router hydration bootstrap)
  ├─ config/staticwebapp.config.base.json + hashes → build/client/staticwebapp.config.json
  │     (FAIL if > 20 KB, the SWA limit)
  └─ sitemap.xml from prerendered pages
```

### Azure Static Web Apps configuration

- `trailingSlash: "never"` gives one canonical URL per page (`/about/` → 301 `/about`).
- No `navigationFallback`: every route is prerendered, so unknown URLs get the designed `/404.html` via `responseOverrides` with a real 404 status. **⚠ Verify on the first preview environment** that SWA preserves the 404 status on rewrite (Microsoft's docs don't state it; the local preview server does).
- `globalHeaders`: CSP (hash-based, no `unsafe-inline`/`unsafe-eval`), HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, COOP, CORP, `X-Frame-Options`, `Cache-Control: no-cache` for HTML; `/assets/*` immutable for a year.
- `scripts/serve-static.mjs` emulates these behaviours locally, so Playwright tests the real headers.

### Pipeline

```
feature branch ──PR──▶ ci.yml: npm ci · audit · format · lint · typecheck · unit · build · e2e+axe
                       codeql.yml · dependency-review.yml
                         └─▶ SWA preview environment (per-PR URL, once deployment is approved)
main ──merge──▶ deploy job (protected `production` environment) ──▶ production
```

- All third-party actions are pinned to full commit SHAs; `GITHUB_TOKEN` defaults to `contents: read`.
- The deploy workflow is **not** in the repository yet. It's added in Phase 6 with your approval, using the SWA deployment token as a `production` environment secret.

### Version 2: optional conversational agents (deferred)

```
Browser ──▶ /api/agent (SWA managed Azure Function)
              ├─ per-IP + global rate limits, request size caps, spend cap
              ├─ agent system prompt (persona, scope, truthfulness rules)
              ├─ retrieval over approved content (src/content → build-time index)
              └─ provider adapter (LLM provider chosen at that time)
```

Full controls: SECURITY.md §12 (OWASP Top 10 for LLM Applications 2025) and PRIVACY-COMPLIANCE.md §8. Explicit disclosure that responses are AI-generated, minimal logging, and no personal-data retention. Chat stays an enhancement: every answer links to the canonical page. Provider choice is deliberately left open (the blueprint mentions OpenAI/Azure OpenAI; the master plan says "a shared LLM API").

---

## 14. Architecture decision records

| ADR | Decision | Status |
|---|---|---|
| 001 | Vite + React Router v7 framework mode with static prerendering (`ssr: false`); no runtime SSR | **Accepted** (7 Nov 2026) |
| 002 | Single persistent R3F canvas behind a semantic DOM layer; the DOM never imports the 3D layer | **Accepted** |
| 003 | All agents share one morphing GPU particle system with equal-N shape generators | **Accepted** |
| 004 | One shared low-resolution pointer flow map drives all cursor interaction; GPGPU deferred | **Accepted with constraints** (7 Nov 2026, details below) |
| 005 | GSAP master timeline orchestrates DOM + WebGL transitions; no View Transitions API in v1 | Proposed (review at Phase 3) |
| 006 | WebGL2 + GLSL now; WebGPU/TSL reconsidered after Phase 3 | Proposed |
| 007 | Zustand for low-frequency semantic state only; continuous data in refs and GPU state | **Accepted with constraints** (7 Nov 2026, details below) |
| 008 | No Lenis in v1 | Proposed (per plan's conditional) |
| 009 | Hash-based CSP generated at build time; no inline styles in markup; agent colours via `data-agent` | **Accepted** (implemented) |
| 010 | No cookies or web storage in v1, including framework defaults (custom in-memory `ScrollManager`) | **Accepted** (implemented) |
| 011 | Unknown URLs return a real 404 (prerendered `/404.html`), not an SPA fallback | **Accepted** (implemented) |
| 012 | One route manifest (`src/routing/manifest.ts`) generates the router config and owns route → agent mapping; `agentForPath()` covers 404s and project slugs | **Accepted** (implemented) |
| 013 | Local capability detection (`planStage`) instead of `detect-gpu` or other network-dependent benchmarks; root-level `StageMount` is the only bridge to the lazy 3D chunk | **Accepted** (implemented; replaces the detect-gpu proposal) |

### ADR-004: Shared pointer flow map (accepted with constraints)

- **Decision:** one shared, low-resolution pointer flow map (ping-pong render target) is the only cursor-interaction substrate for the ambient field and all agents.
- **Constraints:**
  - simple inject → advect → dissipate passes only;
  - dissipation normalised by frame delta (`pow(d, Δt·60)`, clamped Δt);
  - render-target fallback half-float → RGBA8 → analytic falloff (no render target);
  - **no Jacobi pressure solver or divergence projection in Milestone 2**;
  - **no flow-map allocation and no pointer interaction while effective motion is `reduced` or `off`**, including after runtime preference changes.
- **Consequences:** consistent, cheap interaction on every tier; richer fluid behaviour needs a new ADR backed by measured performance.

### ADR-007: State management boundaries (accepted with constraints)

- **Decision:** Zustand may hold **low-frequency semantic state** only: selected/active agent, transition requests and phase, quality tier, pause state, motion preference (site setting and effective mode).
- **Constraints:**
  - **Pointer position, pointer velocity, frame timing and per-frame interpolation** live in mutable refs or preallocated typed arrays/vectors owned by the stage, never in React or Zustand state.
  - **Continuous visual state** (morph progress, colours, flow field, camera offsets) lives in GPU uniforms and textures, written in `useFrame` or by GSAP tweening plain objects/uniforms.
  - **No React `setState` and no Zustand `set` on every animation frame.** Store updates happen on discrete events (route change, hover start/end, tier change, toggle).
  - **No React component subscribes to continuous animation data.** Components select only the semantic slices they render; the render loop reads the store with `getState()` without subscribing.
  - The motion preference follows the policy in §10.
- **Verification:** Milestone 2.1 adds a unit test showing that a store subscriber re-renders only when its own slice changes, and that no-op updates don't notify. From Milestone 2.2, a dev-only render counter or React Profiler check confirms that the DOM tree doesn't re-render during pointer movement or idle animation.

Each accepted ADR gets its own file in `docs/adr/` when the corresponding milestone is reviewed.

## 15. Implementation plan

Aligned with the master plan's phases. Each milestone ends with something demonstrably working and is **reviewed individually** before the next begins.

| Phase / milestone | Deliverable | Status |
|---|---|---|
| **1 Creative spec** | DESIGN-BRIEF, ARCHITECTURE, AGENT-PROFILES, SECURITY, PRIVACY-COMPLIANCE | ✅ Approved (v0.2) |
| **2 · M1 Static foundation** | Accessible, secure, prerendered NEX homepage + placeholder environments (§16) | ✅ Complete: approved after two independent reviews |
| **2 · M2.1 Runtime motion preferences** | Live `prefers-reduced-motion` handling, the motion preference policy and store, the visible motion control, stage-plan integration, tests (§10, §17) | ✅ Implemented, awaiting review |
| **2 · M2.2 First living environment** | Three.js/R3F stage, ambient GPU particle field, shared FlowField (ADR-004), frame-time adaptation (step-down), context loss/restore, runtime Save-Data (§18) | ✅ Implemented; visual direction approved; review findings remediated, awaiting independent verification |
| **2 · M2.3+** | Visual refinement from the M2.2 review, then the NEX core (M3) | After M2.2 review |
| **2 · M3 NEX core** | AgentCore particle system with the NEX shape, arrival and idle animation | After M2 review |
| **2 · M4 Prototype polish** | Pathway colour preview, fallbacks, performance tuning, Lighthouse | After M3 review |
| **3 Agent world** | NEX → FORGE morph spike, then all specialists, transitions and environments | |
| **4 Real content** | Accurate projects, CV, credentials, case studies (MDX) | |
| **5 Assets + polish** | Asset brief → Higgsfield → posters, OG images; tuning | |
| **6 QA + launch** | Deploy workflow, Azure setup, release gate (SECURITY.md §13), custom domain | Requires approval |
| **7 Expand** | .NET claims demo case study; optional AI agents | |

---

## 16. Milestone 1: static NEX homepage foundation (implemented)

**Goal:** the complete non-WebGL experience, which is also the permanent fallback, with production-grade configuration, security and accessibility, on the exact architecture the 3D layers will build on.

### Delivered

1. **Project configuration:** Vite 8, React 19, TypeScript 6 (strict), React Router 7 framework mode with full static prerendering, Tailwind 4 tokens, ESLint (a11y strict + CSP/XSS rules), Prettier, Vitest, Playwright + axe.
2. **Layout:** skip link, sticky header with primary navigation + CV, accessible mobile menu, footer with environments, site links, external links and the privacy statement, atmospheric CSS backdrop.
3. **NEX homepage:** name, positioning, tagline, NEX first-person introduction with the approved intro line, static NEX emblem (the tier-0 fallback poster), five pathways (four specialists + All projects), "Under the hood" engineering principles.
4. **Placeholder environments:** FORGE, SYN, ATLAS and CIPHER pages driven by the agent registry: identity, approved intro line, content outline with *planned* labels, honest "in development" notice, links to other environments and back to NEX.
5. **Secondary pages:** Projects (status-labelled), Experience, About (with CV anchor), Contact, draft Privacy notice, designed 404 and error boundary.
6. **Security and privacy controls:** hash-based CSP and hardened headers, real 404s, no source maps, no cookies/storage/third-party requests, SHA-pinned CI workflows, CodeQL, dependency review, Dependabot with cooldown.

### Remediation after independent code review

No critical or high findings. Addressed:

- **Privacy notice accuracy:** explains ordinary first-party HTTP caching and the ekomloven § 3-15 exemption relied on, instead of claiming nothing is stored on the device (marked for legal verification).
- **Architecture consistency:** one route manifest (ADR-012); `StageMount` composition adapter in the root with a lazy placeholder stage (ADR-013); lint-enforced 3D boundary.
- **WebGL safeguards designed** (§9.4) and the loading/gating parts implemented and tested; separate enforced JS budgets (§9.3).
- **`ExternalLink`:** enforced `target`/`rel` can't be overridden; only `https:` URLs become links.
- **44×44 touch targets** for navigation, footer and standalone links, with an e2e test on every route.
- **CI:** full-tree `npm audit --audit-level=high` in addition to the production audit.
- **Deprecation warnings:** React Router v8 future flags enabled; the remaining Vite `envFile` warning is upstream (§2).
- **Test infrastructure:** the preview server re-reads headers on each request, and Playwright uses a dedicated port and never reuses a running server (a stale server once served outdated CSP hashes).
- **Repository hygiene:** `docs/references/` kept local only; `.gitignore` hardened; dead code removed (`getAgent`).

### Acceptance criteria (all verified by automated tests)

- With JavaScript disabled, every page (and the 404 page) shows its content, heading and footer navigation from static HTML. On mobile the header menu needs JavaScript; the footer provides the same destinations.
- Every route passes axe (WCAG 2.2 AA) on desktop and mobile with zero violations.
- No CSP violations, console errors or hydration errors on any route.
- No cookies, web storage or third-party requests.
- Keyboard: skip link first; focus moves to the new `<h1>` after client-side navigation; the mobile menu closes with Escape and returns focus.
- Reduced motion disables transitions; no horizontal overflow at mobile width.

### Not in Milestone 1

WebGL, particles, the interactive NEX avatar, morph transitions, the motion toggle (arrives with the first motion in M2), real case-study content, final logo/assets, AI chat, Azure deployment.

---

## 17. Milestone 2.1: runtime motion preferences (implemented)

**Goal:** make motion a runtime, visitor-controlled property before any GPU animation exists, so the WebGL stage in Milestone 2.2 is built against a tested contract.

### Delivered

1. **Policy and store** (`src/motion/`): System / Full / Reduced / Off resolved to an effective `full | reduced | off` mode (§10). The OS preference is followed live, with listener cleanup. In memory only.
2. **Stage integration:** `planStage(signals, motion)` now takes the effective mode. Motion is no longer a capability signal, so `readCapabilitySignals()` doesn't read `prefers-reduced-motion`. Off → tier 0 (`motion-off`), Reduced → at most tier 1, and `StagePlan.pointerEffects` is true only with full motion on tier ≥ 1. That is the ADR-004 contract the flow map must honour. The placeholder stage exposes it as `data-stage-pointer`.
3. **StageMount:** probes capabilities once (never while Off), recomputes the plan when the effective mode changes, unmounts the stage under Off, and keeps a stage failure for the session.
4. **CSS:** transitions follow `<html data-motion>`; reduced and off also remove hover lifts. With no JavaScript, CSS falls back to the OS media query.
5. **Motion control** in the header (§10), consistent with the cybernetic-minimalist identity: mono `// Motion` legend, bracketed glass panel, a three-bar glyph lit in the page's agent accent.
6. **Dependency:** `zustand` 5.0.16, pinned exactly. Chosen over 5.1.0 because 5.1.0 was two days old at install time, inside the project's 7-day Dependabot cooldown. No Three.js or React Three Fiber yet.

### Acceptance criteria (verified by automated tests)

- Default System follows the OS on load and live; explicit choices override it until System is chosen again.
- Off removes the stage and downloads nothing more; Reduced disables pointer effects and caps the tier; Full never overrides Save-Data, missing WebGL2 or low-end tiers.
- Fully keyboard operable; axe passes with the panel open on desktop and mobile; 44 px targets.
- No cookies, storage or third-party requests; a reload returns to System.
- Initial JS ≈ 119.8 KB gz after remediation (budget 125 KB); the lazy stage chunk is unchanged.
- On short and zoomed viewports every motion option is reachable by pointer, touch and keyboard; header disclosures never overlap.

### Remediation after independent review

No critical or high findings. Addressed:

- **Short-viewport Motion menu (medium):** at 667×375 and 667×320, options below the fold were unreachable. The panel now caps its height to the viewport below the header (`dvh` with a `vh` fallback, safe-area insets), scrolls internally with contained overscroll, and scrolls the focused option's row into view. While fixing this, two related problems were found and fixed. At 320 px wide the new button pushed the Menu button off-screen, so below 360 px it now shows only its glyph. With enlarged text the panel could extend past the left edge, so it is now anchored to the header container with a capped width. The mobile menu got the same height cap.
- **Overlapping disclosures:** Motion and the mobile menu could be open together. `SiteHeader` now allows one at a time with a single local state value.
- **StageMount coverage:** deterministic unit tests for Off before the idle probe, cancellation, the `setTimeout` fallback, a failed lazy import, a render failure followed by switching Off and on, and no retry within the visit.
- **Save-Data:** documented as sampled at initial detection, with a Milestone 2.2 requirement to review runtime changes (§9.4); runtime changes were implemented in Milestone 2.2.
- **Enlarged text (follow-up check):** measured with Chromium's real default-font-size setting rather than a viewport resize. At 150–200% text on 320–412 px phones the header overflowed by up to 248 px and pushed the Menu button off-screen. Shortening labels can't fix this, because the wordmark and two 44 px controls alone exceed the available width. The header row now wraps, the panels size from its measured height, and a wrapped header isn't sticky (§10). Initial JS ≈ 119.8 KB gz.
- **Page content at enlarged text (follow-up):** a survey of every route (11 pages × widths 280–1280 px × 100/150/200% text) found page content scrolling sideways at 150–200% text on phones. The root causes were display-heading words wider than the screen, mobile grid columns widened by their longest word, label/badge rows that couldn't wrap, and long URL tokens. These are fixed with fluid heading sizes, `grid-cols-1`, need-only word breaking, narrow-regime hyphenation and wrap-when-needed rows (§10). The survey now finds no overflow in all 396 combinations, and normal-size typography is unchanged from 360 px up. A new `reflow.spec.ts` covers this at 320/375/412 px and at 768/1280 px with 200% text, including text clipped inside `overflow: hidden` containers, plus normal-size guards (full heading size, no hyphenation, no split words, single-row notice and badges).
- **Known limitation:** Chromium never hyphenates capitalised words (to protect proper nouns). So a capitalised heading word wider than the line, e.g. "Engineering" at 200% text on phones up to about 412 px, breaks without a hyphen ("Engineeri / ng"). Avoiding that would mean shrinking display headings to roughly normal size at 200% text, which was rejected in favour of keeping enlarged headings large. Lower-case words hyphenate correctly.

### Not in Milestone 2.1

Three.js / R3F, the GPU particle system, the flow map, GSAP motion, context-loss handling and the runtime frame-time monitor (Milestone 2.2+). Persisting the motion choice across visits was considered and not adopted (PRIVACY-COMPLIANCE §4.3).

---

## 18. Milestone 2.2: first living WebGL environment (implemented)

**Goal:** the first real-time GPU particle environment, built on the M2.1 motion contract, as the foundation for NEX and the specialist agents.

### Delivered

- **Stage** (`src/experience/Stage.tsx`): one persistent R3F canvas inside the existing lazy boundary. WebGL2 with `failIfMajorPerformanceCaveat`, no depth or stencil buffer, no antialiasing, transparent, events sourced from the `pointer-events: none` stage layer so the canvas never intercepts input. The canvas fades in only after its first frame. `data-stage-state` is `starting | running | static | paused | lost`.
- **Ambient field** (`ambient/`): §7.2. One draw call; tier counts 2k / 6k / 12k; DPR caps 1 / 1.5 / 2.
- **Pointer flow map** (`flow/`): §7.1 (ADR-004), with the half-float → RGBA8 → analytic fallback; 64² / 128² / 256² by tier.
- **Motion modes:** Full animates continuously with pointer effects. Reduced renders one still, fully formed frame on demand (no animation loop, no flow map, no pointer listeners). Off unmounts the stage (no canvas, no GPU work). System follows the OS live. All tested with a real renderer.
- **Runtime safeguards:**
  - The render loop stops while the tab is hidden.
  - Context loss: the canvas fades out at once. Restoration rebuilds the scene. If the context isn't restored within 3 s, or is lost more than twice, the stage gives up for the visit through `onUnavailable` (in-memory tier 0).
  - Renderer creation failure is caught by the stage boundary.
  - Save-Data changes are followed where the browser reports them.
- **Frame-time adaptation** (`performance/FrameMonitor.ts`, `performance/quality.ts`): one-second windows; two consecutive windows over 24 ms step the DPR down by 0.5 (to 1), then halve the particles drawn (to 25%). Step-down only for now; the adapted quality is owned by `Stage` (§9.2).
- **ADR-007:** React renders on discrete changes only (a quality step is one such change, at most four per visit). Time, pointer samples, flow textures and measurements live in refs, uniforms and render targets. Frame measurements are published on the stage element once per second (`data-stage-frame-ms`, `-frames`); `-dpr` and `-particles` report the renderer's actual pixel ratio and the geometry's drawn count whenever either changes; plus `-flow` and `-draw-calls`. An end-to-end test confirms that pointer movement causes no DOM changes. The React Compiler lint rule `react-hooks/immutability` is disabled for `src/experience/` only, because Three.js objects are mutable by design.
- **Paint-order fix:** `body` no longer has its own background (`html` provides the colour). The body background painted over the fixed negative-z layers, hiding both the new canvas and the Milestone 1 CSS backdrop (teal glows and grid), which therefore becomes visible for the first time in this milestone.

### Measurements (headless Chromium on Apple silicon, production build)

| Item | Value |
|---|---|
| Initial JS (largest page) | 120.7 KB gz (budget 125 KB; was 119.8 KB) |
| Lazy 3D JS (Stage chunk + its exclusive imports) | 240.4 KB gz after the review (budget 250 KB; headroom ≈ 9.6 KB); was 239.5 KB |
| Particles / draw calls | 12,000 desktop (tier 3), 6,000 touch (tier 2), 2,000 low-end (tier 1); 2 draw calls per frame (flow pass + particles), 1 without pointer effects |
| Frame time | ≈ 16.7 ms (vsync-limited 60 fps) on tiers 1–3 after the first second. With the CPU throttled 6×: 40 → 32 ms, then DPR stepped 2 → 1.5 and frames recovered to ≈ 19 ms |
| GPU memory (estimate) | Particle buffers ≈ 0.34 MB (12k × 7 floats); flow targets 2 × 256² × 8 B ≈ 1 MB (half-float) or 0.5 MB (RGBA8); the dominant cost is the colour buffer, ≈ 20 MB at 1440×900 @ DPR 2 (no depth/stencil) |

### Known limitations

- **3D budget headroom is about 9.6 KB.** Three.js's WebGL renderer can't be tree-shaken much. The NEX allocation in §9.3 fits within it; post-processing, GSAP in the stage or further agents need per-chunk sub-budgets or an approved change, not a silent increase.
- Adaptation only steps quality down and never back up automatically. A visit that hits a temporary slowdown (another heavy tab, a thermal dip) keeps the lower quality until the stage remounts (motion Off and on, or a reload). Stepping back up after a sustained recovery is planned.
- Context restoration relies on Three.js re-creating GPU resources on the restored context, plus a full scene remount. Tested with `WEBGL_lose_context`; real driver resets on mobile GPUs are untested.
- The WebGL tests run on whatever GPU the test machine has. On software rendering (SwiftShader) they still pass because the stub drops the performance caveat, but the frame-time figures above apply only to hardware rendering.
- The Vite "chunk larger than 500 kB" advisory (minified size) applies to the stage chunk; the gzip budget above is the enforced gate.
- **Flow-format cache edge case (non-blocking, future work):** the validated format is cached per renderer. If a later flow map (after a tier change or Reduced → Full) can't allocate complete full-size targets in the cached half-float format, the cache skips RGBA8 and that flow map falls back to the analytic pointer falloff. The result still works and is rare (the format already passed validation on that renderer); a future fix should let RGBA8 be tried in that case.

### Remediation after independent review

The visual direction was approved before the review and is unchanged: no shader, palette or tuning value was modified.

1. **Adaptive-quality desynchronisation (fixed).** Root cause: R3F 9.8.2 re-applies the Canvas `dpr` prop on every render (`if (viewport.dpr !== calculateDpr(dpr)) setDpr(dpr)` in its root configuration, and again on display/zoom changes). The field lowered the DPR imperatively with `setDpr`, so any Stage re-render (route change, tab visibility, motion change, context restore) silently restored the tier cap while the stage still reported, and the monitor still assumed, the lower value. Separately, a tier change recreated the geometry with its full draw range while the retained particle share stayed reduced. Reproduced in a real browser before the fix: after a re-render, the canvas drew at DPR 2 while `data-stage-dpr` said 1.5, and 12,000 particles were drawn after stepping down to 3,000. Fix: one source of truth (`performance/quality.ts`, Stage state); the Canvas `dpr` range and the draw range are derived from it on every render; quality only ever decreases within a stage's lifetime; statistics publish the renderer's actual pixel ratio and drawn count, and the monitor restarts whenever either changes.
2. **Flow-target validation (strengthened).** Completeness checks are now backed by the render-and-sample probe described in §9.4, with state restoration and disposal on every path, and the half-float → RGBA8 → analytic order unchanged.
3. **Backing-pixel limit (added)** and the **NEX budget allocation (proposed)**: §9.2 and §9.3.
4. **Documentation corrected:** pointer data retention (PRIVACY-COMPLIANCE §4.4), context-loss tests and runtime Save-Data (§9.4), and step-down-only adaptation (§9.2).
