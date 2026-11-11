# MOYLAN//OS — Architecture

**Status:** v0.10 · 11 November 2026 · Milestone 1 and Milestone 2.1 complete and reviewed; Milestone 2.2 (first live WebGL environment) complete (§18); Milestone 2.3 (NEX avatar on the homepage) implemented, homepage appearance approved, independent-review findings remediated (§19); Milestone 2.4a (plain Three.js stage engine replacing React Three Fiber; ADR-002 amended) reviewed and merged (§20); Milestone 2.4b.0 (NEX motion clean-up) reviewed and merged; Milestone 2.4b.1a (NEX-only Shared AgentCore extraction) implemented and independently reviewed: ready, with non-blocking follow-ups recorded as future-phase gates (§21); ADR-004 and ADR-007 accepted
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
| 3D | **Three.js 0.186** with a small framework-free stage engine (`src/experience/engine/`) **(approved; plain engine since Milestone 2.4a)** | WebGL2 renderer, lazy-loaded in the stage chunk only, imported by named classes so it tree-shakes (a lint rule forbids namespace imports of `three` in `src/experience/`). Pinned to a release older than the Dependabot cooldown (three 0.187 was 9 days old). React Three Fiber 9.8 was used in Milestones 2.2–2.3 and removed in Milestone 2.4a (ADR-002 as amended, §20): about 105 KB gz smaller 3D chunk, identical output. |
| 3D helpers | **None** | drei needs React Three Fiber, which is no longer used (Milestone 2.4a). Frame monitoring and adaptive DPR are implemented in `src/experience/performance/`. |
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
│  │ Milestone 2.4a+: engine-owned canvas, persistent across routes     │  │
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

**Boundary rule (lint-enforced):** outside `src/experience/` and `src/composition/`, ESLint forbids importing `~/experience/*` and `three` (`three/*` included). Only `StageMount` references the 3D layer, through the lazy `Stage.tsx`. Inside `src/experience/` several modules use Three.js (the engine, the ambient field, the flow simulation and flow map, NEX), always through **named imports**: a second ESLint rule there forbids namespace imports and `export *` of `three` (type-only namespace imports are allowed), so the library stays tree-shaken (§9.3). The build fails if any page loads the stage chunk up front (§9.3). This keeps the 3D layer lazily loadable, testable and removable without breaking the site.

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

**Implemented for NEX (Milestone 2.3, `src/experience/nex/`).** The NEX generator (`shape.ts`) returns `positions` (N × 3), `orbits` (N × 1: role × 32 + orbit-frame index) and `seeds` (N × 4: phase, speed, size, intensity). Rings and filaments are *orbit frames*: a small uniform table of rotations (21 for NEX: halo, core, nine rings, ten filaments) updated once per frame on the CPU, so whole rings spin on the GPU with no buffer uploads. Particles are shuffled within each role and interleaved in role-coherent blocks of 32 in proportion, so any prefix is a representative sample (the adaptive-quality draw range thins every layer evenly) while GPU warps run one role's shader branch. A future morph pairs particle *i* of one agent with particle *i* of the next; the arrival animation already blends each particle from a scattered start (derived from its seeds in the shader) to its target with the per-particle stagger and mid-flight swirl described above. The approved form's parameters (`params.ts`) were extracted from a reference model designed with Higgsfield and re-proportioned into a sphere; the model file itself is not shipped or loaded (§19).

### 6.2 Why this approach

- **Genuinely interactive:** every particle is GPU-driven and responds to the cursor, idle animation and morph state every frame. These aren't pre-rendered videos or sprites.
- **Signature transitions:** "NEX morphs into the specialist" is literally true. The same particles physically rearrange.
- **Performant:** one draw call for the core (+ a few for overlays); no per-frame CPU work proportional to `N`.
- **Maintainable:** adding or tuning an agent means writing one pure generator + config + optional overlay.

### 6.3 Particle rendering

- `THREE.Points` with a custom `ShaderMaterial`: soft round sprites, additive blending, depth-write off, size attenuation, an intensity-to-HDR mapping so cores can feed bloom on the high tier.
- **Fake glow on lower tiers:** radial falloff in the fragment shader plus a large, faint duplicate "halo" point layer gives most of the bloom look at a fraction of the cost. **Implemented for NEX (Milestone 2.3):** the duplicate glow layer is drawn on tier 3. It draws the first third of NEX's particles from the same GPU buffers (a representative prefix), keeps only the core, the beads and ring particles lit by an energy pulse (×3.2 size, alpha scaled to the subset) and fades in once the arrival is complete. A real bloom pass is not yet affordable within the 3D budget (§9.3).
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

**Shared interface (Milestone 2.3):** `flow/interaction.ts` makes the substrate consumable by every layer: one mutable `StageInteraction` (mode, flow texture, analytic pointer and velocity) written by its owner, copied into each consumer's uniforms with `syncInteraction()` and sampled with the shared GLSL `sampleFlow()`. The ambient field and NEX both use it (§19).

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
| **1 Low** | Effective motion `reduced` (§10), ≤ 2 GB device memory or ≤ 2 cores | 12k | ~2k | 64² (none when motion is reduced) | 1.0 | none (shader glow) |
| **2 Medium** | Coarse pointer (touch) or ≤ 4 GB device memory | 30k | ~6k | 128² | 1.5 | none |
| **3 High** | Everything else (including browsers that don't expose memory/cores) | 30k (the approved NEX density; tier 3 adds the glow layer and DPR 2) | ~12k | 256² | 2.0 | NEX duplicate glow layer (bloom pass pending a budget decision, §9.3) |

- **Runtime adaptation (implemented in Milestone 2.2, step-down only):** a frame-time monitor (one-second windows) asks for a step after two consecutive windows over 24 ms: first the DPR (−0.5 per step, not below 1), then the share of particles drawn (halved, not below 25%). It never steps back up automatically; stepping up cautiously after a sustained recovery is planned. The adapted values are the stage's single source of truth for quality (`performance/quality.ts`, held as low-frequency React state in `Stage`): the engine's DPR range and the geometry draw range are derived from them on every render, so route, visibility and motion changes, tier changes and context restores keep the adapted quality. It resets only when the stage unmounts (motion Off, Save-Data) and is then re-learned.
- **Backing-pixel limit (implemented in the Milestone 2.2 review):** independently of the DPR cap, the drawing buffer is kept within a per-tier pixel budget (tier 1: 1920×1080, tier 2: 2560×1440, tier 3: 3840×2160 backing pixels). On larger viewports the DPR is lowered to fit (floored to 0.125 steps, minimum 0.5). The minimum DPR takes precedence over the pixel target: on exceptionally large viewports, above four times the tier's pixel budget in CSS pixels (for example beyond 7680×4320 CSS pixels on tier 3), DPR 0.5 still exceeds the target and the buffer is allowed to, bounded at a quarter of the CSS pixel area. A 27-inch 5K display renders at DPR 1.5 rather than 2 (≈ 33 MB instead of ≈ 59 MB of colour buffer), while typical laptops and phones keep their full tier cap. Points are sized by DPR, so the look is unchanged apart from sharpness. Every later full-screen pass (bloom, NEX effects) inherits this bound.
- **Render only when visible:** stop the frame loop when the tab is hidden (`visibilitychange`), when the canvas is scrolled fully out of view, or when the user pauses.
- **No allocations in the frame loop** (layer `update()` methods); reuse vectors; uniforms mutated in place.
- **Draw-call budget:** < 15 on any view.

### 9.3 Budgets

Two separate JavaScript budgets, **enforced on every build** by `scripts/postbuild.mjs` (the build fails if either is exceeded):

| Budget | Limit (gzip) | Measured (Milestone 1) | How it's measured |
|---|---|---|---|
| **Initial application JS**, per prerendered page | ≤ 125 KB | 120.0 KB (home, Milestone 2.4a; 120.8 KB in Milestone 2.3) | Every script the page's HTML references, plus their static-import closure |
| **Lazy 3D stage** | ≤ 250 KB | 143.9 KB (Milestone 2.4a: Three.js + the plain engine, the ambient field, shared flow map and interaction interface, probe, quality control and NEX; 248.7 KB with R3F in Milestone 2.3) | The `Stage-*.js` chunk plus everything reachable from it through static **and nested dynamic** `import()`s, minus chunks already in any page's initial set |
| Stage isolation | Must be 0 | 0 | The build fails if any page's initial set contains the stage chunk |
| Lazy 3D review target (per phase; Milestone 2.4b.1a: ≤ 148 KB) | **reported, not enforced** | 144.9 KB (2.4b.1a; 143.9 KB in 2.4a) | The same 3D figure. `postbuild.mjs` prints the current phase's review target with every build and a warning when the 3D closure exceeds it; the enforced limit stays 250 KB |

**Engine-core regression target (Milestone 2.4a).** Removing React Three Fiber cut the 3D closure from 248.7 to 143.9 KB gz (clean `npm ci` production build). The enforced budgets are unchanged (125 KB initial, 250 KB 3D). The ≈ 150 KB target keeps the engine core honest: anything that pushes the closure past it (a namespace import of `three`, a heavy addon, an accidental dependency) is reported on every build and must be explained in the change that causes it, rather than silently absorbed by the 250 KB cap. Planned features (AgentCore, the specialists, morphing, bloom) will raise the figure deliberately; each is to be measured against this baseline and the target re-based by decision, not by drift.

**Phase review targets (Milestone 2.4b).** Since 2.4b.1a the reported figure is a *review target per phase*: ≤ 148 KB for 2.4b.1a (measured 144.9 KB), then ≤ 152 KB (2.4b.1b), ≤ 160 KB (2.4b.2), about ≤ 6 KB per specialist and ≤ 185 KB for the five-agent system. Exceeding one prints a warning and needs a written justification; it is never an entitlement. Only the two hard limits (125 KB initial, 250 KB lazy 3D) fail the build. Each phase re-bases the target only in its own reviewed change.

**Nested 3D chunks:** if the 3D layer is later split further (e.g. post-processing or a shape-generation worker loaded on demand), those chunks are found by following dynamic imports from the stage chunk and count towards the 3D budget, not the initial one. If the 3D layer grows past 250 KB in total, sub-budgets per lazy chunk (e.g. core stage vs. tier-3 post-processing) will be introduced rather than raising the cap silently. Web Worker files emitted by Vite (`new Worker(new URL(...), { type: "module" })`) aren't reached through `import()`; when the first worker is added, the budget script will be extended to include `*.worker-*.js` assets in the 3D total.

The 125 KB initial budget was revised from 90 KB because the React 19 + React Router framework baseline alone is ≈ 110 KB. That leaves little headroom: new initial-bundle dependencies need justification.

**Headroom and the NEX allocation (historical: the Milestone 2.2 planning allocation, made in that milestone's review before NEX existed; superseded by the Milestone 2.4a figures above).** Both budgets stay as they are; raising either needs explicit approval. The figures in the next two tables are as planned then; the measured Milestone 2.3 result follows them.

| | Budget | Now | Headroom |
|---|---|---|---|
| Initial JS (largest page) | 125 KB | 120.8 KB (Milestone 2.3) | ≈ 4.2 KB |
| Lazy 3D closure | 250 KB | 248.7 KB (Milestone 2.3 after review; 143.9 KB since Milestone 2.4a, ≈ 106 KB headroom) | ≈ 1.3 KB |

The 3D figure is the **whole lazy dependency closure**: the stage chunk plus every chunk reachable from it through static and dynamic imports that no page loads up front. Since Milestone 2.3 that is the single `Stage-*.js` chunk.

**Shared chunks:**
- **Milestone 2.3:** R3F imported React's scheduler and zustand's vanilla store, so the bundler split them, the JSX runtime and its own runtime into small chunks shared with every page's initial set. Those were counted once, as initial JS.
- **Since Milestone 2.4a:** the stage imports neither, so the only chunk it shares with the initial set is the JSX runtime (counted as initial JS). The audit confirms there are no orphan chunks.

**Composition:**
- **Milestone 2.3 (248.7 KB):** the project's own stage code was ≈ 15 KB; the rest was Three.js and R3F. R3F registered the entire Three.js namespace as its element catalogue, so no Three.js class could be tree-shaken.
- **Milestone 2.4a (143.9 KB):** Three.js ≈ 94–99 KB and project code ≈ 8 KB, plus Three.js's GLSL shader-chunk strings. The stage imports named Three.js classes only, and a lint rule forbids namespace imports of `three` in `src/experience/`. Every additional Three.js class now costs its real size, and any new package or Three.js addon (`three/examples/jsm/...`) counts in full.

Milestone 2.2 planning allocation for NEX (then expected in Milestone 3, delivered in Milestone 2.3), within the 9.6 KB headroom of the time:

| Part | Allocation (gzip) | Notes |
|---|---|---|
| AgentCore component and lifecycle (arrival, idle, palette, quality hooks) | ≤ 3.5 KB | Reuses the Stage, flow map, monitor and quality state |
| Shape generation (procedural NEX geometry, deterministic like `generateParticles`) | ≤ 2.5 KB | Code, not model files; binary point clouds would need their own asset budget |
| NEX shaders (GLSL strings) | ≤ 2.0 KB | Shares noise/flow-sampling chunks with the ambient shaders |
| Reserve for fixes | ≈ 1.6 KB | Not to be spent on features |

**Measured (Milestone 2.3 after review):** NEX and its supporting changes cost ≈ 8.3 KB gz in the production closure: ≈ 7.7 KB for the component, generator, parameters, motion, placement and shaders as first integrated, plus ≈ 0.6 KB from the review fixes (the shared interaction interface and the anchor tracker). That is ≈ 0.3 KB over the 8.0 KB feature allocation, taken from the 1.6 KB reserve for fixes; ≈ 1.3 KB of 3D headroom remains. Nothing for NEX went into the initial bundle (+0.1 KB from the homepage markup).

**Lazy sub-chunks are not exempt.** The budget script counts every chunk reachable from the stage chunk, static or dynamic, towards the same 250 KB total, and that is the intended rule: a visitor who reaches the chunk downloads it. Splitting code into a lazily loaded sub-chunk therefore does not create headroom. A real bloom pass was measured separately: `EffectComposer` + `RenderPass` + `UnrealBloomPass` alone are ≈ 4.3 KB gz before any integration code, more than the remaining headroom. Bloom, the four other agents' shapes and the morph controller all need an explicit budget decision (a raised total, or per-chunk budgets with a documented total), made with measurements before they are built.

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

The chosen format is published as `data-stage-flow` (for debugging) and cached per renderer, so the probe runs once per context, never per frame; a later flow map (switching Reduced → Full) reuses the result. **Since Milestone 2.4a** a restored context counts as new: the Stage clears the cached format on `webglcontextrestored` (`forgetValidatedFormat()`), so the rebuilt flow map validates again, once, on the restored context (which may sit on another GPU or driver after a reset), in the same half-float → RGBA8 → analytic order.

**Context creation failure:** renderer creation is wrapped in try/catch. On failure the stage unmounts itself and reports to `StageMount`, which records tier 0 for the session (in memory only, no storage) and leaves the static design. Since Milestone 2.4a, construction is transactional (§20): whatever was acquired before the failure (renderer, context, listeners, observers, the canvas) is released before the report.

**Fatal setup and frame errors (Milestone 2.4a, §20):** a layer that fails to construct or to apply its props (including when rebuilding after a context restore), and any throw from a frame's simulation, update or rendering, take the same path: the frame loop stops at once (no further frames are scheduled), the engine and its layers are disposed (GPU resources, listeners and the canvas released), and `StageMount` is told exactly once, which keeps the static design for the rest of the visit. Errors are never swallowed while the loop keeps running.

**Context loss and recovery:**

- Listen for `webglcontextlost` on the canvas and call `preventDefault()` so the browser may restore it. Immediately stop the frame loop and fade the canvas out so the static backdrop shows (no frozen frame).
- On `webglcontextrestored`, rebuild GPU resources (geometries, materials, render targets) from retained CPU-side data (shape buffers are pure and deterministic, so they can be regenerated), then fade back in.
- If the context isn't restored within ~3 s, or is lost more than twice in a session, give up: drop to tier 0 for the session.
- **Tests (implemented in Milestone 2.2, `webgl.spec.ts`):** Playwright forces loss and restoration with `WEBGL_lose_context` (`loseContext()` / `restoreContext()`) on the real renderer and asserts the fade to static, the recovery, giving up after the third loss and giving up when no restore arrives within 3 s, with no retry for the rest of the visit. `quality.spec.ts` also checks that a restore keeps the adapted quality.

**Motion and data preferences:**

- Effective motion `reduced` (from the OS preference under System, or an explicit Reduced choice): tier ≤ 1, `pointerEffects: false` (fully assembled forms, slow idle, no flow map and no cursor displacement, no arrival or morph animation; cross-fades instead). **Implemented in Milestone 2.1:** the OS preference is followed live through a `matchMedia` change listener, and the stage plan updates on every change (tested in `motion.spec.ts`).
- Save-Data: tier 0. The 3D chunk is never requested, even with an explicit Full choice (implemented and tested). **Runtime changes (implemented in Milestone 2.2):** where the browser fires the Network Information `change` event (Chromium-based browsers), `StageMount` follows it with one feature-detected listener, removed on cleanup: Save-Data on → tier 0, which unmounts the stage and releases its GPU resources; off → the stage loads again (the chunk is already cached). Where no change event exists (Safari, Firefox), Save-Data is sampled at initial detection and respected for the rest of the visit. Both directions are tested at runtime in `webgl.spec.ts`.
- Effective motion `off` (visible control, implemented in Milestone 2.1): tier 0. `StageMount` unmounts a loaded stage and downloads nothing if it hasn't loaded yet. From Milestone 2.2 the render loop stops and the canvas fades to the static design before unmounting. Interaction with the OS preference is defined in §10 (motion preference policy).
- **Stage failure** (load, setup or render error, or a fatal frame error) disables the stage for the rest of the session, held in memory in `StageMount`, so turning motion Off and on again never retries a failed stage.

**Separation from essential content:** enforced by the composition boundary (§5), the lazy import, the build's stage-isolation check (§9.3) and Playwright tests confirming the stage chunk isn't requested with Save-Data or without WebGL2.

**Content Security Policy stays restrictive.** Three.js needs neither `unsafe-eval` nor `unsafe-inline`: GLSL is compiled by the GPU driver, not JavaScript `eval`. Planned, reviewed additions only:
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
| 002 | Single persistent WebGL canvas, owned by one framework-free Three.js engine, behind a semantic DOM layer; the DOM never imports the 3D layer | **Accepted; amended in Milestone 2.4a** (9 Nov 2026: was "single persistent R3F canvas"; details below) |
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

### ADR-002: Single persistent canvas, plain Three.js engine (amended in Milestone 2.4a)

**Unchanged:** exactly one persistent WebGL canvas for the whole visit, behind the semantic DOM; decorative only (`aria-hidden`, `pointer-events: none`); lazy-loaded; only `src/composition/StageMount.tsx` references the 3D layer, and only `src/experience/` may import Three.js (lint-enforced).

**Amended:** the canvas is no longer an R3F `<Canvas>`. It is created and owned by a small framework-free engine (`src/experience/engine/Engine.ts`): one `WebGLRenderer`, one scene, one perspective camera, one requestAnimationFrame loop. `Stage.tsx` is a thin React wrapper that owns the policy (lifecycle, quality, motion, context-loss limits, failure fallback) and forwards discrete props to plain layer classes (`FlowSimulation`, `AmbientField`, `NexAvatar`; since Milestone 2.4b.1a, `FlowSimulation`, `TransitionClock`, `AmbientField` and `AgentCore`, which hosts NEX, §21).

**Why:**

- **Size.** R3F registers the entire Three.js namespace as its element catalogue, which defeats tree-shaking, and ships its own reconciler. Removing it cut the 3D closure from 248.7 to 143.9 KB gz (−104.8 KB, −42 %) with byte-identical rendering. That left about 1.3 KB of headroom before and about 106 KB after, inside the same 250 KB budget.
- **Fit.** The stage never used R3F's strengths (declarative scene graphs, raycast events, drei). ADR-007 already keeps per-frame state out of React, and the planned AgentCore (data textures, target slots, one shader program) is imperative by nature.
- **Fewer moving parts.** One runtime dependency and its transitive packages are gone. React upgrades no longer wait for R3F compatibility, and R3F's deprecated `THREE.Clock` warning disappears.

**Costs accepted:** the project owns the loop, sizing, pixel-ratio and disposal mechanics and their React-lifecycle edge cases, such as StrictMode effect replay, which the spike hit and fixed. Layers are imperative classes with explicit change-only `setProps()`. These are covered by unit tests with fault injection and by the end-to-end suite (§20).

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
  - **Continuous visual state** (morph progress, colours, flow field, camera offsets) lives in GPU uniforms and textures, written in the stage engine's layer `update()` methods (`useFrame` under R3F until Milestone 2.4a) or by GSAP tweening plain objects/uniforms.
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
| **2 · M2.3 NEX avatar** | The approved NEX form (V3) in the live stage on the homepage: procedural shape, arrival, idle, cursor response, fallbacks, tests (§19). Brings forward the NEX part of M3 | ✅ Implemented; appearance approved; review findings remediated, awaiting verification |
| **2 · M2.4a Stage engine** | Replace React Three Fiber with a framework-free Three.js engine; fatal-error and transactional-construction policies; explicit frame phases (§20) | ✅ Implemented, reviewed and merged |
| **2 · M2.4b Shared AgentCore** (formerly "M3 AgentCore") | Generalise the NEX layer into the shared AgentCore (palette, shape swap, morph timeline), in phases: 2.4b.0 NEX motion clean-up; 2.4b.1a NEX-only AgentCore extraction (§21); 2.4b.1b orbit-texture transport behind a comparison switch; 2.4b.2 morph proof of concept with a test-only destination | 🔄 In progress: 2.4b.0 merged; 2.4b.1a implemented and independently reviewed; 2.4b.1b next, after approval |
| **2 · M4 Prototype polish** | Pathway colour preview, fallbacks, performance tuning, Lighthouse | After M2.4b review |
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

Three.js (with R3F until Milestone 2.4a), the GPU particle system, the flow map, GSAP motion, context-loss handling and the runtime frame-time monitor (Milestone 2.2+). Persisting the motion choice across visits was considered and not adopted (PRIVACY-COMPLIANCE §4.3).

---

## 18. Milestone 2.2: first living WebGL environment (implemented)

**Goal:** the first real-time GPU particle environment, built on the M2.1 motion contract, as the foundation for NEX and the specialist agents.

### Delivered

- **Stage** (`src/experience/Stage.tsx`): one persistent R3F canvas inside the existing lazy boundary (since Milestone 2.4a the canvas is owned by a plain Three.js engine, §20). WebGL2 with `failIfMajorPerformanceCaveat`, no depth or stencil buffer, no antialiasing, transparent, events sourced from the `pointer-events: none` stage layer so the canvas never intercepts input. The canvas fades in only after its first frame. `data-stage-state` is `starting | running | static | paused | lost`.
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

- **3D budget headroom is about 9.6 KB** (at the time; ≈ 1.3 KB after Milestone 2.3, §19). Three.js's WebGL renderer can't be tree-shaken much. The NEX allocation in §9.3 fits within it; post-processing, GSAP in the stage or further agents need per-chunk sub-budgets or an approved change, not a silent increase.
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

---

## 19. Milestone 2.3: NEX on the homepage (implemented, appearance approved)

**Goal:** the approved NEX form ("V3 · Spherical intelligence", chosen from an isolated local prototype) in the real homepage, inside the persistent stage, without new dependencies or budget changes.

### Design source

A reference model was designed with Higgsfield and inspected locally. Its *composition* was kept, not the model: nine orbital rings (band radii, emissive levels, tilts, spin speeds and directions), orbiting beads and hubs, the core size, breathing (5.5 % every ≈ 7.5 s) and sway (3° over ≈ 15 s). For V3 these were re-proportioned into a contained sphere: the outer ring 18 % smaller, the inner rings re-spaced towards one shell, the ring tilts relaxed towards an even spread, filaments moved out to the shell and the halo tightened. The resulting numbers are `src/experience/nex/params.ts` (≈ 2 KB of source); production never loads a mesh.

**Local-only material (never committed or published):** the reference model lives in `docs/references/nex/` and the visual prototype used to choose V3 (with its model-inspection tooling) in `prototypes/nex/`. Both directories are listed in `.gitignore`. The prototype is a development aid only: it is not part of the application, its build, its type-check or its tests, and nothing in `src/` imports it. The build output contains no model file, no glTF loader and none of the reference model's editor metadata (checked during the Milestone 2.3 review).

### Delivered

- **`src/experience/nex/`:** `params.ts` (approved parameters), `shape.ts` (pure seeded generator, §6.1), `motion.ts` (orbit frames, breathing, sway), `anchor.ts` (event-driven anchor measurement), `placement.ts` (pure anchor maths), `shaders.ts` (GLSL; the approved look is built in as constants), `NexAvatar.tsx` (the R3F layer; since Milestone 2.4a `NexAvatar.ts`, a plain engine layer, §20; since Milestone 2.4b.1a NEX's renderer hosted by `AgentCore`, §21).
- **One stage, one renderer:** NEX is a second layer in the existing canvas next to the ambient field, sharing the frame loop, the adapted quality state (DPR and particle share) and the context-loss remount. One perspective camera serves the 3D agents; the ambient field still draws in screen space.
- **One cursor substrate (ADR-004):** `flow/interaction.ts` is the shared interface. In Milestone 2.3 the ambient field owned it. Since Milestone 2.4a, `FlowSimulation` (the engine's simulate phase, §20) owns and writes it, and the ambient field and NEX only consume it. The owner attaches the only `PointerTracker`, runs the only `FlowField` simulation and writes the result (`mode`: half-float, RGBA8, analytic or none; the flow texture; the analytic pointer and velocity) into one mutable `StageInteraction` object, which the Stage allocates and passes to every layer. Every consumer, the ambient field included, copies it into its uniforms with `syncInteraction()` and samples it in GLSL with the shared `sampleFlow()` (`FLOW_GLSL`), so flow-map decoding and the analytic fallback exist once. NEX samples it at each particle's screen position: the cursor's wake carries particles along (filaments and dust most, the core least) and makes them glow, and they settle as the flow dissipates. Under reduced or off motion the mode is `none` and every pointer uniform is zeroed. No extra listener, simulation or GPU pass.
- **Layers:** particles (core, rings, beads, filaments, halo; one draw), ring hairlines (one `LineSegments` draw for all rings), a fresnel energy shell, a volumetric core-glow billboard, an atmosphere billboard and, on tier 3, the duplicate glow layer (§6.3). Additive, premultiplied, no depth buffer.
- **Composition:** the homepage marks NEX's place with a layout-only element (`data-stage-anchor="nex"`, the hero figure). NEX is centred on it and its ring cage fills 88 % of the box's shorter side, and turned so its three-quarter view faces the camera. The box is measured only after something can have moved or resized it (`anchor.ts`: scroll, window resize, a `ResizeObserver` on the anchor and the page body for responsive reflow and enlarged text, web fonts loading, or a new anchor after navigation), and the placement is recomputed only when the box, viewport or field of view changed: no layout read or allocation on ordinary frames. Desktop: beside the hero text. Narrow screens: above the heading (`order-first`; the figure isn't focusable, so focus order is unchanged). Routes without the anchor fade NEX out and stop drawing it; returning replays the arrival.
- **Poster:** the static emblem stays in the DOM with NEX's text equivalent and is cross-faded out with CSS only while the stage reports NEX drawn (`data-nex-state="visible"` on a running, static or paused stage). Lost context, Off, Save-Data, no WebGL2 or a failed stage leave it visible.
- **Motion:** Full: arrival from drifting particles (2.4 s), living idle at the approved 0.7× pace, slow travelling pulses (no flashing: any one point brightens at most every ≈ 4 s), a cursor response through the shared flow map that settles over 1–2 s. Reduced: the fully formed NEX as one still frame on demand, no pointer, no arrival (also when motion is reduced during an arrival). Off: no canvas.
- **ADR-007:** NEX's discrete inputs (tier, share, motion, route) cross from React only when they change: as `<NexAvatar>` props in Milestone 2.3; since Milestone 2.4a as `setProps()` calls from the Stage's props effect to a plain engine layer (React never renders NEX); since Milestone 2.4b.1a through `AgentCore`, which forwards them to NEX's renderer. Time, placement, arrival, fade and pointer live in mutable fields and shared uniform objects, never in React state.
- **Tests:** unit (`nex/nex.test.ts`: generator determinism, layout, composition, spherical bounds, even thinning, warp coherence; placement; orbit motion; `nex/anchor.test.ts`: measurement only after layout events, observer and listener cleanup; `flow/interaction.test.ts`: the shared interface on every flow path; `shaders.test.ts`: no undefined `smoothstep`), Stage wiring (`Stage.test.tsx`), home anchor and poster (`home.test.tsx`), and Playwright with a real renderer (`nex.spec.ts`: drawn at the anchor with the poster hidden, an exact draw-call count, one pointer listener and the shared flow on the half-float, RGBA8 and analytic paths, leaving and returning with its page, Off and Full, Reduced during the arrival, context loss and restore, scrolling, no anchor measurement while idle but re-measurement after scrolling and enlarged text, reduced motion, no WebGL2).

### Measurements (Chromium on Apple silicon, production build)

| Item | Value |
|---|---|
| Initial JS (largest page) | 120.8 KB gz (budget 125 KB) |
| Lazy 3D closure | 248.7 KB gz (budget 250 KB); NEX and its review fixes ≈ 8.3 KB of it |
| NEX particles | 30,000 on tiers 2 and 3 (the density of the approved prototype; tier 3 adds the glow layer over 10,000 of them), 12,000 on tier 1 / reduced |
| Draw calls | Exactly 8 per frame for the whole stage on tier 3 (ambient particles, one flow pass, six NEX layers) and 7 on tier 2, asserted by counting WebGL draw calls per rendered frame |
| Frame time | 8.3 ms (vsync-limited 120 Hz) at DPR 2, 1148 × 934, tier 3; worst frame over 3 s 9.4 ms |
| Software rendering (CI, SwiftShader) | 61 fps for one page; ≈ 25 frames per second per page with six concurrent browsers (50 on pages without NEX) |
| GPU memory (estimate) | NEX attributes ≈ 0.96 MB at 30k (8 floats per particle) plus small overlay buffers |

### Known limitations and risks

- **No real bloom yet** (budget): tier 3 uses the duplicate glow layer, which approximates the prototype's bloom around the core, beads and pulses but is softer and smaller. A bloom sub-chunk needs a budget decision (§9.3).
- **3D headroom is ≈ 1.3 KB.** Lazy sub-chunks count towards the same total (§9.3), so the other four agents' shapes and the morph controller need an explicit budget decision before they are built.
- **Ring hairlines are aliased** (the canvas has no antialiasing, as in Milestone 2.2); at DPR ≥ 1.5 they read as fine lines, at DPR 1 they are slightly stepped.
- **Licence:** the parameters derive from a Higgsfield-generated model; its commercial terms must be confirmed before public launch (PRIVACY-COMPLIANCE §11).
- **Uniform budget:** 21 orbit frames use ≈ 84 of the 256 vertex uniform vectors WebGL2 guarantees; a morph between two agents with separate frame tables would roughly double that.
- **Density, not the earlier estimate:** NEX uses 30k particles on tier 3 rather than the 60–80k first estimated in §9.2: the approved look was designed at 30k, and with additive light a denser form is brighter, not just finer. 60k was tried and read visibly denser than the approved prototype; it also halved the frame rate of the software-rendered CI browsers under parallel load.
- **Software rendering:** real visitors on software rendering get the static design (`failIfMajorPerformanceCaveat`), but the end-to-end suite runs the real renderer on SwiftShader. NEX's particle draw is the dominant cost there (≈ 25 frames per second per browser under full parallel load). The render-loop checks therefore test lifecycle, not speed: a running loop must deliver 20 more frames within 10 s, a paused one at most 3 in a second.
- **Real mobile GPUs are unmeasured:** tier 2 was checked in Chromium's mobile emulation on a desktop GPU only. The atmosphere and core-glow billboards cover a large share of a phone screen and are not reduced by the particle-share step-down; on-device profiling is planned before launch.

### Remediation after independent review

The approved V3 look, composition and motion are unchanged.

1. **NEX used a private pointer model (fixed).** Root cause: NEX shared the ambient field's `PointerTracker` sample but computed its own analytic attraction, so the flow map was not the single cursor substrate ADR-004 requires. Fix: the shared `StageInteraction` interface and `FLOW_GLSL` (above); NEX samples the same flow map, or the same analytic fallback, at each particle's screen position, and its private pointer uniforms and the CPU ray maths were removed. Tests: `flow/interaction.test.ts` and the flow-path tests in `nex.spec.ts`.
2. **Undefined `smoothstep` (fixed).** Root cause: `smoothstep(edge0, edge1, x)` with `edge0 > edge1` was used for inverse ramps (the ambient field's top and bottom vignette and NEX's core occlusion); GLSL leaves the result undefined, although common drivers return the expected mirrored ramp. Fix: `1.0 - smoothstep(low, high, x)`, which is the intended value exactly. Test: `shaders.test.ts` rejects reversed or equal literal edges anywhere in `src/experience/` (it fails on the original ambient shader).
3. **Per-frame layout reads and allocations (fixed).** Root cause: `NexAvatar` called `getBoundingClientRect()` and allocated a placement object and a publishing closure on every frame. Fix: `anchor.ts` (event-driven measurement with cleanup), a preallocated placement recomputed only on change, and a module-level attribute publisher. Tests: `nex/anchor.test.ts` and the anchor-measurement test in `nex.spec.ts`.
4. **Reduced motion during the arrival (fixed, found while reviewing).** Switching to Reduced during the 2.4 s arrival left the still frame half-assembled, because the arrival clock only advanced in Full motion. NEX is now always fully formed without full motion (`nex.spec.ts`).
5. **Repository hygiene:** `prototypes/` added to `.gitignore` (local-only policy above).
6. **Tests made deterministic:** exact draw calls per frame instead of "< 15", and lifecycle-based render-loop checks instead of a fixed frame rate under load (`webgl.spec.ts`).

### Future cleanup (non-blocking)

Recorded in the final Milestone 2.3 review; not implemented in this milestone.

- **`NexMotion.update()` allocates a closure per frame (scheduled for Milestone 2.4b):** the `cycle` helper is created on every call. Hoist it to a module-level function (or inline it) so the render loop allocates nothing.
- **Anchor font-load coverage:** `AnchorTracker` re-measures on the `FontFaceSet` `loadingdone` event, but no test dispatches that event directly. Add a unit test with a stubbed `document.fonts` that asserts a re-measurement and that `detach()` removes the listener.

---

## 20. Milestone 2.4a: plain Three.js stage engine (implemented, reviewed and merged)

**Goal:** replace React Three Fiber with a small framework-free Three.js engine, with no change to the approved NEX V3 appearance, the ambient field, the shared flow, the motion policy, the fallbacks, security, privacy or accessibility. A feasibility spike measured the saving and pixel parity first; an independent review confirmed it and asked for two fixes (fatal frame errors, partial-initialisation leaks), both part of this milestone. ADR-002 is amended accordingly (§14).

### Responsibilities

| Part | Owns | Does not own |
|---|---|---|
| **`engine/Engine.ts`** | The canvas (created per engine, appended to the stage element, removed on dispose; never reused), the `WebGLRenderer` and its context, the camera and scene, the size and pixel-ratio observers, the canvas context-event listeners, the frame loop and the registered layers | Policy: lifecycle state, quality, motion, context-loss limits, what to do on failure |
| **`Stage.tsx`** (React) | Policy and wiring: creates the engine and layers in layout effects, forwards discrete props after each commit, holds lifecycle and adapted-quality state, applies the context-loss limits, runs the single `fail()` path | Anything per frame (ADR-007) |
| **Layers** (`FlowSimulation`, `AmbientField`, `NexAvatar`; since 2.4b.1a `AgentCore` hosts NEX and `TransitionClock` joins the simulate phase, §21) | Their own GPU resources, listeners and published stage attributes; `setProps()` applies only what changed and returns whether anything did; `dispose()` is idempotent | Scheduling, invalidation, other layers |
| **`engine/resources.ts`** | Transactional ownership: every acquisition registers its release as it happens; release runs newest-first, once, and every step runs even if one throws | — |

### Frame scheduling

- **Loop modes:** `always` (full motion), `demand` (reduced motion: one frame per invalidation, coalesced; an invalidation during a frame requests exactly one more) and `never` (hidden tab, lost context). The frame delta is in seconds from a clock restarted on every mode change, so a pause is never one huge step.
- **Explicit phases**, in this order every frame, whatever order the layers were added in:
  1. `simulate`: shared simulations other layers read. Today that is `FlowSimulation`, the only pointer listener and the only flow-map pass (ADR-004), split out of the ambient field in this milestone.
  2. `update`: environments and agents write their uniforms (the ambient field, NEX; since 2.4b.1a, `AgentCore` hosting NEX, after the `TransitionClock` joined the `simulate` phase, §21).
  3. Render: the scene is drawn. Post-processing, when approved, will replace this step rather than add a phase.
  Consumers therefore always read the interaction written in the same frame, without depending on registration order. The first-frame callback fires after the first successful render.

### Invalidation

`engine.invalidate()` is the single on-demand path. The engine invalidates itself on size, pixel-ratio, loop-mode and layer changes. The Stage invalidates once per commit in which any layer's `setProps()` reported a change; layers never invalidate on their own. Event sources (the NEX anchor tracker after scroll, resize, fonts or navigation) call the same function. Pixel-ratio changes from another display or browser zoom are followed with a `(resolution: Ndppx)` media query that is released and re-created after each change, and removed on dispose.

### Disposal and transactional construction

- **Engine construction** acquires the canvas, then the **WebGL2 context itself** (`canvas.getContext("webgl2", …)` with exactly the attributes Three.js would request, registered for an explicit release through `WEBGL_lose_context` before anything else can fail; where a browser does not expose that extension, the release step does nothing and reclaiming the context is left to the browser, as for any unreferenced context), then the renderer (constructed with that `context`), renderer configuration, camera, context listeners, resize listener, `ResizeObserver`, DPR watcher and first measurement, each registered for release as it happens. A failure at any step releases everything before it and removes the canvas before the error propagates.
- **Layer construction** works the same way: materials, geometries, scene entries, the anchor tracker and published attributes. `createLayers()` adds the layers to the engine only once all three exist, and disposes the ones already created if a later one fails.
- **Prop application** is transactional per resource: a new geometry replaces the old one only once it is complete; the flow map and pointer listener are released if either fails to start (`PointerTracker.attach()` now marks itself attached first, so a part-way failure is fully undone; `FlowField.create()` releases its render targets if construction fails).
- **`Engine.dispose()`** stops the loop, disposes the layers, then releases everything else newest-first: watchers, observers, listeners (canvas listeners before the context is released, so disposal never reports a context loss), renderer and context (`dispose()` + `forceContextLoss()`, which also relies on `WEBGL_lose_context`; without it the browser reclaims the context once it is unreferenced), and finally the canvas. It is idempotent and safe from inside a frame.
- **Context loss releases the layers at once** (cross-browser fix). WebGL calls are silent no-ops on a lost context, whereas deleting the old layers' GPU objects after a restore would target the new context: Chromium logs `INVALID_OPERATION … object does not belong to this context` as warnings, and WebKit logs them as console **errors**. The layers are disposed in the `webglcontextlost` handler, the loop stops, and fresh layers are built on restore. Milestone 2.3 (R3F) and the first version of this engine disposed them after the restore. Tested by `Stage.test.tsx` and by `tests/e2e/engine.spec.ts` (no foreign-context deletes after a real restore).

### Error recovery

| Failure | Effect |
|---|---|
| Renderer or engine construction throws (including inside Three.js after the context exists) | Engine rolls back: the acquired context is explicitly lost (`WEBGL_lose_context`), listeners removed, canvas removed; the original error reaches `fail()`; static design for the visit, no retry |
| A layer constructor throws (first mount or rebuild after a context restore) | Already-created layers disposed; `fail()` |
| A layer's `setProps()` throws (first or any later commit) | `fail()` disposes the engine, which disposes every layer |
| A frame's simulate, update or render step (or the first-frame callback) throws | The engine stops scheduling at once, ignores every later request and reports once; `fail()` |
| Context lost | Fade out, release the layers at once, wait up to 3 s for a restore (new layers then), at most two losses per visit |

`fail()` is idempotent: it releases the engine (layers, GPU resources, listeners, canvas) and calls `onUnavailable` exactly once. `StageMount` then keeps tier 0 for the session. Nothing retries, and errors are never swallowed while frames continue.

### Tests

- **Unit, with fault injection:** `engine/Engine.test.ts` covers:
  - the loop modes, the phase order and the clock;
  - the fatal policy at the simulate, update, render and first-frame steps (no further frames, one report, no restart);
  - rollback at the renderer-creation, renderer-configuration, observer-setup and first-measurement steps (canvas removed, listeners balanced, renderer released);
  - DPR media-query replacement and cleanup;
  - idempotent disposal and repeated create/dispose cycles.

  The other unit suites:
  - `engine/resources.test.ts`;
  - `flow/FlowSimulation.test.ts` (one listener, the analytic fallback, release on failure);
  - `ambient/AmbientField.test.ts` and `nex/NexAvatar.test.ts` (rollback with real Three.js objects, counted `dispose()` calls, change reporting);
  - `Stage.test.tsx` (every injection point: engine, each layer constructor, each layer's initial and later `setProps`, reconstruction after a restore, fatal frames reported once, StrictMode replay). Mutation-checked: re-introducing the spike's reschedule-after-error behaviour, or skipping the teardown in `fail()`, fails 14 of these tests.
- **End to end, real renderer:** `tests/e2e/engine.spec.ts` injects faults into the stage's WebGL context:
  - a draw call that throws mid-visit;
  - a renderer constructor that fails part-way;
  - a rebuild after a context restore that fails.

  In each case it asserts the stage and its canvas are gone, the emblem is visible, no further draws occur and motion Off → Full does not retry. A fourth test asserts that a real context restore produces no `does not belong to this context` messages, at warning or error level. All earlier Playwright specs pass unchanged. Further real-browser tests (final review):
  - the stage's actual WebGL context is lost after a renderer constructor failure and after a fatal frame;
  - two loss/restore cycles keep one canvas and the exact draw calls per frame (no duplicated loop or layers);
  - the context keeps the approved attributes;
  - a restored context re-validates its flow format, keeping RGBA8 or analytic.

### Measurements (production build after a clean `npm ci`; headless Chromium on Apple silicon)

| Item | Milestone 2.3 (R3F) | Milestone 2.4a |
|---|---|---|
| Lazy 3D closure (postbuild and an independent audit agree) | 248.7 KB gz | **143.9 KB gz** (Three.js ≈ 94–99, project code ≈ 8, of which the engine ≈ 1.1) |
| Initial JS, largest page | 120.8 KB gz | 120.0 KB gz |
| Draw calls per frame | 8 (tier 3) / 7 (tier 2) | 8 / 7 (analytic flow: 7 on tier 3, no flow pass) |
| Stage chunk received → first frame (Apple M2 Pro, Metal; median of 6 interleaved loads) | 442 ms | 379 ms |
| JS heap after GC | 6.08 MB | 5.03 MB |
| Main-thread cost per frame (median, Metal) | 0.2–0.6 ms across runs | 0.2–0.6 ms across runs (no measurable difference; frame interval 16.7 ms in both) |

**Visual parity.** Both builds ran with an injected deterministic clock (`requestAnimationFrame` and `performance.now` replaced, 16 ms steps; 40 ms steps for the slow-frame case). Every `uTime` upload was recorded and the sequences were identical in every scenario. Full-page screenshots on SwiftShader were **pixel-identical** to the Milestone 2.3 build in all ten scenarios: desktop tier 3 and Pixel 7 tier 2 at 8 s of full motion, mid-arrival, reduced motion (both), pointer flow on the half-float, RGBA8 and analytic paths, after a context restore, and after an adaptive-quality step-down (DPR 2 → 1.5). On the hardware GPU (Metal) the migration matched a baseline capture byte for byte in all four scenarios run. There, the baseline's own run-to-run variation is in DOM text compositing, not the canvas.

**Defect fixed in passing:** after a context restore, Milestone 2.3 lost `data-nex-particles`: the old React layer's unmount cleanup ran after the new layer had set it. The engine disposes the old layers before the new ones apply their props.

### Known limitations

- **Browsers tested:** Chromium (the CI suite), and Playwright WebKit 27.2 (Desktop Safari and iPhone 14 profiles, served over HTTPS so the production CSP applies unchanged). In WebKit all applicable e2e specs pass. The only failures are tests that need Chromium's DevTools protocol (text-size emulation) and Tab-focus tests that follow WebKit's macOS keyboard convention; both fail identically on the Milestone 2.3 build. **Not tested:** Firefox (Playwright's Firefox 159 build does not start on this macOS version: "Could not find profile folder"), the installed Safari.app (automation needs a system setting) and physical Android and iOS devices. These remain required before deployment, with the existing real-device profiling gate.
- **Fast Refresh:** `Stage.tsx` exports constants and `createLayers`, so Vite re-imports `StageMount` instead of fast-refreshing it. HMR still yields exactly one working canvas (verified).

## 21. Milestone 2.4b.1a: NEX-only Shared AgentCore (implemented and independently reviewed)

**Goal:** establish the Shared AgentCore ownership structure (ADR-014, still **proposed**) while NEX keeps rendering through its exact Milestone 2.3 implementation. This is a mechanical extraction: no GLSL, vertex attribute, uniform transport, geometry, seed, particle order, scene order, material state, colour value, draw call, motion, placement or accessibility behaviour changes. No universal shader, orbit texture, second slot or morphing (those are 2.4b.1b and 2.4b.2), and no specialist.

### Ownership

| Part | Owns | Phase |
|---|---|---|
| **`agents/types.ts`, `agents/definitions.ts`, `agents/nex.ts`** | The WebGL side of each agent as an `AgentRenderDefinition` (named so it is never confused with the registry's `AgentDefinition`): id, generator version and seed, a **synchronous `generate()`** (resumable jobs are deferred to M2.5), supported idle orbit transports (NEX: `uniforms`, 112 vertex-uniform vectors), its WebGL-only highlight colour and a factory for its renderer. NEX is the only definition | — |
| **`agents/palette.ts`** | Agent palettes from `src/agents/registry.ts` (base = secondary, accent = primary) plus the WebGL-only highlight (`NEX_HOT`). `ambient/config.ts`'s `nexPalette` is derived from it, so no second copy of NEX's colours remains | — |
| **`transition/StageTransition.ts`** | The Stage-lifetime, preallocated transition frame (ADR-007, like `StageInteraction`): state (`idle` only in 1a), source and target agent, the drawn agent's colour values (shared uniform values) and a generation counter | — |
| **`transition/TransitionClock.ts`** | The single writer of `StageTransition`, in the `simulate` phase after the flow simulation. In 1a it records the route's agent; an agent without a WebGL definition leaves NEX as the drawn agent (NEX still leaves with its page anchor, as before). Rebuilt with the layers, it resets the frame to idle | simulate |
| **`core/AgentCore.ts`** | The stage's one agent layer: resolves the drawn agent's definition, creates and owns its renderer ("view") transactionally, lends it the shared colours, the shape cache and the interaction, forwards discrete props and publishes `data-agent-state` (an alias of `data-nex-state`) | update |
| **`core/shapeCache.ts`** | Stage-lifetime CPU shapes keyed by (agent, N, seed, definition version), one N per agent, at most 3 (LRU). It survives context loss, so a restore rebuilds GPU buffers from the same arrays without generating again. The arrays are referenced directly by the GPU attributes, so a cached shape costs no extra memory while drawn | — |
| **`core/slots.ts`** | Shape slot A: one shape as a Three.js-managed geometry in NEX's layout (`position`, `aOrbit`, `aSeed`) | — |
| **`nex/NexAvatar.ts`** | Unchanged scene graph, materials, shaders, uniforms, motion, arrival, anchor tracking and placement. It now receives its colour values and its shape from AgentCore instead of creating them, and exposes its published state | (view of AgentCore) |

Engine order every frame: `simulate` (FlowSimulation, then TransitionClock) → `update` (AmbientField, then AgentCore hosting NEX) → render. The Stage holds the transition frame and shape cache with `useState`, like the interaction. Layers are created, added and disposed transactionally as before (`createLayers`, `disposeLayers`).

**Deliberate limits of 1a (as specified):** NEX's arrival stays inside its renderer, and the `arriving` state is not projected into `StageTransition` yet. The arrival's progress depends on the on-screen placement that 1a leaves in AgentCore; both move to the transition clock in 2.4b.2. The NEX modules stay in `src/experience/nex/` instead of moving under `agents/nex/`, which keeps the diff and history minimal; the move is optional, pure churn.

### Verification (against merged `8920b54`)

- **Pixel parity (deterministic clock, ten scenarios):** 0 differing pixels in every scenario in Chromium (SwiftShader) and in WebKit, with identical `uTime` upload sequences, stage state attributes, deterministic captures and draw counts (8 desktop, 7 mobile and analytic flow).
- **Uniform identity:** a unit test drives the AgentCore-hosted NEX and a NEX built the 8920b54 way (literal colour values, direct generation) through the same props and frames (including a clamped long frame, a tier change, reduced motion and navigation) and compares every uniform, shader string, blend and depth state, draw range, attribute list and root transform exactly. Mutation checks: a one-bit colour change or a 1e-7 timing change fails it.
- **Lifecycle (Chromium and WebKit):** identical live GPU objects (buffers, textures, framebuffers, programs, vertex arrays) in Full and Reduced Motion, after five motion cycles, on a route without NEX, after a context restore (objects created and live), identical frame-loop behaviour when hidden or lost, and identical listener release when Motion is turned Off.
- **E2E:** Chromium 244 passed, 4 skipped. WebKit (HTTPS): the same 40 harness-only failures as on 8920b54 (Tab-focus convention, Chromium-only CDP sessions, text-size emulation), none new.
- **Idle frames:** no regression. Interleaved loads on Metal (M2 Pro) and SwiftShader show the same frame interval (16.7 ms), time to first frame and heap, and a per-frame main-thread cost within run-to-run noise (median 0.3 vs 0.6 ms on Metal).
- **Bytes:** lazy 3D 144.9 KB gz (+1.05 KB; the 2.4b.1a review target is ≤ 148 KB). Initial JS 120.0 KB gz (the root chunk's lazy-import preload list gained the already-loaded registry chunk: +5 B gz).

**Independent review:** ready, with non-blocking follow-ups. There were no Critical, High or commit-blocking Medium findings. The reviewer independently re-ran the 295 unit tests, TypeScript, ESLint, formatting and the bundle measurements, and inspected the Chromium and WebKit parity and lifecycle evidence.

### Future-phase gates (recorded, not part of 2.4b.1a)

1. **Cached shapes are immutable (before 2.4b.2).** Shapes in the Stage-lifetime `ShapeCache` are shared with the GPU attributes and must never be written. Mutable GPU morph slots (slot B, and the copy into slot A after a morph) must own their own arrays or copy from the cache, never write through it. A regression test that fails if a morph slot mutates a cached shape is required before 2.4b.2 is implemented.
2. **Active-view replacement and morph ownership (before a second production agent).** `AgentCore` currently creates one view for the drawn agent at construction. Before a second production `AgentRenderDefinition` is registered, it needs explicit ownership of active-view replacement and morphs: which views exist, when one is created, swapped and disposed, and who owns slots and pair materials during a transition.
3. **Retained prerequisites:** the shared arrival/morph timeline (one phase coordinate in `TransitionClock`, with the arrival and placement moved there) and its tests are prerequisites of 2.4b.2. The specialist shape-generator contract tests (exact N, determinism, bounds, role-coherent blocks, representative prefixes) are prerequisites of each specialist milestone.
