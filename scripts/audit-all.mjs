/**
 * `npm run audit:all`: audits the full dependency tree (development tooling included) and applies
 * the policy in audit-policy.mjs. Exits 1 on any high or critical advisory without a valid,
 * unexpired exception, or on an exception that is no longer needed.
 */
import { execFileSync } from "node:child_process";
import { evaluateAudit } from "./audit-policy.mjs";

let output;
try {
  output = execFileSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  // npm audit exits non-zero when it finds anything; its JSON report is still on stdout.
  output = error.stdout;
  if (!output) throw error;
}
const report = JSON.parse(output);
if (report.error) {
  console.error(
    `✖ audit:all: npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`,
  );
  process.exit(1);
}
const { problems, used } = evaluateAudit(report);
for (const line of used) console.log(`! audit:all: allowed by a dated exception: ${line}`);
if (problems.length > 0) {
  for (const line of problems) console.error(`✖ audit:all: ${line}`);
  process.exit(1);
}
console.log("✔ audit:all: no high or critical advisories outside the dated exceptions.");
