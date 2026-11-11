# MOYLAN//OS — Security Architecture and Policy

**Status:** v0.3 · 7 November 2026 · applies from Milestone 1 onward
**Scope:** the public website at `moylanos.dev`, this repository, its CI/CD pipeline, the Azure hosting resources, and any future API (including optional AI agents).
**Companion documents:** [`PRIVACY-COMPLIANCE.md`](PRIVACY-COMPLIANCE.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md)

> This file is written for a **public repository**. It describes controls and principles, not secrets or environment-specific identifiers. Subscription IDs, resource names, tokens, IP ranges and contact addresses never belong here. GitHub also recognises `docs/SECURITY.md` as the repository's security policy, so §1 is the public vulnerability-reporting policy.

---

## 1. Reporting a vulnerability

Please **do not** open a public issue for security problems.

- Report privately through **GitHub private vulnerability reporting** (Security tab → "Report a vulnerability") on this repository.
- Expect acknowledgement within 7 days. Fixes for confirmed issues are prioritised by severity.
- Please give reasonable time to fix before public disclosure, and do not access data that isn't yours, degrade the service, or run automated high-volume scans against production.

A machine-readable `/.well-known/security.txt` (RFC 9116) is published with the site at launch.

---

## 2. Security principles

1. **Secure by design and by default.** Controls are part of each milestone's definition of done, not a pre-launch task.
2. **Minimise the attack surface.** Version 1 is a fully static site: no server code, no database, no user accounts, no forms, no cookies, no third-party scripts.
3. **Least privilege everywhere:** GitHub tokens, Azure roles, deployment credentials and future API keys.
4. **No secrets in Git or in the browser.** Anything shipped to the client is public.
5. **Defence in depth:** strict Content Security Policy *and* output encoding *and* typed content *and* dependency control.
6. **Fail safely** (OWASP A10:2025): errors show a generic page, never stack traces, configuration or internal paths.
7. **Supply-chain discipline** (OWASP A03:2025): pinned, reviewed and scanned dependencies and CI actions.
8. **Verify, don't assume:** automated checks in CI, plus the release gate in §13.

---

## 3. System context and trust boundaries

```
 Visitor browser ─────── HTTPS (TLS, HSTS) ───────▶ Azure Static Web Apps (global edge)
   │  untrusted input: URL, headers                    │ static files only (v1)
   │  executes only same-origin JS (CSP)               │ security headers from staticwebapp.config.json
   ▼                                                   │
 [TB1: Internet ↔ edge]                                │ (v2, optional) /api/* → managed Azure Functions
                                                       │      [TB3: API ↔ LLM provider]
 Developer workstation ──git push──▶ GitHub repository ─┤
   [TB2: dev ↔ GitHub]                │ PR checks (CI, CodeQL, dependency review)
                                      │ protected `main` (ruleset)
                                      ▼
                               GitHub Actions ──deploy (scoped token, protected environment)──▶ SWA
                                      [TB4: CI ↔ Azure]

 Domain registrar / DNS ──▶ moylanos.dev → SWA custom domain (managed TLS certificate)
   [TB5: DNS control]
```

| Boundary | What crosses it | Primary controls |
|---|---|---|
| TB1 Internet ↔ edge | HTTP requests from anyone | HTTPS only, HSTS, CSP and security headers, static content, no secrets in bundle |
| TB2 Developer ↔ GitHub | Source code, workflow definitions | MFA/passkey, protected branch, signed commits (recommended), secret scanning + push protection |
| TB3 API ↔ LLM (v2) | Visitor prompts, curated context | Server-side keys, rate limits, input/output validation, spend caps (§11) |
| TB4 CI ↔ Azure | Built artefact + deployment credential | Credential only in a protected GitHub Environment; minimal `GITHUB_TOKEN` permissions; SHA-pinned actions |
| TB5 DNS | Name resolution, certificate issuance | Registrar MFA and transfer lock; CAA records; no dangling records |

---

## 4. Assets

| Asset | Why it matters |
|---|---|
| Site integrity (content and scripts served to visitors) | Defacement or malicious script injection would harm visitors and Alex's professional reputation |
| Domain `moylanos.dev` and DNS | Hijack means full impersonation |
| GitHub account and repository | Source of truth; can push malicious code to production |
| Azure subscription | Cost exposure, resource abuse, deployment control |
| SWA deployment credential | Allows replacing the live site |
| Future LLM API keys and budgets (v2) | Direct financial loss; abuse |
| Visitor privacy | Legal obligation (see PRIVACY-COMPLIANCE.md) |
| Truthfulness of portfolio claims | Reputational, covered by the content rules in DESIGN-BRIEF §10 |

---

## 5. Threat model (STRIDE summary)

| # | Threat | Attack surface | Likelihood (v1) | Impact | Mitigations |
|---|---|---|---|---|---|
| T1 | **Malicious dependency / compromised package** injects code into the bundle | npm supply chain | Medium | High | Lockfile + `npm ci`; minimal dependency set; Dependabot with cooldown; dependency-review on PRs; `npm audit` gate; review lockfile diffs; no install scripts from unknown packages |
| T2 | **Compromised GitHub Action** exfiltrates the deployment credential | CI | Low–Medium | High | Pin third-party actions to full commit SHA; least-privilege `permissions:`; deployment credential only in the protected `production` environment; no `pull_request_target`; Dependabot updates for actions |
| T3 | **Secret leaked in Git** (token, key, connection string) | Repository | Medium | High | `.gitignore` for env files; GitHub secret scanning + push protection; no secrets in client code (all `VITE_*` values are public by definition); rotate immediately if leaked; history rewrite is not sufficient on its own |
| T4 | **Cross-site scripting** via content, URL parameters or future rich text/MDX | Browser | Low | High | React output encoding; no `dangerouslySetInnerHTML` (lint-enforced); strict hash-based CSP with no `unsafe-inline` or `unsafe-eval`; typed, build-time content; sanitised MDX pipeline (Phase 4) |
| T5 | **Clickjacking / UI redress** | Browser | Low | Medium | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| T6 | **Account takeover** (GitHub, Azure, registrar) | Identity | Low–Medium | Critical | Phishing-resistant MFA (passkeys/security keys) on all three; no shared accounts; recovery codes stored offline; review sessions and authorised OAuth apps |
| T7 | **Domain/DNS hijack or subdomain takeover** | DNS | Low | Critical | Registrar lock and MFA; remove DNS records *before* deleting Azure resources (avoid dangling CNAMEs); CAA records; monitor certificate transparency for the domain |
| T8 | **Protocol downgrade / MITM** | Network | Very low | High | `.dev` is an HSTS-preloaded TLD (HTTPS is mandatory in browsers); HSTS header; `upgrade-insecure-requests` |
| T9 | **Information disclosure** through errors, source maps, metadata or the CV PDF | Browser / files | Medium | Low–Medium | Generic error boundary; no production source maps published; strip PDF/image metadata; no internal paths, emails or resource names in the bundle |
| T10 | **Cost-exhaustion / denial of wallet** (bandwidth, functions, LLM) | Azure / API | Low (v1), High (v2) | Medium–High | v1 Free plan has no metered compute; Azure budget alerts; v2 rate limits, quotas and hard spend caps (§11) |
| T11 | **Prompt injection, data leakage, misuse of AI agents** (v2) | `/api/agent` | High if built | Medium–High | §11 controls aligned to the OWASP Top 10 for LLM Applications 2025 |
| T12 | **Malicious content in third-party links or assets** | Content | Low | Medium | Self-hosted fonts/assets; `rel="noopener noreferrer"` on external links; no third-party embeds without explicit click-to-load |

Repudiation (STRIDE "R") is mitigated through GitHub's audit log, the Azure Activity Log and signed commits. Elevation of privilege is addressed by T2, T3 and T6.

---

## 6. OWASP Top 10:2025 mapping

| Category | Relevance | Controls in MOYLAN//OS |
|---|---|---|
| **A01:2025 Broken Access Control** | No authenticated areas in v1. Relevant to GitHub/Azure access and the future API. | Least-privilege roles; protected branches/environments; v2 API exposes only intended routes and methods; default-deny CORS |
| **A02:2025 Security Misconfiguration** | Headers, hosting configuration, CSP | Version-controlled `staticwebapp.config.json`; automated header tests; no default credentials; dev-only tooling never deployed |
| **A03:2025 Software Supply Chain Failures** | npm packages, GitHub Actions, build pipeline | Lockfile + `npm ci`; SHA-pinned actions; Dependabot with cooldown; dependency review; CodeQL; minimal dependency policy; reproducible builds |
| **A04:2025 Cryptographic Failures** | Transport security | HTTPS everywhere; HSTS preload-ready; platform-managed TLS certificates; no custom crypto |
| **A05:2025 Injection** | XSS, future API input, prompt injection | React escaping; CSP; schema validation of all inputs (v2); parameterised queries if storage is ever added |
| **A06:2025 Insecure Design** | Architecture choices | Static-first design, threat model (this doc), layering rule, privacy by design, release gate |
| **A07:2025 Authentication Failures** | Developer and admin accounts | Phishing-resistant MFA; no visitor auth in v1; any future admin uses SWA built-in auth with role checks |
| **A08:2025 Software or Data Integrity Failures** | Build artefacts, CI | Builds only from protected `main`; deploy only from CI; CSP blocks unapproved scripts; no runtime-loaded third-party code |
| **A09:2025 Security Logging and Alerting Failures** | Limited in a static site | GitHub security alerts on; Azure Activity Log alerts for configuration changes; budget alerts; v2 API structured logging without personal data |
| **A10:2025 Mishandling of Exceptional Conditions** | Error handling | Root error boundary with a generic message; custom 404; WebGL/feature-detection failures degrade to the static fallback (fail safe, not fail open); v2 API returns generic errors and fails closed when limits or providers are unavailable |

---

## 7. Secrets management

**Rule:** secrets, API keys, credentials and connection strings are **never** committed to Git and **never** shipped to the browser.

| Secret | Where it lives | Who can use it |
|---|---|---|
| SWA deployment token | GitHub **Environment secret** on the `production` environment (not a repository-wide secret) | Only the deploy job, only from `main`, optionally after manual approval |
| Future LLM API key (v2) | Azure Function **application settings** (or Key Vault reference) | The server-side function only |
| Local development values | `.env.local` (git-ignored) | Developer machine only |

Practices:
- `.gitignore` excludes `.env*` (except `.env.example`), `*.pem`, `*.key`, `local.settings.json`, `.azure/`.
- **Everything prefixed `VITE_` is public.** It's compiled into client JavaScript. Never put a secret behind a `VITE_` variable.
- GitHub **secret scanning** and **push protection** are enabled on the repository.
- **On a leak:** revoke/rotate first, then clean history, then review access logs. Treat a once-public secret as compromised forever.
- Rotate the SWA deployment token at least every 6 months and whenever a maintainer or tool loses access.

---

## 8. Transport security, headers and CSP

All headers are defined in version-controlled `config/staticwebapp.config.base.json` and finalised at build time (see ARCHITECTURE §13).

### 8.1 HTTPS

- `.dev` is on the browser HSTS preload list at the TLD level, so browsers refuse plain HTTP for `moylanos.dev`.
- Azure Static Web Apps issues and renews free TLS certificates for custom domains.
- Header: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

### 8.2 Security headers (global)

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | see §8.3 | Script/style/resource allow-list |
| `Strict-Transport-Security` | as above | Enforce HTTPS |
| `X-Content-Type-Options` | `nosniff` | Block MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit URL leakage to other sites |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` | Disable powerful features the site doesn't use |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolate the browsing context |
| `Cross-Origin-Resource-Policy` | `same-origin` | Prevent other sites embedding our resources |
| `X-Frame-Options` | `DENY` | Legacy clickjacking defence (CSP `frame-ancestors` is primary) |

Hashed build assets (`/assets/*`) are served with `Cache-Control: public, max-age=31536000, immutable`. HTML is revalidated on every request.

### 8.3 Content Security Policy

```
default-src 'none';
script-src 'self' <build-generated sha256 hashes of inline scripts>;
style-src 'self';
img-src 'self';
font-src 'self';
connect-src 'self';
manifest-src 'self';
base-uri 'none';
form-action 'self';
frame-ancestors 'none';
object-src 'none';
upgrade-insecure-requests
```

- **No `unsafe-inline`, no `unsafe-eval`.** React Router's prerendered pages contain a few small inline bootstrap scripts. A post-build step computes their SHA-256 hashes and writes them into the CSP. Any unexpected inline script is blocked.
- **No inline `style` attributes in prerendered HTML.** Per-agent colours use `data-agent` attributes and CSS classes. Runtime style changes made by JavaScript (GSAP, later milestones) use the CSSOM and are permitted.
- Fonts and all assets are **self-hosted**: no Google Fonts, CDNs or third-party origins.
- Future additions are deliberate, reviewed CSP changes. If shape generation moves to a Web Worker, the only addition is `worker-src 'self'`: Vite emits workers as hashed same-origin files. **`blob:` workers are not permitted** unless a specific technical need is documented and reviewed (ARCHITECTURE §9.4). The v2 API stays same-origin under `connect-src 'self'`.
- A Playwright test serves the production build with the real headers and fails on any CSP violation.
- Planned hardening: evaluate Trusted Types (`require-trusted-types-for 'script'`) in report-only mode after the 3D milestones.

---

## 9. Application-level controls

- **Rendering:** React escapes all interpolated text. `dangerouslySetInnerHTML` is banned by lint rule; any future exception needs a sanitiser and review.
- **Content:** portfolio data is typed TypeScript compiled at build time. There's no runtime content fetching from third parties.
- **Links:** outbound links go through `ExternalLink`, which always applies `target="_blank" rel="noopener noreferrer"` after caller props (they can't be overridden) and renders anything that isn't an absolute `https:` URL (e.g. `javascript:`, `data:`) as plain text. URLs come only from reviewed content files.
- **Errors (A10):** a root `ErrorBoundary` renders a generic, accessible message and a link home; stack traces appear only in development. Unknown routes return the custom 404 page.
- **Graceful degradation:** the 3D layer is a separate lazy chunk behind an error boundary in `StageMount`. Load failures, WebGL creation failure, context loss and low capability fall back to the static experience (ARCHITECTURE §9.4). Capability detection is local, with no third-party requests. Failures never block content.
- **Source maps:** not published in production builds.
- **Files:** the CV PDF and images are exported with metadata removed and contain no unnecessary personal data (see PRIVACY-COMPLIANCE §6).

---

## 10. Supply chain, CI/CD and repository protection

### 10.1 Dependencies

- Exact versions recorded in `package-lock.json`; CI installs with `npm ci`.
- **Minimal dependency policy:** each new runtime dependency needs a stated reason (in the PR description) and a check of maintenance status, licence and size. Runtime dependencies added since Milestone 1: `zustand` 5.0.16 (Milestone 2.1; accepted in ADR-007; MIT; ≈ 1 KB gz; no runtime dependencies of its own); `three` 0.186.1 (Milestone 2.2; approved stack; MIT; lazy-loaded only, never in the initial bundle; no `eval`, workers, remote assets or CSP changes needed, since shaders are compiled by the GPU driver and every resource is generated locally). It was pinned to a release older than the 7-day Dependabot cooldown rather than the newest version. `@react-three/fiber` 9.8.2 was used from Milestone 2.2 and **removed in Milestone 2.4a** together with its transitive packages (`its-fine`, `react-use-measure`, `suspend-react`, `buffer`, `base64-js`, `ieee754`, `@types/react-reconciler`), replaced by project code (ARCHITECTURE §20).
- CI runs two audits and fails on high/critical advisories: `npm run audit:prod` (production dependencies) and `npm run audit:all` (the full tree, including build and test tooling, which runs with developer and CI privileges). Moderate dev-only advisories are fixed with scoped `overrides` where safe (e.g. `minimatch` under `typescript-eslint`) and otherwise tracked through Dependabot.
- **Dependabot** (`.github/dependabot.yml`): weekly version updates for `npm` and `github-actions`, grouped to limit PR noise, with a **cooldown** so brand-new releases aren't adopted on day one (reducing exposure to hijacked releases). Security updates are not subject to the cooldown.
- **Deferred majors:** major-version updates are ignored for exactly six packages (`eslint`, `@eslint/js`, `@types/node`, `react-router`, `@react-router/dev`, `@react-router/node`) for compatibility reasons recorded in ARCHITECTURE §2. The rules are scoped to `version-update:semver-major`, so minor and patch releases (including security fixes on the current major) still arrive. No broad or wildcard ignore rules are used.
- **Security takes precedence over deferral:** Dependabot alerts and both CI audits still report vulnerabilities in these packages. A vulnerability that can only be fixed by one of the excluded major upgrades **must be reviewed and prioritised despite the exclusion**: assess exposure, then either schedule the upgrade (and its migration) promptly or document an interim mitigation in the security advisory or PR.

### 10.2 GitHub Actions hardening

- Workflow-level `permissions: contents: read`; jobs elevate only what they need (e.g., `security-events: write` for CodeQL).
- Third-party actions **pinned to full-length commit SHAs**, with the version in a comment; Dependabot keeps them current.
- No `pull_request_target`. Untrusted context values (PR titles, branch names) are never interpolated directly into `run:` scripts.
- The deploy job (added at Phase 6, after approval) runs only on `main`, in the `production` environment with required reviewers, and uses the environment-scoped deployment token.

### 10.3 Security workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR, push to `main` | Install (`npm ci`), production + full-tree audits, format, lint, typecheck, unit tests, build (CSP generation, output checks, bundle budgets), Playwright e2e + axe + CSP-violation check |
| `codeql.yml` | PR, push to `main`, weekly | Static analysis (`javascript-typescript`, `actions`) |
| `dependency-review.yml` | PR | Blocks PRs introducing vulnerable (≥ moderate) or disallowed-licence dependencies |
| Dependabot | weekly | Dependency + action updates |

### 10.4 Repository settings (to enable when the repository is published)

- **Secret scanning** and **push protection**: on.
- **Private vulnerability reporting**: on.
- **Dependabot alerts and security updates**: on.
- **Code scanning default/advanced setup**: via `codeql.yml`.
- **Ruleset on `main`:**
  - Require a pull request before merging (self-review is fine for a solo project; the PR exists so checks run).
  - Require status checks to pass: `ci`, `codeql`, `dependency-review`; branch must be up to date.
  - Block force pushes; restrict deletions.
  - Require linear history (squash merges).
  - Require code scanning results (block on high/critical alerts).
  - Require signed commits (recommended; set up SSH or GPG commit signing first).
- **Actions settings:** allow only GitHub-authored actions and an explicit allow-list; default `GITHUB_TOKEN` permissions = read; don't allow Actions to create or approve PRs.
- **Account:** passkey/security-key MFA; review authorised OAuth/GitHub apps regularly.

---

## 11. Azure deployment security

### 11.1 Resource layout and least privilege

- A **dedicated resource group** contains only MOYLAN//OS resources. Nothing else shares its permissions or lifecycle.
- **Azure Static Web Apps Free plan** for v1: static content, global distribution, free managed TLS. Standard is only considered if a requirement appears (SLA, private endpoints, custom auth providers, IP restrictions).
- **Deployment authorisation:** the SWA **deployment token** (Microsoft's recommended policy), scoped to this one static web app, stored as a GitHub *Environment* secret. GitHub never holds Azure subscription-level credentials, so a compromised workflow can at most redeploy the site, not touch other Azure resources.
- **Human access:** the owner account uses phishing-resistant MFA. Day-to-day work uses the narrowest role that suffices (e.g., *Contributor* scoped to the resource group, not *Owner* on the subscription). No standing access for third parties.
- **Resource lock** (`CanNotDelete`) on the resource group to prevent accidental deletion (and with it, dangling-DNS takeover risk).
- **Activity Log alerts** on configuration changes, custom-domain changes and role assignments.
- **Budget alert** on the subscription and resource group (e.g., notify at 50% / 80% / 100% of a small monthly amount).
- **Microsoft Defender for Cloud** free (foundational CSPM) recommendations reviewed before launch.

### 11.2 Domain and DNS

- Registrar account with MFA, transfer lock and auto-renew.
- Apex `moylanos.dev` via `ALIAS`/`ANAME`/CNAME flattening (or Azure DNS), per Microsoft guidance; `www` redirects to the apex.
- `CAA` records restrict certificate issuance to the CA used by Azure Static Web Apps (confirm the current issuing CA before setting).
- **Decommissioning order:** remove DNS records → remove the custom domain → delete the resource. Never leave a CNAME pointing at a deleted Azure hostname.

### 11.3 Preview environments

SWA creates pre-production environments for pull requests. These URLs are publicly reachable, so previews must contain nothing that isn't fit for production (no draft confidential content). Close PRs to clean them up. For a public repository, PRs from forks don't receive the deployment token.

---

## 12. Future AI agents (Version 2) — security design

The optional conversational agents are designed now so they can be added safely later. Aligned with the **OWASP Top 10 for LLM Applications 2025**.

| Risk (OWASP LLM 2025) | Control |
|---|---|
| **LLM01 Prompt Injection** | The model has **no tools, no write access and no secrets** to misuse (minimal agency). Retrieved context comes only from the site's own reviewed content. User input is delimited and treated as data. Outputs are rendered as plain text, never HTML or executable content. Responses are scope-limited to portfolio topics. |
| **LLM02 Sensitive Information Disclosure** | The context corpus is public portfolio content only. No visitor data from other sessions. No personal data in logs. |
| **LLM05 Improper Output Handling** | Output rendered as text through React (escaped); links only allowed if they match the site's own routes; length-capped. |
| **LLM06 Excessive Agency** | No function calling or external actions in v2. Any future tool requires a new threat review. |
| **LLM07 System Prompt Leakage** | System prompts contain no secrets or access-control logic, so leakage is low-impact by design. |
| **LLM09 Misinformation** | Answers are grounded in site content with links to the canonical page. A visible disclosure explains that responses are AI-generated and may be wrong. Agents don't invent claims about Alex. |
| **LLM10 Unbounded Consumption** | Per-IP and global rate limits; max input length (e.g., 500 characters) and max output tokens; per-day request quota; **provider-side hard spend cap** plus Azure budget alert; the feature fails closed (chat disabled, site unaffected) when limits are hit. |
| LLM03/LLM04 Supply chain, poisoning | Reputable provider under a data-processing agreement; corpus built from the repository at build time, reviewed via PR. |
| LLM08 Vector/embedding weaknesses | Small, public, read-only corpus; no visitor content is ever embedded. |

Additional controls:
- **Server-side only:** the browser calls same-origin `/api/agent`. The provider key lives only in function app settings or Key Vault.
- **Input validation:** a JSON schema (type, length, allowed agent IDs) is checked before any provider call; unexpected fields are rejected.
- **Abuse protection:** rate limiting without third-party CAPTCHAs if possible (privacy). Consider a lightweight proof-of-work or honeypot first.
- **Errors:** generic messages to the client; detailed but non-personal diagnostics server-side.
- **Privacy:** see PRIVACY-COMPLIANCE §8 (no prompt retention by default, provider no-training terms, disclosure before first use).
- **Kill switch:** an app setting that disables the chat instantly without redeploying the site.

---

## 13. Pre-deployment security and compliance gate

**Every item must pass before any public deployment** (including the first). Record the outcome in the release PR.

### Code and build
- [ ] CI is green on `main`: lint, typecheck, unit, build, e2e, axe, CSP-violation test.
- [ ] `npm run audit:prod` and `npm run audit:all` report no high/critical issues.
- [ ] CodeQL: no open high/critical alerts.
- [ ] No secrets in the repository (secret-scanning alerts resolved; a manual `git log -p` review of new config files).
- [ ] No production source maps; no debug logging; no `dangerouslySetInnerHTML`.
- [ ] Bundle contains no environment-specific identifiers or private data (inspect `build/client`).

### Hosting and headers
- [ ] `staticwebapp.config.json` deployed with all headers in §8.2; config file < 20 KB.
- [ ] Verified on the preview environment: CSP enforced with no violations; HSTS present; 404 page returns HTTP 404; unknown routes don't leak a directory listing or stack trace.
- [ ] External scan of the preview URL with a security-header checker and an SSL test shows no errors.
- [ ] `/.well-known/security.txt` present with valid `Contact` and `Expires`.

### Accounts and infrastructure
- [ ] Phishing-resistant MFA on GitHub, Azure and the domain registrar.
- [ ] Repository ruleset, secret scanning, push protection, private vulnerability reporting and Dependabot enabled.
- [ ] Deployment token stored only as a `production` environment secret; environment protection configured.
- [ ] Azure budget alerts and Activity Log alerts configured; resource lock applied.
- [ ] DNS: registrar lock, CAA records, no dangling records; custom domain validated with a TLS certificate issued.

### Privacy and compliance (from PRIVACY-COMPLIANCE.md)
- [ ] The site sets **no cookies** and uses **no web storage** (local/session storage, IndexedDB, Cache Storage, service workers), except items documented as strictly necessary. Automated tests cover the site's own code; additionally verify **on the Azure preview environment** that the platform sets no cookies (DevTools → Application on every route).
- [ ] Browser-caching explanation and the ekomloven § 3-15 exemption assessment (PRIVACY-COMPLIANCE §4.1) reviewed against current Nkom/Datatilsynet guidance.
- [ ] No requests to third-party origins (verify in DevTools → Network).
- [ ] Privacy notice published at `/privacy` and linked from every page footer, with controller identity and contact filled in.
- [ ] CV and images: metadata stripped; no unnecessary personal data (home address, date of birth, national ID number).
- [ ] No confidential employer/client information; every "completed" project claim has evidence.
- [ ] Record of processing / privacy notes updated for any new data flow.

### Accessibility and quality (from DESIGN-BRIEF / ARCHITECTURE)
- [ ] axe: zero violations; keyboard-only journey passes; reduced-motion and no-WebGL modes pass.
- [ ] Lighthouse targets met (ARCHITECTURE §9.3).

---

## 14. References

- OWASP Top 10:2025: <https://top10.owasp.org/2025/>
- OWASP Top 10 for LLM Applications 2025: <https://genai.owasp.org/llm-top-10/>
- OWASP Secure Headers Project and CSP Cheat Sheet: <https://owasp.org/www-project-secure-headers/>, <https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html>
- Azure Static Web Apps configuration: <https://learn.microsoft.com/azure/static-web-apps/configuration>
- Azure Static Web Apps plans: <https://learn.microsoft.com/azure/static-web-apps/plans>
- Azure Static Web Apps custom domains: <https://learn.microsoft.com/azure/static-web-apps/custom-domain>
- Azure Static Web Apps build configuration (deployment authorisation): <https://learn.microsoft.com/azure/static-web-apps/build-configuration>
- Preventing dangling DNS / subdomain takeover: <https://learn.microsoft.com/azure/security/fundamentals/subdomain-takeover>
- GitHub Actions security hardening: <https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions>
- GitHub secret scanning: <https://docs.github.com/code-security/secret-scanning/introduction/about-secret-scanning>
- Dependabot configuration options: <https://docs.github.com/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file>
- Rulesets: <https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>
- RFC 9116 (security.txt): <https://www.rfc-editor.org/rfc/rfc9116>
