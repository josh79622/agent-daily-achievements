import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createLanguagePackStore } from "../../src/storage/language-pack-store.js";
import { en } from "../../web/i18n.js";

// Task L4 (docs/plans/2026-09-21-task-l4-cached-languages-stay-added-test-cases.md):
// LanguagePackStore.list(). Always against a fresh temp directory — never
// the real data/locales/ (which holds Josh's own ar/ja/zh-CN packs).

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function freshDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "language-pack-store-"));
  directories.push(directory);
  return directory;
}

test("L4-1: nothing cached in a fresh directory returns an empty list", async () => {
  const directory = await freshDirectory();
  const store = createLanguagePackStore(directory);

  expect(await store.list()).toEqual([]);
});

test("L4-2: ar and ja cached returns exactly those two codes", async () => {
  const directory = await freshDirectory();
  const store = createLanguagePackStore(directory);

  await store.write("ar", en);
  await store.write("ja", en);

  expect(await store.list()).toEqual(["ar", "ja"]);
});

test("L4-3: a file in the cache that is not a language pack is left out", async () => {
  const directory = await freshDirectory();
  const store = createLanguagePackStore(directory);
  await store.write("ja", en);
  // Not valid JSON, so it can't be read back as a pack.
  await writeFile(join(directory, "broken.json"), "not json at all", "utf8");
  // Not a .json file at all.
  await writeFile(join(directory, "notes.txt"), "hello", "utf8");

  expect(await store.list()).toEqual(["ja"]);
});

test("L4-4: a missing cache directory returns an empty list, no error raised", async () => {
  const directory = await freshDirectory();
  const missing = join(directory, "does-not-exist");
  const store = createLanguagePackStore(missing);

  await expect(store.list()).resolves.toEqual([]);
});

test("a deleted pack file drops out of the list (supports L4-7 end to end)", async () => {
  const directory = await freshDirectory();
  const store = createLanguagePackStore(directory);
  await store.write("ja", en);
  expect(await store.list()).toEqual(["ja"]);

  await rm(join(directory, "ja.json"));

  expect(await store.list()).toEqual([]);
});
