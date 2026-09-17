import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { ModelCatalog } from "../../src/summarizer/model-catalog.js";
import {
  readSummarizerModels,
  writeSummarizerModels,
} from "../../src/storage/summarizer-models.js";
import {
  createSummarizerModelsService,
  resolveProviderModel,
} from "../../src/summarizer/model-settings.js";
import { createProviderLoginService } from "../../src/summarizer/provider-login.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function tempPath() {
  const root = await mkdtemp(join(tmpdir(), "summarizer-models-test-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return { root, path: join(root, "settings", "summarizer-models.json") };
}

// Fictional model lists.
const fetched: ModelCatalog = {
  codex: {
    source: "fetched",
    options: [
      { value: "gpt-fiction-terra", label: "Terra", effortLevels: ["low"] },
      { value: "gpt-fiction-luna", label: "Luna", effortLevels: [] },
    ],
  },
  "claude-code": {
    source: "fetched",
    options: [{ value: "fiction-opus", label: "Opus", effortLevels: [] }],
  },
};
const builtIn: ModelCatalog = {
  codex: { ...fetched.codex, source: "built-in" },
  "claude-code": { ...fetched["claude-code"], source: "built-in" },
};

describe("SM settings file", () => {
  test("SM-1: an absent file means Default for both providers", async () => {
    const { path } = await tempPath();
    expect(await readSummarizerModels(path)).toEqual({
      models: {},
      unreadable: false,
    });
  });

  test("SM-2: saving writes atomically with owner-only permissions and reads back", async () => {
    const { path } = await tempPath();

    await writeSummarizerModels(path, {
      codex: "gpt-fiction-terra",
      "claude-code": "fiction-opus",
    });

    expect(await readSummarizerModels(path)).toEqual({
      models: { codex: "gpt-fiction-terra", "claude-code": "fiction-opus" },
      unreadable: false,
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      version: 1,
      models: { codex: "gpt-fiction-terra", "claude-code": "fiction-opus" },
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(
      (await readdir(join(path, ".."))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  test("SM-3: an unreadable or invalid file means Default plus settings-unreadable; saving replaces it", async () => {
    const { root, path } = await tempPath();
    await mkdir(join(root, "settings"), { recursive: true });
    const invalid = [
      "not json",
      JSON.stringify({ version: 2, models: {} }),
      JSON.stringify({ version: 1, models: { codex: 7 } }),
      JSON.stringify({
        version: 1,
        models: { codex: "--dangerously-bypass-approvals-and-sandbox" },
      }),
      JSON.stringify({ version: 1, models: { bash: "x" } }),
      JSON.stringify({ version: 1, models: {}, extra: true }),
      JSON.stringify([]),
    ];
    for (const contents of invalid) {
      await writeFile(path, contents);
      expect(await readSummarizerModels(path), contents).toEqual({
        models: {},
        unreadable: true,
      });
    }
    const directoryPath = join(root, "settings");
    expect(await readSummarizerModels(directoryPath)).toEqual({
      models: {},
      unreadable: true,
    });

    const service = createSummarizerModelsService({
      catalog: async () => fetched,
      settingsPath: path,
    });
    expect((await service.view())[0]?.warnings).toContain(
      "settings-unreadable",
    );
    await service.save("codex", "gpt-fiction-luna");
    expect(await readSummarizerModels(path)).toEqual({
      models: { codex: "gpt-fiction-luna" },
      unreadable: false,
    });
    expect((await service.view()).flatMap((view) => view.warnings)).toEqual([]);
  });
});

describe("SR effective model", () => {
  test("SR-1: a saved model present in a fetched list is used", () => {
    expect(
      resolveProviderModel({
        provider: "codex",
        catalog: fetched.codex,
        saved: "gpt-fiction-luna",
        unreadable: false,
      }),
    ).toEqual({
      provider: "codex",
      source: "fetched",
      options: [
        { value: "gpt-fiction-terra", label: "Terra" },
        { value: "gpt-fiction-luna", label: "Luna" },
      ],
      selected: "gpt-fiction-luna",
      effective: "gpt-fiction-luna",
      warnings: [],
    });
  });

  test("SR-1: nothing saved means Default with no model option", () => {
    expect(
      resolveProviderModel({
        provider: "claude-code",
        catalog: fetched["claude-code"],
        unreadable: false,
      }),
    ).toMatchObject({ selected: "default", effective: null, warnings: [] });
  });

  test("SR-2: a saved model absent from a fetched list uses Default with a warning (F3)", () => {
    expect(
      resolveProviderModel({
        provider: "codex",
        catalog: fetched.codex,
        saved: "gpt-fiction-retired",
        unreadable: false,
      }),
    ).toMatchObject({
      selected: "default",
      effective: null,
      warnings: ["saved-model-unavailable"],
    });
  });

  test("SR-3: with the built-in list, a safe saved model is still used with a note; an unsafe one uses Default", () => {
    expect(
      resolveProviderModel({
        provider: "codex",
        catalog: builtIn.codex,
        saved: "gpt-fiction-newer",
        unreadable: false,
      }),
    ).toMatchObject({
      source: "built-in",
      selected: "gpt-fiction-newer",
      effective: "gpt-fiction-newer",
      warnings: ["model-list-unavailable"],
      options: expect.arrayContaining([
        { value: "gpt-fiction-newer", label: "gpt-fiction-newer" },
      ]),
    });
    expect(
      resolveProviderModel({
        provider: "codex",
        catalog: builtIn.codex,
        saved: "-m",
        unreadable: false,
      }),
    ).toMatchObject({
      selected: "default",
      effective: null,
      warnings: ["model-list-unavailable", "saved-model-unavailable"],
    });
  });

  test("SR-4: the readiness probe's second attempt receives the effective model", async () => {
    const { path } = await tempPath();
    const models = createSummarizerModelsService({
      catalog: async () => fetched,
      settingsPath: path,
    });
    const received: Array<string | undefined> = [];
    const service = createProviderLoginService({
      executor: {
        async locate(name) {
          return `/fake/bin/${name}`;
        },
        async run() {
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
      launcher: { async launch() {} },
      probe: async ({ summaryModel }) => {
        received.push(summaryModel);
        return { ok: true };
      },
      summaryModel: (provider) => models.effectiveModel(provider),
    });

    await service.checkReadiness("codex");
    await models.save("codex", "gpt-fiction-terra");
    await service.checkReadiness("codex");
    await writeSummarizerModels(path, { codex: "gpt-fiction-retired" });
    await service.checkReadiness("codex");

    expect(received).toEqual([undefined, "gpt-fiction-terra", undefined]);
  });
});
