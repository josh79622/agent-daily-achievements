// Writes the generated `.plist` to a fixed, label-derived path so installing
// the job twice replaces it rather than creating a second job (S1-18). This
// module only ever touches the filesystem through its injected `writeFile`/
// `mkdir`/`fileExists`; it never calls `launchctl` itself. The real
// launchctl bootstrap/bootout calls that make an installed job take effect
// live in scripts/install-launchd.mjs, which nothing in this repository
// runs automatically — the owner runs it by hand.

import {
  mkdir as fsMkdir,
  stat,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { defaultLaunchdJobLabel } from "./launchd-plist.js";

export function defaultLaunchdPlistPath(
  label = defaultLaunchdJobLabel,
): string {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

export interface WriteLaunchdJobResult {
  plistPath: string;
  /** True when a `.plist` already existed at this path and was overwritten. */
  replaced: boolean;
}

export async function writeLaunchdJob({
  plistPath,
  content,
  mkdir = fsMkdir,
  writeFile = fsWriteFile,
}: {
  plistPath: string;
  content: string;
  mkdir?: typeof fsMkdir;
  writeFile?: typeof fsWriteFile;
}): Promise<WriteLaunchdJobResult> {
  await mkdir(dirname(plistPath), { recursive: true });
  const replaced = await exists(plistPath);
  // The same fixed, label-derived path is written every time (never a
  // uniquely-named file per install), so a second install overwrites the
  // first job's definition in place instead of leaving both around.
  await writeFile(plistPath, content, "utf8");
  return { plistPath, replaced };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
