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
const BEFORE = new Date("2026-11-17T12:00:00Z");

// A sample dated exception, so the policy's rules are tested independently of the live allow-list.
const SAMPLE = advisory("GHSA-xxxx-yyyy-zzzz", "glob-lib", "high");
const SAMPLE_EXCEPTION = {
  id: "GHSA-xxxx-yyyy-zzzz",
  package: "glob-lib",
  expires: "2026-12-31",
  reason: "Test fixture.",
};
const withSample = (today) => ({ today, exceptions: [SAMPLE_EXCEPTION] });

describe("dependency audit policy", () => {
  it("has no exceptions at present: every high or critical advisory fails CI", () => {
    expect(AUDIT_EXCEPTIONS).toEqual([]);
    // GHSA-fc5q-39xc-vjpf (picomatch) was allow-listed until GitHub withdrew it on 18 November 2026;
    // should it (or any other high advisory) reappear, CI fails again.
    const picomatch = advisory("GHSA-fc5q-39xc-vjpf", "picomatch", "high");
    expect(evaluateAudit(report(picomatch), { today: BEFORE })).toEqual({
      problems: ["high: GHSA-fc5q-39xc-vjpf (picomatch) picomatch problem"],
      used: [],
    });
    expect(evaluateAudit({ vulnerabilities: {} }, { today: BEFORE })).toEqual({
      problems: [],
      used: [],
    });
  });

  it("allows an advisory on the allow-list until its expiry date", () => {
    expect(evaluateAudit(report(SAMPLE), withSample(BEFORE))).toEqual({
      problems: [],
      used: ["GHSA-xxxx-yyyy-zzzz (glob-lib), until 2026-12-31"],
    });
  });

  it("still fails on every other high or critical advisory", () => {
    const other = advisory("GHSA-aaaa-bbbb-cccc", "left-pad", "critical");
    const { problems } = evaluateAudit(report(SAMPLE, other), withSample(BEFORE));
    expect(problems).toEqual(["critical: GHSA-aaaa-bbbb-cccc (left-pad) left-pad problem"]);
    // The same advisory id in a different package isn't covered either.
    const moved = advisory("GHSA-xxxx-yyyy-zzzz", "micromatch", "high");
    expect(evaluateAudit(report(SAMPLE, moved), withSample(BEFORE)).problems).toHaveLength(1);
  });

  it("ignores low and moderate advisories, as before", () => {
    const minor = advisory("GHSA-1111-2222-3333", "tiny", "moderate");
    expect(evaluateAudit(report(SAMPLE, minor), withSample(BEFORE)).problems).toEqual([]);
    expect(evaluateAudit(report(minor), { today: BEFORE }).problems).toEqual([]);
  });

  it("fails automatically once the exception has expired", () => {
    const { problems } = evaluateAudit(
      report(SAMPLE),
      withSample(new Date("2027-01-01T00:00:00Z")),
    );
    expect(problems).toEqual([
      "GHSA-xxxx-yyyy-zzzz (glob-lib): its audit exception expired on 2026-12-31. Fix it or review the exception.",
    ]);
    expect(
      evaluateAudit(report(SAMPLE), withSample(new Date("2026-12-31T23:00:00Z"))).problems,
    ).toEqual([]);
  });

  it("fails when the exception is no longer needed (e.g. a patched release or a withdrawn advisory), so it gets removed", () => {
    expect(evaluateAudit({ vulnerabilities: {} }, withSample(BEFORE)).problems).toEqual([
      "GHSA-xxxx-yyyy-zzzz (glob-lib) no longer applies: remove its audit exception (scripts/audit-policy.mjs, SECURITY.md).",
    ]);
  });

  it("reads advisories, not dependency paths, from npm's report", () => {
    expect(advisoriesIn(report(SAMPLE)).map((a) => a.id)).toEqual(["GHSA-xxxx-yyyy-zzzz"]);
  });
});
