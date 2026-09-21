// The report timezone the schedule uses to decide the 07:00 window
// (docs/decisions/2026-09-21-seven-am-report-window.md). Reading it never
// falls back to the machine's timezone: the 24-hour fallback decision
// (docs/decisions/2026-09-17-local-timezone-scheduling.md) says an
// unreadable or unavailable setting must not be silently replaced by an
// inferred one. `setupReportTimeZone` below is the one place that writes
// this file (Task S2); it and `readReportTimeZone` must agree on the file's
// shape (S2-7).

import { mkdir as fsMkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ReportTimeZoneResult =
  { ok: true; timeZone: string } | { ok: false };

export async function readReportTimeZone(
  path: string | undefined,
): Promise<ReportTimeZoneResult> {
  if (!path) return { ok: false };
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    return { ok: false };
  }
  try {
    const value = JSON.parse(contents) as Record<string, unknown>;
    const timeZone = value.timeZone;
    if (typeof timeZone !== "string" || !timeZone) return { ok: false };
    // Throws for a syntactically invalid IANA name.
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return { ok: true, timeZone };
  } catch {
    return { ok: false };
  }
}

function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

type ExistingFile =
  | { kind: "absent" }
  | { kind: "corrupt" }
  | { kind: "valid"; timeZone: string };

export type SetupReportTimeZoneResult =
  | { status: "written"; timeZone: string; replacedCorrupt: boolean }
  | { status: "kept"; timeZone: string }
  | { status: "no-timezone" }
  | { status: "invalid-explicit"; value: string }
  | { status: "write-failed" };

/**
 * The setup command's core logic (Task S2), a pure function over injected
 * dependencies the way `writeLaunchdJob` is (src/schedule/launchd-install.ts):
 * no filesystem call here goes anywhere but through `readFile`/`writeFile`/
 * `mkdir`, and no process exit happens here — the script wrapper
 * (scripts/setup.mjs) turns the returned status into console output and an
 * exit code.
 */
export async function setupReportTimeZone({
  path,
  force,
  systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  readFile: readFileFn = readFile,
  writeFile: writeFileFn = writeFile,
  mkdir: mkdirFn = fsMkdir,
}: {
  path: string;
  /** `--force <zone>`: replace whatever is stored with this explicit zone. */
  force?: string;
  /** Injectable for tests (S2-4/S2-5): the Mac's system timezone, if any. */
  systemTimeZone?: () => string | undefined;
  readFile?: typeof readFile;
  writeFile?: typeof writeFile;
  mkdir?: typeof fsMkdir;
}): Promise<SetupReportTimeZoneResult> {
  async function write(
    timeZone: string,
    replacedCorrupt: boolean,
  ): Promise<SetupReportTimeZoneResult> {
    try {
      await mkdirFn(dirname(path), { recursive: true });
      await writeFileFn(
        path,
        JSON.stringify({ timeZone }, null, 2) + "\n",
        "utf8",
      );
    } catch {
      return { status: "write-failed" };
    }
    return { status: "written", timeZone, replacedCorrupt };
  }

  if (force !== undefined) {
    if (!isValidIanaTimeZone(force)) {
      return { status: "invalid-explicit", value: force };
    }
    return write(force, false);
  }

  const existing = await readExisting(path, readFileFn);
  if (existing.kind === "valid") {
    return { status: "kept", timeZone: existing.timeZone };
  }

  const systemTz = systemTimeZone();
  if (!systemTz || !isValidIanaTimeZone(systemTz)) {
    return { status: "no-timezone" };
  }
  return write(systemTz, existing.kind === "corrupt");
}

async function readExisting(
  path: string,
  readFileFn: typeof readFile,
): Promise<ExistingFile> {
  let contents: string;
  try {
    contents = await readFileFn(path, "utf8");
  } catch {
    return { kind: "absent" };
  }
  try {
    const value = JSON.parse(contents) as Record<string, unknown>;
    const timeZone = value.timeZone;
    if (
      typeof timeZone === "string" &&
      timeZone &&
      isValidIanaTimeZone(timeZone)
    ) {
      return { kind: "valid", timeZone };
    }
    return { kind: "corrupt" };
  } catch {
    return { kind: "corrupt" };
  }
}
