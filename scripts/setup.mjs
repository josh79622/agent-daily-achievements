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

const repositoryRoot = resolve(import.meta.dirname, "..");
const path = resolve(repositoryRoot, "data/report-timezone.json");

const force = parseForce(process.argv.slice(2));

const result = await setupReportTimeZone({ path, force });

switch (result.status) {
  case "written":
    console.log(
      `${result.replacedCorrupt ? "Replaced a corrupt file, now" : "Stored"} report timezone: ${result.timeZone} (${path})`,
    );
    process.exit(0);
    break;
  case "kept":
    console.log(`Kept the existing report timezone: ${result.timeZone}`);
    process.exit(0);
    break;
  case "no-timezone":
    console.error(
      "Could not determine the system timezone. Run again with an explicit zone: npm run setup -- --force <IANA zone>",
    );
    process.exit(1);
    break;
  case "invalid-explicit":
    console.error(`Not a valid IANA timezone: ${result.value}`);
    process.exit(1);
    break;
  case "write-failed":
    console.error(`Failed to write ${path}.`);
    process.exit(1);
    break;
}

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
