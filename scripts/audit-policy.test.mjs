// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AUDIT_EXCEPTIONS, advisoriesIn, evaluateAudit } from "./audit-policy.mjs";

const advisory = (id, name, severity) => ({
  source: 1,
  name,
  severity,
  title: `${name} problem`,
  url: `https://github.com/advisories/${id}`,
});
const report = (...vias) => ({
  vulnerabilities: Object.fromEntries(
    vias.map((via, i) => [
      via.name ?? `pkg${i}`,
      { severity: via.severity, via: [via, "some-parent"] },
    ]),
  ),
});
const PICOMATCH = advisory("GHSA-fc5q-39xc-vjpf", "picomatch", "high");
const BEFORE = new Date("2026-11-17T12:00:00Z");

describe("dependency audit policy", () => {
  it("allows only the one dated exception (GHSA-fc5q-39xc-vjpf in picomatch, until 31 Dec 2026)", () => {
    expect(AUDIT_EXCEPTIONS.map((e) => [e.id, e.package, e.expires])).toEqual([
      ["GHSA-fc5q-39xc-vjpf", "picomatch", "2026-12-31"],
    ]);
    expect(evaluateAudit(report(PICOMATCH), { today: BEFORE })).toEqual({
      problems: [],
      used: ["GHSA-fc5q-39xc-vjpf (picomatch), until 2026-12-31"],
    });
  });

  it("still fails on every other high or critical advisory", () => {
    const other = advisory("GHSA-aaaa-bbbb-cccc", "left-pad", "critical");
    const { problems } = evaluateAudit(report(PICOMATCH, other), { today: BEFORE });
    expect(problems).toEqual(["critical: GHSA-aaaa-bbbb-cccc (left-pad) left-pad problem"]);
    // The same advisory id in a different package isn't covered either.
    const moved = advisory("GHSA-fc5q-39xc-vjpf", "micromatch", "high");
    expect(evaluateAudit(report(PICOMATCH, moved), { today: BEFORE }).problems).toHaveLength(1);
  });

  it("ignores low and moderate advisories, as before", () => {
    const minor = advisory("GHSA-1111-2222-3333", "tiny", "moderate");
    expect(evaluateAudit(report(PICOMATCH, minor), { today: BEFORE }).problems).toEqual([]);
  });

  it("fails automatically once the exception has expired", () => {
    const { problems } = evaluateAudit(report(PICOMATCH), {
      today: new Date("2027-01-01T00:00:00Z"),
    });
    expect(problems).toEqual([
      "GHSA-fc5q-39xc-vjpf (picomatch): its audit exception expired on 2026-12-31. Fix it or review the exception.",
    ]);
    expect(
      evaluateAudit(report(PICOMATCH), { today: new Date("2026-12-31T23:00:00Z") }).problems,
    ).toEqual([]);
  });

  it("fails when the exception is no longer needed (e.g. a patched release), so it gets removed", () => {
    expect(evaluateAudit({ vulnerabilities: {} }, { today: BEFORE }).problems).toEqual([
      "GHSA-fc5q-39xc-vjpf (picomatch) no longer applies: remove its audit exception (scripts/audit-policy.mjs, SECURITY.md).",
    ]);
  });

  it("reads advisories, not dependency paths, from npm's report", () => {
    expect(advisoriesIn(report(PICOMATCH)).map((a) => a.id)).toEqual(["GHSA-fc5q-39xc-vjpf"]);
  });
});
