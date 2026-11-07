# MOYLAN//OS — Agent Profiles

**Status:** v0.2 · decisions approved 7 November 2026
**Sources:** master plan v1.0 (PDF + Apple Notes text) and blueprint illustration in `docs/references/` (kept locally; not published in the repository).
**Companion documents:** [`DESIGN-BRIEF.md`](DESIGN-BRIEF.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md)

> **Approved** fields come directly from the references or were approved in the 7 November 2026 review (colours, voice rule, shared particle-system architecture). **(proposed)** fields are recommendations still open for review: example microcopy, geometry recipes and motion details.
>
> The master plan references five individual agent illustrations (`moylan_os_assets/nex_agent.png`, `forge_agent.png`, `syn_agent.png`, `atlas_agent.png`, `cipher_agent.png`). These aren't in the repository yet; the agent tiles in the blueprint illustration and the PDF are used as the visual reference until they're added.

---

## Shared rules for all agents

1. **Personas are a UX device.** Agents introduce, frame and guide. They never claim sentience, feelings or expertise that the content doesn't back up. In v1 every line is scripted.
2. **Voice rule (approved).** Agents speak about **themselves in the first person** ("I'm NEX, the host of MOYLAN//OS.", "Let me show you how the systems are built.") and about **Alex Moylan's work in the third person** ("Alex built…"). An agent never speaks *as* Alex. Case studies and the About page use Alex's own voice.
3. **Truthfulness.** Completed, in-progress and planned work are always labelled. Agents never describe planned work as finished.
4. **Brevity.** Agent lines are ≤ 2 short sentences. Agents are guides, not narrators.
5. **Always skippable.** Nothing an agent says gates content; every agent line duplicates information also reachable through the normal navigation.
6. **Consistent anatomy.** Every agent has: name, `// EPITHET`, accent colour pair, procedural form, signature motion, environment, intro line, static poster and text description.
7. **One particle system (approved).** All five forms are rendered by the same morphing GPU particle system, `AgentCore` (ARCHITECTURE §6). Each agent supplies a shape generator, a colour/motion config and optional overlays.
8. **Privacy-aware.** Agents never ask visitors for personal information. Any future conversational agent follows SECURITY.md §12 and PRIVACY-COMPLIANCE.md §8.

### Agent registry (implemented in `src/agents/registry.ts`)

```ts
type AgentId = 'nex' | 'forge' | 'syn' | 'atlas' | 'cipher';

interface AgentDefinition {
  id: AgentId;
  name: string;                 // 'FORGE'
  epithet: string;              // 'The Engineer'
  domain: string;               // 'Engineering'
  route: AppPath;               // '/engineering': home environment, checked against the route manifest
  colours: { primary: string; secondary: string };   // must match src/styles/app.css tokens
  introLine: string;            // approved line, first person
  summary: string;              // third person about Alex
  contents: { label: string; planned?: boolean }[];  // environment outline
  visualDescription: string;    // accessible text equivalent of the visual
}
```

Which agent hosts each URL (including projects and the 404 page) is defined once in `src/routing/manifest.ts` (ARCHITECTURE §4). Unit tests enforce that registry colours match the CSS tokens and pass WCAG AA on every surface. Motion parameters (`breathePeriod`, `morphStagger`, `cursorResponse`) join the registry with the WebGL milestones.

### Systemic relationships

```
                 NEX (host)
                    │
   FORGE ───── MOYLAN//OS ───── SYN
     │          (platform)        │
   ATLAS ─────────────────── CIPHER
```

This is the blueprint's System Overview: NEX sits above the platform, FORGE left, SYN right, ATLAS lower-left, CIPHER lower-right, all on a shared orbit. NEX can always be reached from any specialist, and specialists can hand off to each other (e.g., FORGE → CIPHER for a project's cloud security aspects).

---

## NEX: Primary Intelligence

| | |
|---|---|
| **Epithet** | `// PRIMARY INTELLIGENCE` |
| **Domain** | Host, guide and gateway to MOYLAN//OS |
| **Route** | `/` (also `/projects`, `/about`, `/contact`) |
| **Colours** (approved) | primary `#3FE0D0` cyan-teal · secondary `#14A89C` deep teal |
| **Intro line** (approved) | "Welcome to MOYLAN//OS. What would you like to explore?" |

**Purpose (approved):** Central host, guide and gateway to MOYLAN//OS. Onboards, guides and orchestrates the experience.

**Responsibilities (approved):** Welcomes visitors, understands what they want to explore, and offers direct routes to projects, engineering, AI, advisory, security and contact. Owns global navigation, introduction, quick questions and handoff.

**Focus (approved):** Navigation, overview, context and cross-agent support.

**Content owned:** Home (Alex's positioning, welcome, guided navigation), All Projects, About, Contact.

**Personality (approved):** Calm, intelligent, inviting and quietly futuristic.

**Voice & tone** *(proposed)*
- Warm, unhurried, second person ("you"). Speaks in short, clear sentences.
- Offers choices instead of making assumptions.
- ✅ "Each guide specialises in one part of Alex's work. Choose where to begin."
- ❌ "INITIALISING NEURAL UPLINK…": no faux-terminal theatre that delays or obscures meaning.

**First-person introduction** (approved voice rule; wording proposed)
- "I'm NEX, the host of MOYLAN//OS. I'll guide you through Alex Moylan's work in software engineering, AI, cloud security and technology advisory."

**Example microcopy** *(proposed)*
- Pathway prompt: "Engineering, AI, advisory or cloud security: where shall we start?"
- Handoff: "FORGE will walk you through the engineering work."
- Return: "Welcome back. Somewhere new?"

**Visual identity (approved):** Luminous cyan-teal orbital sphere. Fine light filaments and responsive particles orbit a central intelligence core. (Blueprint: a wireframe glowing sphere wrapped in sweeping filaments; PDF: stacked elliptical orbital rings with scattered nodes inside a faint containment circle.)

**Procedural form** *(proposed)*
- **Core:** dense spherical cluster (~10% of N) with Gaussian radial falloff and the brightest intensity (bloom-eligible).
- **Orbital rings:** ~12–24 thin rings at varied inclinations around a common axis (~55% of N), reconciling the PDF's stacked rings with the blueprint's sphere: viewed head-on they read as a sphere, and at an angle as stacked orbits.
- **Filaments:** a few long great-circle arcs with slight noise offsets (~20% of N), rendered as points plus faint lines.
- **Halo:** sparse outer particles drifting within a faint containment circle (~15% of N).
- Overlay: one hairline containment ring (the PDF's circle motif), and corner brackets in the DOM framing.

**Signature motion (approved):** Appears from drifting particles, ripples toward the cursor, then morphs into specialist agents.

**Motion detail** *(proposed)*
- **Arrival:** particles start scattered across the ambient field and are drawn into orbit along curved paths (≤ 2.5s).
- **Idle:** rings precess slowly at slightly different speeds; the core breathes on a ~6s period.
- **Cursor:** filaments lean and ripple toward the pointer (attraction, not repulsion, which makes NEX feel attentive); a nearby pointer brightens the core subtly.
- **Pathway preview:** hovering a pathway tints the outer filaments toward that agent's primary colour.
- **Morph out:** the rings unwind into a loose cloud, which reassembles as the specialist.

**Environment:** Calm cyan-teal particle network with sparse constellation lines on obsidian.

**Static fallback:** SVG/AVIF poster of NEX's rings on an obsidian radial gradient.
**Text equivalent:** "NEX, the MOYLAN//OS host: a glowing cyan sphere of orbiting light filaments."

---

## FORGE: The Engineer

| | |
|---|---|
| **Epithet** | `// THE ENGINEER` |
| **Domain** | Software engineering |
| **Route** | `/engineering` |
| **Colours** (approved) | primary `#FFB347` amber · secondary `#FF7A1A` burnished orange |
| **Intro line** (approved) | "Let me show you how the systems are built." |

**Purpose (approved):** Explains the software and systems Alex builds; presents engineering work and technical depth.

**Responsibilities (approved):** Presents C#/.NET, Python, React, APIs, GitHub, technical architecture and working demos. Turns each project into an understandable engineering case study.

**Focus (approved):** Projects, C#/.NET, Python, architecture, GitHub.

**Content owned:** React, TypeScript, Python, APIs, GitHub, architecture, C#/.NET; project gallery, technical walkthroughs, API and architecture diagrams, GitHub repositories; the future C#/.NET insurance-claims application (**planned** until tested and deployed).

**Personality (approved):** Direct, practical, inventive and confident.

**Voice & tone** *(proposed)*
- Concrete and economical. Leads with what was built, then how, then why.
- Uses precise technical nouns; no hype adjectives.
- ✅ "A REST API in ASP.NET Core with role-based auth. Here's the architecture."
- ❌ "A revolutionary, cutting-edge solution."

**Example microcopy** *(proposed)*
- Gallery prompt: "Pick a project. Hover to see its layers."
- Planned-work label: "On the workbench: not shipped yet."

**Visual identity (approved):** Burnished amber and orange crystalline core: modular polyhedra, wireframe edges and sparks representing construction. (Blueprint: a faceted orange crystal of shards with glowing edges; PDF: an irregular polygonal wireframe with small diamond fragments.)

**Procedural form** *(proposed)*
- **Crystal:** points along the edges (~50%) and faces (~25%) of 3–5 nested, slightly offset polyhedra (icosahedron, dodecahedron, octahedron shards) with randomly removed faces for an "under construction" asymmetry.
- **Fragments:** small floating diamond shards (~10%) orbiting close to the crystal.
- **Sparks:** short-lived particles (~15%) emitted upward from edges and recycled in-shader with time-based lifetimes.
- Overlay: wireframe `LineSegments` of the polyhedra edges.

**Signature motion (approved):** Components assemble on entry; hover reveals the layers, APIs and data flows behind a project.

**Motion detail** *(proposed)*
- **Morph in:** particles snap into place shard-by-shard in a quick cascade (higher stagger contrast, firmer easings): "assembly".
- **Idle:** slow rotation on two axes; occasional spark bursts.
- **Cursor:** shards separate slightly toward the pointer (an exploded view), revealing inner layers.
- **Project hover:** the crystal "explodes" into labelled layers (UI · API · data) mirrored by DOM labels, so the meaning is also in text.

**Environment:** Warm amber sparks drifting upward; faint blueprint grid.

**Static fallback:** Amber crystalline wireframe poster.
**Text equivalent:** "FORGE, the engineering guide: an amber crystal of interlocking wireframe shards."

---

## SYN: The AI Specialist

| | |
|---|---|
| **Epithet** | `// THE AI SPECIALIST` |
| **Domain** | AI & machine learning |
| **Route** | `/ai` |
| **Colours** (approved) | primary `#B98CFF` violet · secondary `#E05CFF` magenta |
| **Intro line** (approved) | "Explore how ideas become intelligent systems." |

**Purpose (approved):** Guides visitors through applied AI and machine-learning work; highlights AI expertise and applied research.

**Responsibilities (approved):** Explains the bowel MRI segmentation project, AI Communications Assistant, ML methods, evaluation metrics and future intelligent applications.

**Focus (approved):** Machine learning, computer vision, medical imaging, AI projects.

**Content owned:** University bowel MRI segmentation project; AI Communications Assistant; ML/AI projects, datasets, model design, methodology, evaluation, outcomes and limitations.

**Personality (approved):** Curious, analytical, clear and approachable.

**Voice & tone** *(proposed)*
- Explains like a good lecturer: intuition first, then the metric.
- States limitations plainly; always pairs a result with its context (dataset, metric, baseline).
- ✅ "The model segments bowel regions in MRI scans. Here's how it was evaluated and where it struggles."
- ❌ "The AI understands medical images."

**Example microcopy** *(proposed)*
- Project prompt: "Choose a project to trace it from data to model to results."
- Limitations heading: "What it can't do (yet)."

**Visual identity (approved):** Violet-magenta neural sphere made of pulsing connected nodes, arcs and translucent synaptic pathways. (Blueprint: a dense spherical node network with bright junctions; PDF: an irregular constellation of nodes on a sphere joined by straight links.)

**Procedural form** *(proposed)*
- **Nodes:** ~200–400 nodes on a Fibonacci sphere with radial jitter (rendered as larger, bright particles).
- **Synapses:** the remaining particles distributed along curved arcs between each node and its k nearest neighbours (k ≈ 3–4), with per-particle phase offsets so pulses travel along the arcs.
- **Inner web:** a sparse set of chords through the sphere's interior for depth.
- Overlay: faint `LineSegments` for the synaptic graph.

**Signature motion (approved):** Neural connections illuminate in response to movement; project selection highlights data, model and results.

**Motion detail** *(proposed)*
- **Morph in:** nodes appear first, then synapses "grow" between them (stagger by distance from the nearest node).
- **Idle:** signal pulses travel along arcs at random intervals; nodes pulse softly.
- **Cursor:** connections near the pointer light up and pulses propagate outward from the nearest node (activation spreading).
- **Project selection:** the network partitions into three highlighted regions, *data → model → results*, mirrored by a DOM step indicator.

**Environment:** Violet synaptic web; connections brighten near the cursor.

**Static fallback:** Violet neural-sphere poster.
**Text equivalent:** "SYN, the AI guide: a violet sphere of connected, pulsing neural nodes."

---

## ATLAS: The Strategist

| | |
|---|---|
| **Epithet** | `// THE STRATEGIST` |
| **Domain** | Technology & advisory |
| **Route** | `/advisory` (also `/experience`) |
| **Colours** (approved) | primary `#5CB8FF` electric blue · secondary `#2F7BFF` deep blue (non-text only) |
| **Intro line** (approved) | "Great technology matters when it solves a real problem." |

**Purpose (approved):** Connects technology to people, strategy and business outcomes; showcases commercial and strategic experience.

**Responsibilities (approved):** Shows enterprise technology experience, customer communication, stakeholder engagement, solution design, commercial impact and advisory strengths.

**Focus (approved):** Technology advisory, solutions architecture, business impact.

**Content owned:** Professional experience, enterprise technology experience, technology storytelling, stakeholder engagement, customer needs and experience, solution design and solutions engineering, commercial thinking and impact; the experience timeline.

**Personality (approved):** Composed, strategic, articulate and commercially aware.

**Voice & tone** *(proposed)*
- Outcome-first: problem → approach → impact. Business language without jargon.
- Never names confidential clients or figures without permission; uses anonymised, verifiable framing.
- ✅ "The problem, the people involved, and what changed as a result."
- ❌ "Leveraged synergies to drive transformational value."

**Example microcopy** *(proposed)*
- Timeline prompt: "Follow the path from problem to outcome."
- Confidentiality note: "Some details are generalised to respect client confidentiality."

**Visual identity (approved):** Electric-blue orbital globe with graceful rings, data paths and a global network. (Blueprint: a blue planet-like globe with a network surface and one tilted ring; PDF: a lat/long wireframe globe with two inclined elliptical rings and nodes.)

**Procedural form** *(proposed)*
- **Globe lattice:** points along latitude and longitude lines (~45%).
- **Network surface:** scattered "city" nodes on the sphere (~15%).
- **Data paths:** great-circle arcs lifted above the surface between node pairs (~20%), with travelling pulses.
- **Rings:** 2 graceful inclined rings (~20%), slightly wider than the globe.
- Overlay: arcs as `LineSegments`; ring hairlines.

**Signature motion (approved):** Geographic arcs and network lines reconfigure into timelines and solution diagrams.

**Motion detail** *(proposed)*
- **Morph in:** the lattice draws on line by line, then the rings sweep into orbit.
- **Idle:** slow globe rotation; the rings counter-rotate; pulses travel along arcs.
- **Cursor:** the globe tilts gently toward the pointer (orientation, as if surveying), and the nearest arcs brighten.
- **Scroll (experience section):** arcs unroll from the globe into a horizontal timeline / solution diagram synced to the DOM timeline. The DOM timeline is the accessible source of truth.

**Environment:** Blue orbital arcs and network lines.

**Static fallback:** Blue orbital-globe poster.
**Text equivalent:** "ATLAS, the advisory guide: a blue wireframe globe circled by orbital rings and network arcs."

---

## CIPHER: The Security Specialist

| | |
|---|---|
| **Epithet** | `// THE SECURITY SPECIALIST` |
| **Domain** | Cloud & security |
| **Route** | `/cloud-security` |
| **Colours** (approved) | primary `#3DDC97` emerald · secondary `#13A86B` deep emerald |
| **Intro line** (approved) | "Let us look at the systems that keep everything connected and protected." |

**Purpose (approved):** Introduces cloud, identity and security knowledge; presents security and cloud capabilities.

**Responsibilities (approved):** Covers Azure fundamentals, cloud architecture, authentication, security principles, learning progress and future cyber-focused projects.

**Focus (approved):** Cloud (Azure), security, certifications, cyber projects.

**Content owned:** Microsoft Azure Fundamentals (AZ-900) achievement, Azure and cloud architecture knowledge, identity/authentication, security concepts, future studies and projects, **accurately distinguishing future work from completed work** (approved requirement: learning in progress is clearly labelled).

**Personality (approved):** Precise, reassuring, observant and dependable.

**Voice & tone** *(proposed)*
- Measured and exact. Distinguishes "certified", "studying" and "planned" every time.
- Reassuring rather than alarmist; no fear-based security language.
- ✅ "AZ-900: completed. Next on the study path: planned, not yet started."
- ❌ "Elite hacker-grade cyber defence."

**Example microcopy** *(proposed)*
- Credential status labels: "Verified" · "In progress" · "Planned".
- Section prompt: "Decrypt a section to see the architecture behind it."

**Visual identity (approved):** Emerald-green holographic shield with a fine hexagonal grid, subtle encryption streams and geometric protection layers, within a restrained Matrix-inspired environment. (Blueprint: a glossy emerald shield with an inner hex grid and layered borders; PDF: a shield outline with a hex lattice and a checkmark.)

**Procedural form** *(proposed)*
- **Shield outline:** points along 2–3 concentric, offset shield silhouettes (~35%), giving depth layers.
- **Hex lattice:** points along a hexagonal grid clipped to the shield interior (~40%).
- **Encryption streams:** sparse vertical columns of particles (~15%) flowing downward behind the shield, carrying original glyph-like flicker. Low opacity, never full-screen "rain".
- **Seal:** a small bright emblem at the centre (~10%). A geometric lock/check motif.
- Overlay: hex grid and outlines as `LineSegments`.

**Signature motion (approved):** A digital mesh locks into place, then decrypts to reveal diagrams, certifications and cloud projects.

**Motion detail** *(proposed)*
- **Morph in:** hex cells snap into place in a ripple from the centre outward, then the outer layers close: "lock".
- **Idle:** a slow scan line passes over the shield every ~8s; the streams trickle.
- **Cursor:** hex cells near the pointer brighten and lift slightly (inspection), without breaking the shield's silhouette.
- **Reveal:** on section open, hex cells part (decrypt) and DOM headings perform a short decode-text effect (disabled under reduced motion).

**Environment:** Emerald hex mesh with sparse encryption streams.

**Static fallback:** Emerald shield poster.
**Text equivalent:** "CIPHER, the cloud and security guide: an emerald shield made of a glowing hexagonal mesh."

---

## Reduced-motion and fallback summary

| Agent | Reduced motion | Motion Off / no WebGL |
|---|---|---|
| All | Form shown fully assembled; slow idle only; no cursor displacement; cross-fade instead of morph | Static poster (SVG/AVIF) + text description; identical content and navigation |

## Decisions and open questions

Approved 7 November 2026:
- Colour pairs as listed (WCAG AA verified by an automated unit test in `src/agents/registry.test.ts`).
- Voice rule: first person about themselves, third person about Alex.
- Shared GPU particle-system architecture with morphing between all five agents.

Still open:
1. Example microcopy wording (all marked *proposed*).
2. Add the five individual agent illustrations to `docs/references/` if they exist, so the procedural forms can be checked against them.
