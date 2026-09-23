import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";

import {
  builtInDefaultEffortLevels,
  builtInModels,
  claudeModelLabel,
  createModelCatalogLoader,
  isSafeModelValue,
  parseClaudeModels,
  type CatalogChild,
} from "../../src/summarizer/model-catalog.js";
import type {
  ProbeRunRequest,
  ProbeRunResult,
} from "../../src/summarizer/readiness-probe.js";
import type { SummaryProvider } from "../../src/storage/summary-permission.js";

const secret = "FICTIONAL-ACCOUNT jane@example.com";

// Fictional catalog shapes modelled on the observed formats.
function codexCatalog(models: unknown[]): string {
  return JSON.stringify({ models });
}
const codexListed = {
  slug: "gpt-fiction-terra",
  display_name: "GPT-Fiction-Terra",
  visibility: "list",
  supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
  base_instructions: secret,
};
const codexHidden = {
  slug: "gpt-fiction-hidden",
  display_name: "Hidden",
  visibility: "hide",
  supported_reasoning_levels: [],
};

function claudeInitialize(models: unknown[]) {
  return {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: "init-1",
      response: { models, account: { email: secret }, commands: [secret] },
    },
  };
}

class FakeChild extends EventEmitter implements CatalogChild {
  stdout = new EventEmitter();
  written: string[] = [];
  signals: string[] = [];
  stdin = {
    write: (chunk: string) => {
      this.written.push(chunk);
      return true;
    },
    end: () => {},
  };
  kill(signal: NodeJS.Signals) {
    this.signals.push(signal);
    queueMicrotask(() => this.emit("close", null, signal));
    return true;
  }
}

interface Setup {
  codex?: ProbeRunResult | "throw";
  agy?: ProbeRunResult | "throw";
  claude?: (child: FakeChild) => void;
  claudeSpawnThrows?: boolean;
  installed?: boolean;
  claudeTimeoutMs?: number;
}

function loader(setup: Setup) {
  const runs: ProbeRunRequest[] = [];
  const claudeSpawns: Array<{
    file: string;
    args: readonly string[];
    options: unknown;
    child: FakeChild;
  }> = [];
  const created: string[] = [];
  const removed: string[] = [];
  const load = createModelCatalogLoader({
    locate: async (name) =>
      setup.installed === false ? undefined : `/fake/bin/${name}`,
    runner: async (request) => {
      runs.push(request);
      if (request.file.endsWith("agy")) {
        if (setup.agy === "throw") throw new Error(secret);
        return (
          setup.agy ?? {
            kind: "exited",
            exitCode: 0,
            stdout: "gemini-fiction-flash\tGemini Fiction Flash\n",
            stdoutTooLarge: false,
          }
        );
      }
      if (setup.codex === "throw") throw new Error(secret);
      return (
        setup.codex ?? {
          kind: "exited",
          exitCode: 0,
          stdout: codexCatalog([codexListed, codexHidden]),
          stdoutTooLarge: false,
        }
      );
    },
    spawnClaude: (file, args, options) => {
      if (setup.claudeSpawnThrows) throw new Error(secret);
      const child = new FakeChild();
      claudeSpawns.push({ file, args, options, child });
      queueMicrotask(() => {
        if (setup.claude) setup.claude(child);
        else
          child.stdout.emit(
            "data",
            JSON.stringify(
              claudeInitialize([
                {
                  value: "default",
                  displayName: "Default (recommended)",
                  supportedEffortLevels: ["low"],
                },
                {
                  value: "fiction-sonnet",
                  displayName: "Fiction Sonnet",
                  resolvedModel: "claude-fiction-sonnet",
                  supportedEffortLevels: ["low", "max"],
                },
                { value: "fiction-haiku[1m]", displayName: "Fiction Haiku" },
              ]),
            ) + "\n",
          );
      });
      return child;
    },
    tempDirs: {
      async create() {
        const dir = `/fake/tmp/catalog-${created.length + 1}`;
        created.push(dir);
        return dir;
      },
      async remove(dir) {
        removed.push(dir);
      },
    },
    claudeTimeoutMs: setup.claudeTimeoutMs,
  });
  return { load, runs, claudeSpawns, created, removed };
}

test("MC-1: the Codex list comes from `codex debug models` and keeps only listed entries", async () => {
  const { load, runs } = loader({});

  const catalog = await load();

  expect(runs).toEqual([
    {
      file: "/fake/bin/codex",
      args: ["debug", "models"],
      cwd: "/fake/tmp/catalog-1",
      captureStdout: true,
      timeoutMs: 15_000,
      maxStdoutBytes: 4 * 1024 * 1024,
    },
    {
      file: "/fake/bin/agy",
      args: ["models"],
      cwd: "/fake/tmp/catalog-3",
      captureStdout: true,
      timeoutMs: 15_000,
      maxStdoutBytes: 4 * 1024 * 1024,
    },
  ]);
  expect(catalog.codex).toEqual({
    source: "fetched",
    defaultEffortLevels: [],
    options: [
      {
        value: "gpt-fiction-terra",
        label: "GPT-Fiction-Terra",
        effortLevels: ["low", "high"],
      },
    ],
  });
});

test("MC-2: the Claude Code list uses one initialize request, never a prompt, and stops the process", async () => {
  const { load, claudeSpawns, created, removed } = loader({});

  const catalog = await load();

  expect(claudeSpawns).toHaveLength(1);
  const [spawned] = claudeSpawns;
  expect(spawned?.file).toBe("/fake/bin/claude");
  expect(spawned?.args).toEqual([
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--tools",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
  ]);
  expect(spawned?.options).toEqual({
    cwd: expect.stringMatching(/^\/fake\/tmp\/catalog-/),
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
  });
  expect(spawned?.child.written.map((line) => JSON.parse(line))).toEqual([
    {
      type: "control_request",
      request_id: "init-1",
      request: { subtype: "initialize" },
    },
  ]);
  expect(spawned?.child.written.join("")).not.toMatch(/"type":"user"/);
  expect(spawned?.child.signals).toEqual(["SIGTERM"]);
  expect(catalog["claude-code"]).toEqual({
    source: "fetched",
    defaultEffortLevels: ["low"],
    options: [
      {
        value: "fiction-sonnet",
        label: "Fiction Sonnet",
        effortLevels: ["low", "max"],
      },
      { value: "fiction-haiku[1m]", label: "Fiction Haiku", effortLevels: [] },
    ],
  });
  expect(removed.sort()).toEqual(created.sort());
});

describe("MC-3 fallback", () => {
  const builtIn = (provider: SummaryProvider) => ({
    source: "built-in",
    options: builtInModels[provider],
    defaultEffortLevels: builtInDefaultEffortLevels[provider],
  });

  test("MC-3: Codex spawn error, timeout, non-zero exit, oversize, bad output, or no usable entries use the built-in list", async () => {
    const failures: Array<ProbeRunResult | "throw"> = [
      { kind: "could-not-start" },
      { kind: "timed-out" },
      "throw",
      {
        kind: "exited",
        exitCode: 1,
        stdout: codexCatalog([codexListed]),
        stdoutTooLarge: false,
      },
      { kind: "exited", exitCode: 0, stdout: "", stdoutTooLarge: true },
      {
        kind: "exited",
        exitCode: 0,
        stdout: "not json",
        stdoutTooLarge: false,
      },
      { kind: "exited", exitCode: 0, stdout: "{}", stdoutTooLarge: false },
      {
        kind: "exited",
        exitCode: 0,
        stdout: codexCatalog([]),
        stdoutTooLarge: false,
      },
      {
        kind: "exited",
        exitCode: 0,
        stdout: codexCatalog([codexHidden]),
        stdoutTooLarge: false,
      },
    ];
    for (const codex of failures) {
      expect(
        (await loader({ codex }).load()).codex,
        JSON.stringify(codex),
      ).toEqual(builtIn("codex"));
    }
  });

  test("MC-3: Claude Code spawn error, early exit, timeout, bad output, or no usable entries use the built-in list", async () => {
    const scenarios: Setup[] = [
      { claudeSpawnThrows: true },
      { claude: (child) => child.emit("error", new Error(secret)) },
      { claude: (child) => child.emit("close", 1, null) },
      { claude: () => {}, claudeTimeoutMs: 5 },
      { claude: (child) => child.stdout.emit("data", "not json\n") },
      {
        claude: (child) =>
          child.stdout.emit(
            "data",
            JSON.stringify({
              type: "control_response",
              response: { subtype: "error", request_id: "init-1" },
            }) + "\n",
          ),
      },
      {
        claude: (child) =>
          child.stdout.emit(
            "data",
            JSON.stringify(
              claudeInitialize([{ value: "default", displayName: "D" }]),
            ) + "\n",
          ),
      },
    ];
    for (const setup of scenarios) {
      const { load, created, removed } = loader(setup);
      expect((await load())["claude-code"]).toEqual(builtIn("claude-code"));
      expect(removed.sort()).toEqual(created.sort());
    }
  });

  test("MC-3: a provider that is not installed uses the built-in list without spawning", async () => {
    const { load, runs, claudeSpawns } = loader({ installed: false });
    expect(await load()).toEqual({
      codex: builtIn("codex"),
      "claude-code": builtIn("claude-code"),
      agy: builtIn("agy"),
    });
    expect(runs).toEqual([]);
    expect(claudeSpawns).toEqual([]);
  });

  test("MC-3: built-in lists contain only safe values", () => {
    for (const options of Object.values(builtInModels)) {
      expect(options.length).toBeGreaterThan(0);
      for (const option of options)
        expect(isSafeModelValue(option.value)).toBe(true);
    }
  });
});

test("MC-4: entries with unsafe values, labels, or effort levels are dropped", async () => {
  expect(
    ["gpt-5.6-terra", "opus", "claude-fable-5[1m]", "A1", "x".repeat(64)].every(
      isSafeModelValue,
    ),
  ).toBe(true);
  expect(
    [
      "",
      "-m",
      "--dangerously-bypass-approvals-and-sandbox",
      "a b",
      "a;b",
      "x".repeat(65),
      "[x]",
      7,
    ].some(isSafeModelValue),
  ).toBe(false);

  const { load } = loader({
    codex: {
      kind: "exited",
      exitCode: 0,
      stdout: codexCatalog([
        codexListed,
        { ...codexListed, slug: "--dangerously-bypass-approvals-and-sandbox" },
        { ...codexListed, slug: "gpt-no-label", display_name: 5 },
        {
          ...codexListed,
          slug: "gpt-bad-effort",
          supported_reasoning_levels: [{ effort: "-x" }],
        },
      ]),
      stdoutTooLarge: false,
    },
  });
  expect((await load()).codex.options.map((option) => option.value)).toEqual([
    "gpt-fiction-terra",
  ]);
});

test("MC-5: catalog results contain only value, label, and effort levels", async () => {
  const catalog = await loader({}).load();
  const serialized = JSON.stringify(catalog);
  expect(serialized).not.toMatch(
    /FICTIONAL|example\.com|hidden|resolvedModel|claude-fiction-sonnet|base_instructions|account/i,
  );
  for (const provider of Object.values(catalog))
    for (const option of provider.options)
      expect(Object.keys(option).sort()).toEqual([
        "effortLevels",
        "label",
        "value",
      ]);
});

test("EC-1: Claude Code keeps the default entry's effort levels without offering it as a model; Codex has none", async () => {
  const catalog = await loader({}).load();
  expect(catalog["claude-code"].defaultEffortLevels).toEqual(["low"]);
  expect(
    catalog["claude-code"].options.some((option) => option.value === "default"),
  ).toBe(false);
  expect(catalog.codex.defaultEffortLevels).toEqual([]);

  expect(builtInDefaultEffortLevels).toEqual({
    "claude-code": ["low", "medium", "high", "xhigh", "max"],
    codex: [],
    agy: ["low", "medium", "high"],
  });

  const unsafe = await loader({
    claude: (child) =>
      child.stdout.emit(
        "data",
        JSON.stringify(
          claudeInitialize([
            {
              value: "default",
              displayName: "D",
              supportedEffortLevels: ["-x"],
            },
            { value: "fiction-opus", displayName: "Opus" },
          ]),
        ) + "\n",
      ),
  }).load();
  expect(unsafe["claude-code"]).toMatchObject({
    source: "fetched",
    defaultEffortLevels: [],
  });
});

test("M1-4: Claude model label parses prefix from description", () => {
  expect(
    claudeModelLabel({
      displayName: "Opus",
      description: "Opus 5.5 · Best for everyday tasks",
    }),
  ).toBe("Opus 5.5");

  const parsed = parseClaudeModels([
    {
      value: "opus",
      displayName: "Opus",
      description: "Opus 5.5 · Best for everyday tasks",
      supportedEffortLevels: ["low", "high"],
    },
  ]);
  expect(parsed?.options).toEqual([
    {
      value: "opus",
      label: "Opus 5.5",
      effortLevels: ["low", "high"],
    },
  ]);
});

test("M1-5: Claude model label falls back to displayName when description is missing or invalid", () => {
  expect(
    claudeModelLabel({
      displayName: "Opus",
    }),
  ).toBe("Opus");

  expect(
    claudeModelLabel({
      displayName: "Opus",
      description: "",
    }),
  ).toBe("Opus");

  expect(
    claudeModelLabel({
      displayName: "Opus 5.5",
      description: "Most capable for ambitious work",
    }),
  ).toBe("Opus 5.5");

  expect(
    claudeModelLabel({
      displayName: "Opus",
      description: 123,
    }),
  ).toBe("Opus");

  const parsed = parseClaudeModels([
    {
      value: "opus",
      displayName: "Opus",
      supportedEffortLevels: ["low"],
    },
  ]);
  expect(parsed?.options).toEqual([
    {
      value: "opus",
      label: "Opus",
      effortLevels: ["low"],
    },
  ]);
});

test("M1-6: built-in catalog contains latest models with safe values and non-empty labels", async () => {
  const { load } = loader({ installed: false });
  const catalog = await load();

  // Codex includes GPT-6-Sol and GPT-6-Luna
  const codexValues = catalog.codex.options.map((opt) => opt.value);
  expect(codexValues).toContain("gpt-6-sol");
  expect(codexValues).toContain("gpt-6-luna");

  const sol = catalog.codex.options.find((opt) => opt.value === "gpt-6-sol");
  expect(sol).toEqual({
    value: "gpt-6-sol",
    label: "GPT-6-Sol",
    effortLevels: ["low", "medium", "high", "xhigh", "max", "ultra"],
  });

  const luna = catalog.codex.options.find((opt) => opt.value === "gpt-6-luna");
  expect(luna).toEqual({
    value: "gpt-6-luna",
    label: "GPT-6-Luna",
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  });

  // Claude Code labels are versioned
  const claudeLabels = catalog["claude-code"].options.map((opt) => opt.label);
  expect(claudeLabels).toContain("Opus 5.5");
  expect(claudeLabels).toContain("Sonnet 5");
  expect(claudeLabels).toContain("Fable 5.1");
  expect(claudeLabels).toContain("Haiku 4.5");

  // All entries across all providers have non-empty labels, safe values, and valid effort levels
  for (const [provider, provCatalog] of Object.entries(catalog)) {
    expect(provCatalog.options.length).toBeGreaterThan(0);
    for (const option of provCatalog.options) {
      expect(
        isSafeModelValue(option.value),
        `${provider}: ${option.value}`,
      ).toBe(true);
      expect(typeof option.label).toBe("string");
      expect(option.label.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(option.effortLevels)).toBe(true);
    }
  }
});
