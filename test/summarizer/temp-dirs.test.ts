import { EventEmitter } from "node:events";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  createTrackedTempDirs,
  installShutdownCleanup,
  probeTempPrefix,
  sweepStaleTempDirs,
} from "../../src/summarizer/temp-dirs.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

// A test-only stand-in for the system temporary directory.
async function fakeTempBase() {
  const base = await mkdtemp(join(tmpdir(), "temp-dirs-test-"));
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  return base;
}

const now = new Date("2026-09-18T01:00:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000);

test("LK-1: the sweep removes only stale prefixed real directories", async () => {
  const base = await fakeTempBase();
  const target = await mkdtemp(join(tmpdir(), "temp-dirs-target-"));
  cleanups.push(() => rm(target, { recursive: true, force: true }));

  const make = async (name: string, ageMinutes: number, kind = "dir") => {
    const path = join(base, name);
    if (kind === "dir") {
      await mkdir(path);
      if (name.endsWith("with-reply"))
        await writeFile(join(path, "reply.txt"), "ready");
    } else if (kind === "file") await writeFile(path, "x");
    else await symlink(target, path);
    const time = minutesAgo(ageMinutes);
    if (kind !== "link") await utimes(path, time, time);
  };
  await make(`${probeTempPrefix}old`, 11);
  await make(`${probeTempPrefix}old-with-reply`, 30);
  await make(`${probeTempPrefix}fresh`, 9);
  await make("someone-else-old", 60);
  await make(`${probeTempPrefix}link`, 60, "link");
  await make(`${probeTempPrefix}file`, 60, "file");

  expect(await sweepStaleTempDirs({ base, now: () => now })).toEqual({
    removed: 2,
  });
  expect((await readdir(base)).sort()).toEqual(
    [
      `${probeTempPrefix}fresh`,
      "someone-else-old",
      `${probeTempPrefix}link`,
      `${probeTempPrefix}file`,
    ].sort(),
  );
  expect(await readdir(target)).toEqual([]);
});

test("LK-1: a missing or unreadable base is a no-op", async () => {
  const base = await fakeTempBase();
  expect(
    await sweepStaleTempDirs({ base: join(base, "missing"), now: () => now }),
  ).toEqual({ removed: 0 });
});

class FakeProcess extends EventEmitter {
  exits: number[] = [];
  exit(code: number) {
    this.exits.push(code);
  }
}

test("LK-2: on a stop signal, tracked directories are removed and the process still exits", async () => {
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    const base = await fakeTempBase();
    const tempDirs = createTrackedTempDirs({ base });
    const first = await tempDirs.create();
    const second = await tempDirs.create();
    await writeFile(join(second, "reply.txt"), "ready");
    expect(first.startsWith(join(base, probeTempPrefix))).toBe(true);

    const fake = new FakeProcess();
    const dispose = installShutdownCleanup({ tempDirs, process: fake });
    fake.emit(signal);

    expect(await readdir(base)).toEqual([]);
    expect(tempDirs.active()).toEqual([]);
    expect(fake.exits).toEqual([code]);
    dispose();
    expect(fake.listenerCount(signal)).toBe(0);
  }
});

test("LK-3: a directory removed normally is no longer tracked", async () => {
  const base = await fakeTempBase();
  const tempDirs = createTrackedTempDirs({ base });
  const kept = await tempDirs.create();
  const removed = await tempDirs.create();

  await tempDirs.remove(removed);

  expect(tempDirs.active()).toEqual([kept]);
  expect(await readdir(base)).toEqual([kept.slice(base.length + 1)]);
  expect(() => tempDirs.removeAllSync()).not.toThrow();
  expect(tempDirs.active()).toEqual([]);
  expect(await readdir(base)).toEqual([]);
});
