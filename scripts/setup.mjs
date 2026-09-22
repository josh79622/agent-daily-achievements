// Step one of the install instructions (docs/plans/2026-09-21-task-s2-setup-command-test-cases.md):
// reads the Mac's system timezone, writes data/report-timezone.json, and
// prints what it stored. An existing file is kept, not overwritten; pass
// `--force <zone>` to replace it with an explicit IANA zone.
//
// Not run automatically by anything in this repository (not `npm run
// check`, not `npm run build`) — the owner runs it by hand:
//
//   npm run setup
//   npm run setup -- --force Asia/Taipei

import { resolve } from "node:path";

import { setupReportTimeZone } from "../src/storage/report-timezone.js";
import { setupSummaryPermission } from "../src/storage/summary-permission.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const timeZonePath = resolve(repositoryRoot, "data/report-timezone.json");
const summaryPermissionPath = resolve(
  repositoryRoot,
  "data/summary-permission.json",
);

const force = parseForce(process.argv.slice(2));

const tzResult = await setupReportTimeZone({ path: timeZonePath, force });

switch (tzResult.status) {
  case "written":
    console.log(
      `${tzResult.replacedCorrupt ? "Replaced a corrupt file, now" : "Stored"} report timezone: ${tzResult.timeZone} (${timeZonePath})`,
    );
    break;
  case "kept":
    console.log(`Kept the existing report timezone: ${tzResult.timeZone}`);
    break;
  case "no-timezone":
    console.error(
      "Could not determine the system timezone. Run again with an explicit zone: npm run setup -- --force <IANA zone>",
    );
    process.exit(1);
    break;
  case "invalid-explicit":
    console.error(`Not a valid IANA timezone: ${tzResult.value}`);
    process.exit(1);
    break;
  case "write-failed":
    console.error(`Failed to write ${timeZonePath}.`);
    process.exit(1);
    break;
}

const permissionResult = await setupSummaryPermission({
  path: summaryPermissionPath,
});

switch (permissionResult.status) {
  case "written":
    console.log(
      `Stored default summary permission: preferred ${permissionResult.permission.preferredCli ?? "none"}, sources: ${permissionResult.permission.sourceScope.join(", ")} (${summaryPermissionPath})`,
    );
    break;
  case "kept":
    console.log(
      `Kept existing summary permission: preferred ${permissionResult.permission.preferredCli ?? "none"}, sources: ${permissionResult.permission.sourceScope.join(", ")}`,
    );
    break;
  case "write-failed":
    console.error(`Failed to write ${summaryPermissionPath}.`);
    process.exit(1);
    break;
}

process.exit(0);

/** @param {string[]} args */
function parseForce(args) {
  const index = args.indexOf("--force");
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) {
    console.error("--force requires a timezone argument.");
    process.exit(1);
  }
  return value;
}
