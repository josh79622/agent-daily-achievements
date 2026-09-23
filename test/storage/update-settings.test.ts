import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  readUpdateSettings,
  writeUpdateSettings,
} from "../../src/storage/update-settings.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function settingsPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "update-settings-"));
  directories.push(directory);
  return join(directory, "settings.json");
}

test("defaults a missing settings file to manual updates", async () => {
  expect(await readUpdateSettings(await settingsPath())).toEqual({
    mode: "manual",
  });
});

test("persists only safe update status fields", async () => {
  const path = await settingsPath();
  await writeUpdateSettings(path, {
    mode: "automatic",
    availableVersion: "1.2.3",
    lastCheckAt: "2026-09-22T01:00:00.000Z",
    lastError: "Update failed during checksum verification.",
  });

  expect(await readUpdateSettings(path)).toEqual({
    mode: "automatic",
    availableVersion: "1.2.3",
    lastCheckAt: "2026-09-22T01:00:00.000Z",
    lastError: "Update failed during checksum verification.",
  });
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    version: 1,
    settings: {
      mode: "automatic",
      availableVersion: "1.2.3",
      lastCheckAt: "2026-09-22T01:00:00.000Z",
      lastError: "Update failed during checksum verification.",
    },
  });
});
