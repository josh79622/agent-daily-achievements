// Temporary directories for probe and model-list runs, with cleanup when the
// server stops mid-run (L3) and a startup sweep for earlier leftovers (L1).
// Design: docs/plans/2026-09-17-readiness-probe-design.md

import { rmSync } from "node:fs";
import { lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProbeTempDirs } from "./readiness-probe.js";

export const probeTempPrefix = "daily-achievements-probe-";
const staleAfterMs = 10 * 60_000;

export interface TrackedTempDirs extends ProbeTempDirs {
  active(): string[];
  removeAllSync(): void;
}

export function createTrackedTempDirs({
  base = tmpdir(),
}: { base?: string } = {}): TrackedTempDirs {
  const active = new Set<string>();
  return {
    async create() {
      const directory = await mkdtemp(join(base, probeTempPrefix));
      active.add(directory);
      return directory;
    },
    async remove(directory) {
      try {
        await rm(directory, { recursive: true, force: true });
      } finally {
        active.delete(directory);
      }
    },
    active: () => [...active],
    removeAllSync() {
      for (const directory of active) {
        try {
          rmSync(directory, { recursive: true, force: true });
        } catch {
          // Best effort during shutdown; the startup sweep is the fallback.
        }
        active.delete(directory);
      }
    },
  };
}

/** Removes only this tool's own stale, real, user-owned directories. */
export async function sweepStaleTempDirs({
  base = tmpdir(),
  now = () => new Date(),
}: { base?: string; now?: () => Date } = {}): Promise<{ removed: number }> {
  let names: string[];
  try {
    names = await readdir(base);
  } catch {
    return { removed: 0 };
  }
  const uid = process.getuid?.();
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith(probeTempPrefix)) continue;
    const path = join(base, name);
    try {
      const stats = await lstat(path);
      if (
        !stats.isDirectory() ||
        stats.isSymbolicLink() ||
        (uid !== undefined && stats.uid !== uid) ||
        now().getTime() - stats.mtimeMs <= staleAfterMs
      )
        continue;
      await rm(path, { recursive: true, force: true });
      removed += 1;
    } catch {
      continue;
    }
  }
  return { removed };
}

interface SignalProcess {
  on(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  exit(code: number): void;
}

/** On SIGINT or SIGTERM, removes tracked directories and then exits. */
export function installShutdownCleanup({
  tempDirs,
  process: target = process,
}: {
  tempDirs: TrackedTempDirs;
  process?: SignalProcess;
}): () => void {
  const handlers = {
    SIGINT: () => {
      tempDirs.removeAllSync();
      target.exit(130);
    },
    SIGTERM: () => {
      tempDirs.removeAllSync();
      target.exit(143);
    },
  };
  target.on("SIGINT", handlers.SIGINT);
  target.on("SIGTERM", handlers.SIGTERM);
  return () => {
    target.off("SIGINT", handlers.SIGINT);
    target.off("SIGTERM", handlers.SIGTERM);
  };
}
