# MOYLAN//OS — Design Brief

**Status:** v0.2 · decisions approved 7 November 2026
**Sources:** `docs/references/MOYLAN-OS_Master_Project_Plan.pdf` (master plan v1.0), `docs/references/MOYLAN-OS_Apple_Notes_Copy.txt` (illustrated plan text v1.0), `docs/references/MOYLAN__OS_ Interactive AI Portfolio Blueprint.png` (blueprint illustration). These private references are kept locally and excluded from the repository.
**Companion documents:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`AGENT-PROFILES.md`](AGENT-PROFILES.md) · [`SECURITY.md`](SECURITY.md) · [`PRIVACY-COMPLIANCE.md`](PRIVACY-COMPLIANCE.md)

> Items marked **(proposed)** are recommendations not yet approved. Items marked **(approved)** were added beyond the original references and approved in the 7 November 2026 review. Everything else restates the approved references.

---

## 1. North star

**MOYLAN//OS** is an immersive, agent-guided portfolio for Alex Moylan. Visitors enter a personal digital operating system, meet **NEX** (the host), and choose interactive environments hosted by four specialist guides: **FORGE**, **SYN**, **ATLAS** and **CIPHER**. It should feel like exploring a futuristic operating system, not reading a conventional CV.

- **Brand promise / tagline:** *Explore the systems. Meet the mind behind them.*
- **Positioning:** software engineering, AI/ML, cloud and technology advisory, speaking equally to technical hiring managers, solutions engineering teams and technology consulting decision-makers.
- **Core idea:** *a portfolio that is itself an engineering demonstration*: memorable, useful and professionally credible.
- **Non-negotiable:** this is a professional portfolio, not a film prop. Real projects, experience, credentials, CV and contact details are always easy to reach. Standard navigation always remains available.

### Audiences

| Audience | What they need in < 60 seconds | Primary guide |
|---|---|---|
| Software engineering recruiters | Who Alex is, core stack, best projects, CV | NEX → FORGE |
| AI / cloud / solutions engineering hiring managers | Applied AI work, evaluation rigour, cloud knowledge, code evidence | SYN, CIPHER, FORGE |
| Technology consulting & advisory decision-makers | Commercial experience, stakeholder communication, solution design, impact | ATLAS |

### Inspiration and originality

- **Quality benchmark (approved):** the immersive interaction quality of Active Theory (activetheory.net). Aim for premium cinematic visuals, sophisticated lighting, fluid mouse interactions and polished transitions. It's a benchmark for *quality*, not a style to imitate.
- **Inspired by** the general idea of sci-fi AI assistants as navigation guides.
- **Never** borrowed code, trademarked characters (no Marvel or other franchise likeness), Active Theory's proprietary work or copied visual assets. MOYLAN//OS has its own **cybernetic-minimalist** identity.

---

## 2. Design language: Cybernetic Minimalism

> Deep obsidian, gunmetal, luminous cyan, restrained emerald Matrix-like data effects, clear typography and polished transitions. Cyberpunk atmosphere without overwhelming neon or gaming aesthetics. Sophisticated rather than gaming-themed.

### Principles

1. **Darkness is the canvas.** Large fields of near-black obsidian; light appears only where it carries meaning (an agent, an active path, a focused control).
2. **One voice of colour at a time.** The interface's host colour is NEX cyan. Inside a specialist environment, that agent's accent takes over. Never more than one saturated accent dominates a view (the multi-agent system overview is the deliberate exception).
3. **Every effect supports understanding.** Motion explains state changes (arrival, selection, transformation, reveal). Decoration that doesn't help comprehension is cut.
4. **Precision over spectacle.** Hairline strokes, fine filaments, small particles and generous negative space. Glow is soft and controlled, never blown out.
5. **Content is always legible.** Text sits on calm areas of the scene or on subtle glass panels. The 3D scene never competes with reading.
6. **Restrained data effects.** Emerald "data stream" effects are thin, sparse, low-opacity and original (column-glyph motifs as texture, never a literal recreation of any film's digital rain).

### Colour system (approved)

Base palette extracted from the PDF and blueprint, tuned for contrast. Ratios measured against WCAG 2.x.

| Token | Hex | Use | Contrast on obsidian / gunmetal |
|---|---|---|---|
| `obsidian` | `#05080B` | Page background, canvas clear colour | n/a |
| `abyss` | `#0A1117` | Raised background, section bands | n/a |
| `gunmetal` | `#121C24` | Cards, panels, glass base | n/a |
| `steel` | `#1E2B35` | Borders, dividers, inactive strokes | non-text |
| `text` | `#E6F0F3` | Primary text | 17.3 / 14.9 |
| `text-muted` | `#93A4AF` | Secondary text, metadata | 7.8 / 6.7 |
| `text-subtle` | `#6B7C87` | Decorative labels, large text only | 4.6 / 4.0 ⚠ not for body text on cards |

**Agent accents** (each agent gets a `primary` for text/UI and a `secondary` for gradients, sparks and depth):

| Agent | `primary` | `secondary` | Primary contrast on obsidian / gunmetal |
|---|---|---|---|
| NEX (cyan-teal) | `#3FE0D0` | `#14A89C` | 12.2 / 10.5 |
| FORGE (amber-orange) | `#FFB347` | `#FF7A1A` | 11.3 / 9.7 |
| SYN (violet-magenta) | `#B98CFF` | `#E05CFF` | 7.9 / 6.8 |
| ATLAS (electric blue) | `#5CB8FF` | `#2F7BFF` ⚠ non-text only | 9.3 / 8.0 |
| CIPHER (emerald) | `#3DDC97` | `#13A86B` | 11.4 / 9.8 |

Rules:
- All agent `primary` colours pass WCAG AA (≥ 4.5:1) for body text on every surface, and AAA (≥ 7:1) on obsidian except SYN on cards.
- Filled buttons use obsidian text on the agent primary (≥ 7:1 in every case).
- In WebGL, colours are authored in linear space and pushed brighter (HDR-style, > 1.0) only for bloom-eligible cores. Hex values above are the sRGB UI reference.
- Agent colour is never the *only* signal: active state also uses shape, weight, underline or iconography.

### Typography (approved)

| Role | Recommendation | Notes |
|---|---|---|
| Wordmark | Original vector SVG `MOYLAN//OS` | Per plan: clean vector logo, not an AI raster. The prototype uses a type-set placeholder. |
| Display / headings | **Geist** (variable; wide tracking for caps labels) | Matches the blueprint's geometric, widely tracked headings. |
| Body / UI | **Geist** | Highly legible at small sizes on dark backgrounds. |
| System / console / labels | **Geist Mono** | The "operating system" voice: agent epithets (`// PRIMARY INTELLIGENCE`), console, metadata. |

- **Self-hosted** (bundled from the Fontsource variable packages, SIL OFL 1.1) with `font-display: swap` and Latin subset. No Google Fonts or other font CDN: this avoids third-party requests that would expose visitor IP addresses (see PRIVACY-COMPLIANCE §7) and keeps the CSP same-origin.
- Body text ≥ 16px, line-height 1.5–1.65, measure 60–75ch.
- **Fluid display sizes:** large headings ease down slightly only on screens narrower than 360 px and keep growing with the visitor's browser text size. Long words break only when they can't fit a line by themselves, so at normal sizes headings never split (ARCHITECTURE §10, reflow).
- The `//` separator is a brand device: wordmark, agent epithets (`// THE ENGINEER`) and breadcrumbs (`MOYLAN//OS / FORGE`).
- **Cinematic type:** headlines resolve in with a short "decode" (per-character scramble settling to the final glyph, ≤ 600ms) or a masked rise. The final text is in the DOM from the first paint; the effect is purely visual and disabled under reduced motion.

### Surfaces and UI components

- **Glass panels:** gunmetal at 60–80% opacity, 1px `steel` hairline border, subtle backdrop blur (only where performance tier allows; solid fallback otherwise), 12–16px radius (matches the PDF's rounded cards).
- **Corner brackets:** thin L-shaped corner marks framing agent viewports (from the PDF agent tiles). A recurring "viewfinder" motif.
- **Hairline rules** with agent-colour highlights on the active segment.
- **Focus ring:** 2px solid in the current agent's primary colour plus a 2px obsidian offset. Always visible on keyboard focus.
- **Iconography:** single-weight line icons (1.5px stroke) consistent with the blueprint (gear, code brackets, brain, chart bars, padlock, cloud).

---

## 3. The agents at a glance

Full specification: [`AGENT-PROFILES.md`](AGENT-PROFILES.md).

| Agent | Epithet | Domain | Form | Intro line |
|---|---|---|---|---|
| **NEX** | // Primary Intelligence | Host, guide, gateway | Cyan-teal orbital sphere, light filaments, orbiting particles around a central core | "Welcome to MOYLAN//OS. What would you like to explore?" |
| **FORGE** | // The Engineer | Software engineering | Amber/orange crystalline core: modular polyhedra, wireframe edges, construction sparks | "Let me show you how the systems are built." |
| **SYN** | // The AI Specialist | AI & machine learning | Violet-magenta neural sphere: pulsing nodes, arcs, translucent synaptic pathways | "Explore how ideas become intelligent systems." |
| **ATLAS** | // The Strategist | Technology & advisory | Electric-blue orbital globe: graceful rings, data paths, global network | "Great technology matters when it solves a real problem." |
| **CIPHER** | // The Security Specialist | Cloud & security | Emerald holographic shield: hexagonal grid, encryption streams, geometric protection layers | "Let us look at the systems that keep everything connected and protected." |

**Truthfulness:** agent personas are a UX concept. They never imply independent sentience, or expertise not backed by real content.

**Voice rule (approved):** agents speak about *themselves* in the first person ("I'm NEX…", "Let me show you…") and about Alex Moylan's work in the third person ("Alex built…"). An agent never speaks *as* Alex.

---

## 4. The visitor journey

"An immersive journey with practical exits, no obligatory chat and no unnecessary waiting."

| Step | What happens | Design requirements |
|---|---|---|
| **01 Arrival** | An elegant cyan-teal particle network forms on the dark canvas. | A concise introduction (name, positioning, tagline) is in the HTML and visible **immediately**, before any 3D loads. No forced intro sequence and no loading gate. |
| **02 Meet NEX** | NEX coalesces from drifting particles into a responsive cyan orb, ripples toward the cursor, and offers clear choices: **Engineering, AI, Advisory, Cloud/Security and All Projects**. | Choices are real links, keyboard-reachable, each previewing its agent's colour on hover/focus. |
| **03 Agent transition** | Selecting an area morphs NEX into the chosen specialist; the environment's colour, background and geometry shift. | No hard page reload. Interruptible. Reduced-motion users get a quick cross-fade. |
| **04 Explore** | Real project cards, case studies, skills, evidence and working demos; hover and scroll reveal interactive detail. | Every claim links to evidence; planned work is labelled as planned. |
| **05 Act / Continue** | A persistent menu offers CV, GitHub, LinkedIn and Contact. Visitors move between agents, return to NEX, or bypass the cinematic navigation entirely. | Global access is visible on every view, at every breakpoint. |

### Global access (always present)

About Me · Experience · Projects · CV · Contact · GitHub · LinkedIn

---

## 5. Signature interactions

| Interaction | Behaviour | Fallback |
|---|---|---|
| **Cursor disturbance** | A GPU particle/network field that the cursor bends, repels and disturbs. Displacement ripples outward and settles gently and naturally. | Static field (reduced motion); CSS gradient + SVG poster (no WebGL). |
| **Morphing agent cores** | Distinct geometry and colour per agent; smooth cross-fades and particle reassembly between forms. | Instant swap of static agent poster with a 150ms opacity cross-fade. |
| **Scroll choreography** | Precise GSAP-driven transitions, depth shifts, subtle parallax and active-section navigation. | Native scrolling with content fully visible; no scroll-linked motion. |
| **Project gallery** | Responsive cards; hover/selection reveals meaningful metadata, architecture diagrams and results. | Same metadata always visible as plain text. |
| **Developer console** *(optional)* | A keyboard-operated command panel: `projects`, `skills`, `experience`, `about`, `contact`. | It *is* an alternative path; the regular navigation still covers everything. |
| **Cinematic assets** | Higgsfield textures, stills and short video loops, only where interaction itself isn't needed. | Static image; video never autoplays under reduced motion or Save-Data. |

### Motion language (proposed)

| Token | Value | Use |
|---|---|---|
| `ease-os` | `cubic-bezier(0.22, 1, 0.36, 1)` (expo-out feel) | Default UI entrance |
| `ease-morph` | `power3.inOut` (GSAP) | Agent morphs, camera moves |
| `dur-micro` | 150–200ms | Hover, focus, toggles |
| `dur-ui` | 300–450ms | Panels, cards, text reveals |
| `dur-morph` | 1.2–1.8s | Agent-to-agent transformation |
| `dur-arrival` | ≤ 2.5s | NEX coalescing on first load (non-blocking) |

- Motion has **mass**: particles accelerate and decelerate. Nothing moves linearly except data streams.
- **Idle life:** agents breathe (slow scale/brightness oscillation, 4–8s period) and drift. Idle motion stays subtle enough to read beside.
- **Settle:** after cursor interaction, displacement eases back over ~1–2s, never snapping.

---

## 6. Per-environment art direction

Each specialist environment reuses the same layout system and differs in accent colour, agent geometry, background behaviour and content modules. See [`AGENT-PROFILES.md`](AGENT-PROFILES.md) for each agent's geometry recipe.

| Environment | Background behaviour | Content modules |
|---|---|---|
| **NEX / Home** | Calm cyan-teal particle network; sparse constellation lines. | Positioning, intro line, five pathways, featured work, global access. |
| **FORGE / Engineering** | Warm amber sparks drifting upward; faint blueprint grid. | Project gallery, technical walkthroughs, API & architecture diagrams, GitHub repos, *planned* C#/.NET insurance-claims demo. |
| **SYN / AI** | Violet synaptic web; connections light up near the cursor. | Bowel MRI segmentation project, AI Communications Assistant, methodology, evaluation metrics, limitations. |
| **ATLAS / Advisory** | Blue orbital arcs and network lines that reconfigure into timelines. | Enterprise experience, stakeholder engagement, customer experience, solution design, commercial impact. |
| **CIPHER / Cloud & Security** | Emerald hex mesh with sparse encryption streams. | AZ-900 (Azure Fundamentals) achievement, Azure/cloud architecture knowledge, security concepts, clearly labelled future learning and projects. |

### System overview motif

The blueprint's **System Overview** diagram (MOYLAN//OS platform at the centre, NEX above, FORGE left, SYN right, ATLAS lower-left, CIPHER lower-right, connected on an orbit) is the canonical spatial map. **(Proposed)** Use it for the developer console / "All agents" overview and to drive camera direction during transitions. For example, morphing to FORGE subtly drifts the camera left so the system feels spatially coherent.

---

## 7. Accessibility requirements

Accessibility is a release blocker, not polish. Implementation status and the limits of automated testing are tracked in ARCHITECTURE §10–11.

- **Content-first layering:** semantic HTML carries all content and navigation. WebGL, video, audio and AI chat are enhancements only. The site is fully usable with WebGL disabled.
- **Reduced motion:** respect `prefers-reduced-motion` by default, and offer a visible **motion control** (System / Full / Reduced / Off) from the first milestone that has motion. "Off" pauses rendering entirely. Implemented in Milestone 2.1 (ARCHITECTURE §10): System follows the OS live, and the choice is kept in memory only, never stored (PRIVACY-COMPLIANCE §4.3).
- **Pause control:** any moving content > 5 seconds can be paused (WCAG 2.2.2).
- **Keyboard:** full keyboard operation; logical focus order; skip link to main content; visible focus; Escape closes overlays; no keyboard traps.
- **Route changes:** move focus to the new page's `<h1>` and announce the destination through a polite live region.
- **Contrast:** WCAG 2.2 AA minimum (target AAA for body text), as specified in the colour tokens.
- **Canvas:** `aria-hidden="true"`. Agent visuals are decorative, and their meaning is duplicated in text.
- **Animated text:** decode/typewriter effects never hide content from assistive tech; the real string is always in the DOM.
- **No flashing** more than 3 times per second; bloom pulses are slow.
- **Touch:** targets ≥ 44×44px; no hover-only information.
- **Audio/voice:** off by default if ever added (open decision).

---

## 8. Security and privacy as design constraints (approved)

Security and privacy shape the design from the first milestone. They aren't added at launch. Full detail in [`SECURITY.md`](SECURITY.md) and [`PRIVACY-COMPLIANCE.md`](PRIVACY-COMPLIANCE.md).

- **No cookie banner, because nothing requires consent.** v1 sets no cookies, uses no web storage, tracking or analytics and loads nothing from third parties. Ordinary first-party browser caching is explained in the privacy notice and assessed as exempt (PRIVACY-COMPLIANCE §4.1, ⚠ legal verification before launch). The cleanest consent UX is not needing one.
- **Everything self-hosted:** fonts, images, video and scripts come from `moylanos.dev` only.
- **Strict Content Security Policy:** design and motion must work without inline `style` attributes in the HTML. Per-agent colours come from `data-agent` attributes and CSS custom properties defined in the stylesheet.
- **No embedded third-party widgets** (social feeds, video players, maps). Outbound links only; click-to-load if an embed is ever essential.
- **Honest data handling in the UI:** a footer link to the privacy notice on every page; any future AI chat discloses AI processing before first use.
- **Safe failure states:** the error and 404 pages are designed screens in the MOYLAN//OS language, never raw stack traces.

## 9. Responsive behaviour

| Breakpoint | Layout | 3D |
|---|---|---|
| Mobile (< 640px) | Single column; agent visual above the fold at ~45vh, then content; bottom-accessible nav. | Low tier: reduced particle count, DPR 1, no post-processing; touch drag disturbs the field. |
| Tablet (640–1024px) | Two-zone layout; agent visual beside or above content. | Medium tier. |
| Desktop (> 1024px) | Agent occupies the visual centre/right; content panels on the left; cursor interaction everywhere. | High tier when the GPU allows. |

---

## 10. Content principles

- **Real experience, real code, real outcomes.** Every public project claim has supporting evidence (repo, demo, write-up or credential).
- **Completed vs planned:** a visible status (`Completed`, `In progress`, `Planned`) on every project and credential. The C#/.NET insurance-claims demo is promoted as finished only when it is tested and deployed.
- **No confidential data:** no employer or client confidential information, names or screenshots without permission.
- **Agent voice ≠ Alex's voice:** agents introduce and frame; case studies and the About page speak in Alex's own voice.

---

## 11. Asset strategy

Per the master plan, **don't generate artwork first.**

1. **Prototype** with procedural/placeholder graphics to settle layout, interaction, motion and text placement.
2. **Write an asset brief** per final asset: use, aspect ratio, colour, subject, negative space, duration, quality target and fallback.
3. **Generate** with Higgsfield Plus only once the art direction is settled, after verifying its usage rules and commercial licence terms.
4. **Select and optimise:** AVIF/WebP/SVG stills; lightweight WebM/MP4 loops with static fallbacks.
5. **Archive** raw exports, prompts and licence evidence outside the deployed app; only optimised finals go into `public/assets/`.

**(Proposed)** The interactive agents are **procedural** (code-generated geometry and shaders), not image-based. Higgsfield assets serve static fallbacks/posters, Open Graph images, project-card art, ambient textures and optional cinematic loops. **Applied to NEX (Milestone 2.3):** a Higgsfield-designed 3D reference model served as the design source; its ring composition, proportions and motion were extracted as parameters and rendered procedurally (ARCHITECTURE §19). The model itself is not published or loaded.

---

## 12. Open design decisions

From the references, deliberately deferred:
- ~~Final domain~~: **decided: `moylanos.dev`** (trademark check still recommended before launch).
- Whether agents ever speak aloud (voice off by default if added).
- Whether live LLM conversation is worth the ongoing cost (Version 2).
- Final production imagery (after the prototype).
- ~~Analytics and privacy-notice choice~~: **decided: no analytics in v1; privacy notice at `/privacy`** (PRIVACY-COMPLIANCE.md).

Raised by this brief:
- Final logo/wordmark design (SVG).
- Whether ambient sound exists at all (recommend: no, for v1).
