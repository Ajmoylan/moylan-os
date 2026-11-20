/**
 * Dependency-audit policy for the full tree, development tooling included (SECURITY.md §10).
 * Every high or critical advisory fails CI, except those on the short, dated allow-list below.
 * An allow-listed advisory still fails CI once its expiry date has passed, and an exception
 * nobody needs any more (the advisory no longer applies, e.g. after a patched release) also fails,
 * so exceptions are always removed. The production audit (`npm run audit:prod`) has no exceptions.
 */

/** @type {readonly { id: string; package: string; expires: string; reason: string }[]} */
export const AUDIT_EXCEPTIONS = [];

const BLOCKING = new Set(["high", "critical"]);

/** The advisories in an `npm audit --json` report: { id, package, severity, title }. */
export function advisoriesIn(report) {
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object" || via === null) continue; // a dependency path, not an advisory
      const id = /GHSA-[a-z0-9-]+/i.exec(via.url ?? "")?.[0] ?? `npm-${via.source}`;
      found.set(id, { id, package: via.name, severity: via.severity, title: via.title });
    }
  }
  return [...found.values()];
}

/**
 * Apply the policy. Returns the problems that must fail CI (empty when the audit passes) and the
 * exceptions currently in use (for the log).
 */
export function evaluateAudit(report, { today = new Date(), exceptions = AUDIT_EXCEPTIONS } = {}) {
  const day = today.toISOString().slice(0, 10);
  const advisories = advisoriesIn(report);
  const problems = [];
  const used = [];
  for (const advisory of advisories.filter((a) => BLOCKING.has(a.severity))) {
    const exception = exceptions.find(
      (e) => e.id === advisory.id && e.package === advisory.package,
    );
    if (!exception) {
      problems.push(`${advisory.severity}: ${advisory.id} (${advisory.package}) ${advisory.title}`);
    } else if (day > exception.expires) {
      problems.push(
        `${advisory.id} (${advisory.package}): its audit exception expired on ${exception.expires}. Fix it or review the exception.`,
      );
    } else {
      used.push(`${advisory.id} (${advisory.package}), until ${exception.expires}`);
    }
  }
  for (const exception of exceptions) {
    if (!advisories.some((a) => a.id === exception.id)) {
      problems.push(
        `${exception.id} (${exception.package}) no longer applies: remove its audit exception (scripts/audit-policy.mjs, SECURITY.md).`,
      );
    }
  }
  return { problems, used };
}
