# MOYLAN//OS — Privacy and Compliance

**Status:** v0.3 · 7 November 2026 · applies from Milestone 1 onward (v0.3: browser-caching correction after independent review)
**Companion documents:** [`SECURITY.md`](SECURITY.md) (including the pre-deployment gate in §13) · [`ARCHITECTURE.md`](ARCHITECTURE.md)

> **Not legal advice.** This document records the project's privacy design decisions and the regulatory sources they rely on. Have anything uncertain checked against current guidance from Datatilsynet and Nkom, or by a qualified adviser, before launch. Items marked **⚠ verify** weren't confirmed from primary sources while this was written.

---

## 1. Summary: privacy by design in Version 1

MOYLAN//OS v1 is designed so that **almost no visitor personal data is processed at all**:

| Decision | v1 |
|---|---|
| Cookies | **None** |
| `localStorage` / `sessionStorage` / IndexedDB / Cache Storage / service workers | **None** in Milestone 1 (verified by automated tests on every build); any later use is limited to strictly necessary, user-requested preferences (§4.3) |
| Browser HTTP cache | **Yes, ordinary first-party caching** of the site's own files, controlled by `Cache-Control` headers (§4.1). Assessed as exempt from consent ⚠ verify |
| Analytics / tracking pixels / fingerprinting | **None** |
| Third-party scripts, fonts, embeds, CDNs | **None**: everything is self-hosted and same-origin |
| Forms, accounts, databases | **None** |
| Contact | `mailto:` link and links to LinkedIn/GitHub (no form) |
| Consent banner | **Not planned**, because nothing that requires consent is stored on or read from the visitor's device. Ordinary caching is assessed as falling within the § 3-15 exemptions (§4.1) ⚠ verify before launch |
| Personal data processed | Only what any web host must process to deliver pages (IP address, request metadata) by Microsoft Azure as hosting provider, plus emails visitors choose to send |

This follows the GDPR principles of **data minimisation** and **data protection by design and by default** (GDPR Articles 5(1)(c) and 25).

---

## 2. Applicable law and authorities

| Instrument | Relevance | Source |
|---|---|---|
| **GDPR**, incorporated into Norwegian law through the EEA Agreement | Any processing of visitors' personal data (IP addresses are generally personal data) | <https://lovdata.no/dokument/NL/lov/2018-06-15-38> |
| **Personopplysningsloven** (LOV-2018-06-15-38) | Gives GDPR effect as Norwegian law; § 5 sets the age of consent for information society services at **13** | <https://lovdata.no/dokument/NL/lov/2018-06-15-38/%C2%A75> |
| **Ekomloven** (LOV-2024-12-13-76), **§ 3-15** "Bruk av informasjonskapsler mv.", in force 1 January 2025 | Storing or reading *any* information on a visitor's device (cookies, local storage, pixels, fingerprinting) requires **prior consent meeting the GDPR consent standard**, whether or not the information is personal data. Narrow exemptions: (a) solely to transmit a communication, (b) strictly necessary to provide a service the user has explicitly requested. Browser settings are no longer valid consent. | <https://lovdata.no/dokument/NL/lov/2024-12-13-76/%C2%A73-15> |
| **Nkom** guidance on cookies (16 May 2025) | Exemptions are narrow ("Unntakene fra kravet til samtykke er snevre"); consent must be freely given, specific, informed, unambiguous, demonstrable and as easy to withdraw as to give | <https://www.nkom.no/internett/informasjonskapsler-cookies> |
| **Datatilsynet** guidance on cookies and tracking (updated 3 April 2025) | Consent *before* placement; rejecting must be as easy as accepting; legitimate interest can't replace consent for device storage/access | <https://www.datatilsynet.no/personvern-pa-ulike-omrader/internett-og-apper/bruk-av-informasjonskapsler-og-andre-sporingsteknologier/> |
| **Datatilsynet** advice on analytics (updated 23 April 2025) and the 2023 Google Analytics decision | "In practice you must collect valid prior consent" to use tracking tools; IP addresses are generally personal data; check transfers outside the EEA | <https://www.datatilsynet.no/personvern-pa-ulike-omrader/internett-og-apper/rad-for-analyse-og-sporing-pa-nettsted/> |

**Supervision:** Datatilsynet and Nkom share supervision of ekomloven § 3-15. Nkom assesses whether a technique is covered and whether an exemption applies; Datatilsynet assesses whether information and consent meet GDPR. Datatilsynet supervises GDPR generally and receives complaints and breach notifications.

**Scope note:** the site is a professional portfolio published to support Alex Moylan's career. It is treated as **in scope** of GDPR (not relying on the "purely personal or household activity" exemption in Article 2(2)(c)).

**Controller:** Alex Moylan (contact details are published in the privacy notice at launch, not in this repository).

---

## 3. Data inventory (record of processing)

A lightweight record is kept even though Article 30(5) may exempt a private individual. It makes changes reviewable.

| # | Processing | Data | Purpose | Legal basis | Processor / recipients | Retention | Status |
|---|---|---|---|---|---|---|---|
| P1 | Web hosting and delivery | IP address, request URL, user agent, timestamp, response metadata | Deliver the website; keep it secure and available | GDPR Art. 6(1)(f) legitimate interests (operating a secure website) | Microsoft (Azure Static Web Apps) under the Microsoft Products and Services Data Protection Addendum | Platform-defined; the controller does **not** enable additional request logging or Application Insights in v1. **⚠ verify** current Microsoft retention terms | v1 |
| P2 | Email from visitors | Name, email address, message content | Reply to enquiries (recruitment, collaboration) | Art. 6(1)(f), or 6(1)(b) steps prior to a contract at the visitor's request | Alex's email provider | Delete within 12 months after the conversation ends unless an engagement follows | v1 |
| P0 | First-party browser HTTP cache | The site's public files only; no personal data | Deliver requested pages efficiently | Not personal data; ekomloven § 3-15(2) exemption assessment in §4.1 ⚠ verify | None (visitor's browser) | Per `Cache-Control` (≤ 1 year for hashed assets; HTML revalidated every visit) | v1 |
| P3 | Motion/display preference (if persisted) | `motion: full \| reduced \| off`, no identifier | Remember an accessibility preference the visitor explicitly set | Not personal data; ekomloven § 3-15(2)(b) exemption assessment in §4.3 | None (stays in the visitor's browser) | Until the visitor changes or clears it | Milestone 2+, decision pending |
| P4 | Optional AI agent chat | Visitor's typed questions, IP address (rate limiting) | Answer questions about the portfolio | Art. 6(1)(f) | Azure Functions + LLM provider (DPA required) | Prompts not stored by default; rate-limit counters ≤ 24 h | Version 2, not built |
| P5 | Optional contact form | Name, email, message | As P2 | As P2 | Azure Functions + email delivery service | As P2 | Not planned for v1 |
| P6 | Optional analytics | See §5 | Understand aggregate site usage | Consent (§5) | TBD | TBD | Not in v1 |

Every new data flow requires updating this table, the privacy notice and the release gate **before** deployment.

---

## 4. Cookies and device storage

### 4.1 Version 1 position

**What the site itself does not use** (asserted by the Playwright suite on every route, desktop and mobile): cookies, `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service workers, or requests to third-party origins. React Router's default `<ScrollRestoration>` was replaced because it writes to `sessionStorage` (ARCHITECTURE ADR-010).

**What does happen: ordinary first-party HTTP caching.** Every browser stores copies of files it downloads in its HTTP cache. Ekomloven § 3-15 is technology-neutral ("storing information, or gaining access to information already stored, in the user's terminal equipment"), so this is acknowledged rather than ignored. The site controls caching only through response headers:

| Resource | `Cache-Control` | Effect |
|---|---|---|
| HTML pages | `no-cache` | Browser may keep a copy but must revalidate with the server on every visit |
| Hashed build assets (`/assets/*`: JS, CSS, fonts) | `public, max-age=31536000, immutable` | Reused for up to a year; filenames change whenever content changes |
| Other static files | platform default | |

Characteristics: first-party only; contains only the site's own public files (no identifiers, no visitor data); never read back by site code for any purpose other than displaying the requested pages; no `ETag`- or cache-based tracking techniques are used; visitors can clear it in their browser at any time.

**Assessment.** Caching the files needed to render the pages a visitor explicitly navigates to is considered to fall within the § 3-15 second-paragraph exemptions: storage/access *solely to transmit a communication* and/or *strictly necessary to provide an information society service explicitly requested by the user*. This is consistent with the EDPB/WP29 treatment of technical storage strictly required for delivering requested content. Nkom states that the exemptions are narrow, so:
- the long-lived (`immutable`) cache applies only to content-hashed public assets, whose purpose is delivery performance, not visitor recognition;
- the privacy notice explains caching in plain language without claiming that "nothing is stored on your device";
- no consent banner is shown, because none of the site's own behaviour requires consent. **⚠ Verify** this assessment against current Nkom/Datatilsynet guidance (or with a qualified adviser) before launch, and record the outcome here.

**Platform behaviour.** Azure Static Web Apps sets no authentication cookies unless `/.auth` features are used (they aren't). **⚠ Verify** on the first preview environment that no platform cookies are set (DevTools → Application → Cookies on every route), as required by the release gate (SECURITY.md §13).

### 4.2 Rules for any future storage

1. Default to **not storing anything**. Use the visitor's OS setting (`prefers-reduced-motion`) instead of a stored preference where possible.
2. If storage is needed, classify it against ekomloven § 3-15 before shipping:
   - **Exempt** only if strictly necessary for a service the visitor explicitly requested.
   - **Otherwise:** prior opt-in consent meeting the GDPR standard, with no pre-ticked boxes or consent by scrolling, "Reject" as prominent as "Accept", and withdrawal as easy as giving consent. Nothing is set before consent.
3. Document every item (name, purpose, duration, exemption or consent basis) in the privacy notice.
4. Re-run the DevTools verification from SECURITY.md §13 on every route.

### 4.3 Planned motion preference (Milestone 2+): assessment

The DESIGN-BRIEF calls for a visible motion toggle (Full / Reduced / Off). Proposed handling:
- The toggle works **for the current page view without any storage**.
- Persisting the choice in `localStorage` happens **only after the visitor actively changes the toggle**. The stored value is a single non-identifying preference that isn't shared with anyone. Choosing **System** (the default, which follows the OS setting) removes the stored value (ARCHITECTURE §10, motion preference policy).
- The assessment is that this is *strictly necessary to provide a function the user has explicitly requested* (remembering their accessibility choice), comparable to the "user-interface customisation" exemption in the EDPB/WP29 cookie-exemption guidance. Nkom stresses that the exemptions are narrow, so this is disclosed in the privacy notice and stays minimal.
- **Conservative alternative** if you prefer zero storage: don't persist the toggle; rely on `prefers-reduced-motion` across visits.

---

## 5. Analytics

**v1: no analytics.** Azure provides aggregate platform metrics (requests, bandwidth) to the subscription owner. These involve no tracking code on visitors' devices.

If analytics are wanted later, options in order of preference:

| Option | Device storage/access? | Consent needed? | Assessment |
|---|---|---|---|
| A. None; use Azure platform metrics and LinkedIn/GitHub referral insights | No | No | **Recommended** for a portfolio |
| B. Cookieless, privacy-focused analytics, self-hosted or EU-hosted, no cross-site tracking | Usually reads device/browser information via script | **Assume yes** (Datatilsynet: consent is needed "in practice" for tracking tools) unless a documented exemption analysis concludes otherwise | Acceptable *with* consent, a DPA, and an EEA-only processing location |
| C. Google Analytics, Application Insights browser SDK, Meta/LinkedIn pixels | Yes (cookies/identifiers) | Yes | **Not recommended:** consent banner, third-party transfers, CSP relaxation, performance cost |

Any analytics requires: a consent mechanism built to §4.2 standards, a CSP change review, a privacy-notice update and a transfer assessment.

---

## 6. Content-related privacy and confidentiality

- **Alex's own data:** the CV and About page contain only what's needed professionally. **Exclude** home address, date of birth, national identity number (fødselsnummer) and personal phone number unless deliberately chosen. Strip PDF and image metadata (author, GPS, device).
- **Third parties:** no names, photos, quotes or testimonials of colleagues or clients without their permission. No confidential employer or client information (also covered by the truthfulness rules in DESIGN-BRIEF §10).
- **Medical imaging (SYN / bowel MRI segmentation project):** health data is a *special category* under GDPR Article 9. Publish **no patient images or data** unless they come from a public dataset whose licence allows redistribution and that is properly anonymised, or use synthetic/illustrative visuals. Cite the dataset and its licence on the case study.
- **AI Communications Assistant demo:** if a live demo ever accepts visitor input, it falls under Version 2 rules (§8).
- **Screenshots:** check for personal data, internal URLs, tokens and customer names before publishing.

---

## 7. Third-party services and international transfers

| Service | Role | Data | Transfer considerations |
|---|---|---|---|
| Microsoft Azure (Static Web Apps; Functions in v2) | Processor (hosting) | P1 (+ P4/P5 in v2) | SWA serves static content from a global edge network, so requests may be processed at edge locations outside the EEA. Microsoft's Products and Services DPA includes EU Standard Contractual Clauses, and Microsoft participates in the EU–US Data Privacy Framework and operates the EU Data Boundary. **⚠ verify** current terms and which SWA components fall under the EU Data Boundary. For v2 functions, choose an EEA region. |
| GitHub | Development platform (not a processor of visitor data) | None from visitors | n/a |
| Domain registrar / DNS provider | Infrastructure | DNS queries (resolvers, not the controller, see visitor IPs) | Choose a provider with an EEA presence and MFA |
| LinkedIn, GitHub (outbound links) | Independent controllers once a visitor clicks | None until clicked | Plain links only; no embedded widgets or "follow" buttons |
| LLM provider (v2) | Processor | Prompts | DPA, no-training-on-inputs commitment, zero or minimal retention, EEA processing where available |

**Self-hosting rule:** fonts, icons, images and scripts are served from `moylanos.dev`. Visitor IP addresses are never sent to font CDNs or other third parties merely by loading a page.

---

## 8. Version 2 AI agents: privacy design

- **Disclosure before first use:** a short notice in the chat panel says that messages are processed by an AI service, shouldn't contain personal information, and may produce errors, with a link to the privacy notice.
- **Data minimisation:** no accounts; no conversation history stored server-side by default; prompts aren't logged in full. Operational logs record counts, latencies and error codes only.
- **Rate limiting:** may use the IP address or a hash of it transiently (≤ 24 h). This is documented in the notice.
- **Provider terms:** a DPA is in place; inputs aren't used for training; minimal or zero retention; EEA processing where available.
- **Sensitive input:** the client warns against entering personal data; the server applies length limits and doesn't persist the content.
- **Children:** the service isn't directed at children. Personopplysningsloven § 5 (age 13) is noted, but consent isn't the legal basis for this processing.
- **DPIA screening:** carry out a written screening before launch of v2 (likely low risk; document the reasoning).
- **Kill switch:** chat can be disabled without affecting the rest of the site.

---

## 9. Data subject rights and incidents

- **Rights:** access, rectification, erasure, restriction, objection and data portability (GDPR Art. 15–21). In v1, the controller holds almost nothing beyond emails. Requests go to the contact address in the privacy notice and are answered within one month.
- **Complaints:** visitors may complain to **Datatilsynet** (<https://www.datatilsynet.no>).
- **Personal data breaches:** assess immediately. If a breach is likely to result in a risk to individuals, notify Datatilsynet within **72 hours** (GDPR Art. 33), and inform affected individuals where the risk is high (Art. 34). Record every breach, even when not notified. Security incident handling is in SECURITY.md.

---

## 10. Privacy notice (public page `/privacy`)

A plain-language notice is linked from every page footer. Required content (GDPR Art. 13):
1. Controller identity and contact.
2. What is processed (hosting data; emails you send), purposes and legal bases.
3. Recipients/processors (Microsoft Azure) and international transfer safeguards.
4. Retention periods.
5. A statement that the site uses no cookies, web storage, tracking or analytics, an accurate explanation of ordinary browser caching, and the § 3-15 exemption relied on (kept accurate as this changes).
6. Your rights and the right to complain to Datatilsynet.
7. Date of last update.

Milestone 1 ships a **draft** notice with clearly marked placeholders for the controller's contact details. The release gate blocks publishing until they're filled in.

---

## 11. Related compliance notes

- **Accessibility:** Norway's universal design rules for ICT (likestillings- og diskrimineringsloven § 18 and the associated regulation referencing WCAG) primarily target businesses and public bodies; whether they cover an individual's portfolio is **⚠ unverified**. MOYLAN//OS meets WCAG 2.2 AA regardless (DESIGN-BRIEF §7).
- **Ehandelsloven** (identification duties for information society services): likely not applicable to a non-commercial personal portfolio. **⚠ verify** before launch.
- **Domain:** `moylanos.dev` is the chosen public domain; a trademark/naming-conflict check is still recommended before launch (DESIGN-BRIEF §12).
- **Licences:** fonts (Geist, SIL Open Font License 1.1), npm dependencies (checked by dependency review) and any Higgsfield assets (verify commercial terms before use).

---

## 12. Change control

Any PR that adds a dependency loading remote resources, a cookie or storage key, an analytics tool, a form, an API or a new third-party service must:
1. update §3 and the privacy notice;
2. update the CSP and SECURITY.md where relevant;
3. pass the pre-deployment gate in SECURITY.md §13.
