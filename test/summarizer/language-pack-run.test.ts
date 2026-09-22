import { expect, test } from "vitest";

import {
  createLanguagePackBuilder,
  languagePackMaxReplyBytes,
} from "../../src/summarizer/language-pack-run.js";
import type {
  ProbeRunRequest,
  ProbeRunResult,
} from "../../src/summarizer/readiness-probe.js";
import type { Translations } from "../../web/i18n.js";
import { en } from "../../web/i18n.js";

// Test cases L2-9 to L2-18 (build/caching half) from
// docs/plans/2026-09-21-task-l2-on-demand-language-packs-test-cases.md.
// Every process, temp-dir, and store dependency is a fake; no real CLI runs.

function translate(value: unknown): unknown {
  if (typeof value === "string") return `${value} (ja)`;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        translate(child),
      ]),
    );
  }
  return value;
}

function claudeExit(replyText: string): ProbeRunResult {
  return {
    kind: "exited",
    exitCode: 0,
    stdout: JSON.stringify({ is_error: false, result: replyText }),
    stdoutTooLarge: false,
  };
}

interface Harness {
  runs: ProbeRunRequest[];
  locateCalls: string[];
  written: Array<{ code: string; pack: Translations }>;
}

function harness({
  availableSummaryProviders = ["claude-code"] as const,
  runnerScript,
  cached,
}: {
  availableSummaryProviders?: readonly ("claude-code" | "codex" | "agy")[];
  runnerScript: Array<ProbeRunResult | "throw" | undefined>;
  cached?: Record<string, Translations>;
}) {
  const store = { ...(cached ?? {}) } as Record<string, Translations>;
  const state: Harness = { runs: [], locateCalls: [], written: [] };
  let index = 0;
  const builder = createLanguagePackBuilder({
    locate: async (provider) => {
      state.locateCalls.push(provider);
      return "/usr/bin/claude";
    },
    models: {
      async view() {
        return [];
      },
      async effectiveSettings() {
        return {};
      },
      async save() {
        return undefined;
      },
      async saveEffort() {
        return undefined;
      },
    },
    runner: async (request) => {
      state.runs.push(request);
      const step = runnerScript[index];
      index += 1;
      if (step === undefined)
        throw new Error("Test bug: runnerScript exhausted.");
      if (step === "throw") throw new Error("could not start");
      return step;
    },
    tempDirs: {
      async create() {
        return "/tmp/pack-build";
      },
      async remove() {},
    },
    readReplyFile: async () => ({ kind: "missing" }) as const,
    store: {
      async read(code) {
        return store[code];
      },
      async write(code, pack) {
        store[code] = pack;
        state.written.push({ code, pack });
      },
      async list() {
        return Object.keys(store).sort();
      },
    },
    availableSummaryProviders: [...availableSummaryProviders],
  });
  return { builder, state, store };
}

test("L2-9: no cached pack for ja reports it as absent", async () => {
  const { builder } = harness({ runnerScript: [] });
  expect(await builder.get("ja")).toBeUndefined();
});

test("L2-10: a successful build writes the cache and a following get serves it", async () => {
  const { builder, store } = harness({
    runnerScript: [claudeExit(JSON.stringify(translate(en)))],
  });
  const result = await builder.build("ja");
  expect(result.kind).toBe("built");
  expect(store.ja).toBeDefined();
  expect(await builder.get("ja")).toEqual(store.ja);
});

test("L2-10a: language-pack generation retains its 512 KiB reply allowance", async () => {
  const { builder, state } = harness({
    runnerScript: [claudeExit(JSON.stringify(translate(en)))],
  });

  await builder.build("ja");

  expect(languagePackMaxReplyBytes).toBe(512 * 1024);
  expect(state.runs[0]?.maxStdoutBytes).toBe(languagePackMaxReplyBytes);
});

test("L2-11: a second build request when the file exists does not invoke the provider", async () => {
  const cachedPack = translate(en) as Translations;
  const { builder, state } = harness({
    runnerScript: [],
    cached: { ja: cachedPack },
  });
  const result = await builder.build("ja");
  expect(result).toEqual({ kind: "cached", pack: cachedPack });
  expect(state.runs).toHaveLength(0);
  expect(state.locateCalls).toHaveLength(0);
});

test("L2-12: a rejected pack (missing key) leaves no file on disk and carries the reason", async () => {
  const broken = translate(en) as { header: Record<string, unknown> };
  delete broken.header.title;
  const { builder, store } = harness({
    runnerScript: [claudeExit(JSON.stringify(broken))],
  });
  const result = await builder.build("ja");
  expect(result.kind).toBe("failed");
  if (result.kind === "failed") expect(result.reason).toContain("header.title");
  expect(store.ja).toBeUndefined();
});

test("L2-12: a reply that is not JSON is rejected, leaving no file", async () => {
  const { builder, store } = harness({
    runnerScript: [claudeExit("not json at all")],
  });
  const result = await builder.build("ja");
  expect(result.kind).toBe("failed");
  expect(store.ja).toBeUndefined();
});

test("L2-13: the provider timing out reports the failure, writes no file, and leaves ja addable", async () => {
  const { builder, store } = harness({ runnerScript: ["throw", "throw"] });
  const result = await builder.build("ja");
  expect(result.kind).toBe("failed");
  expect(store.ja).toBeUndefined();
  expect(await builder.get("ja")).toBeUndefined();
  // Still addable, not refused, on a later attempt.
  const retry = await builder.build("ja");
  expect(retry.kind).toBe("failed");
});

test("L2-14: a code outside the catalog is refused before the provider is invoked", async () => {
  const { builder, state } = harness({ runnerScript: [] });
  const result = await builder.build("xx-not-real");
  expect(result.kind).toBe("refused");
  expect(state.runs).toHaveLength(0);
  expect(state.locateCalls).toHaveLength(0);
});

test("L2-15: a built-in code is refused; a built-in is never generated", async () => {
  const { builder, state } = harness({ runnerScript: [] });
  for (const code of ["en", "zh-TW", "es"]) {
    const result = await builder.build(code);
    expect(result.kind).toBe("refused");
  }
  expect(state.runs).toHaveLength(0);
});

// Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md): replaces
// the old L2-16 "a right-to-left code is refused" case.
test("L3-16: a build request for ar is no longer refused; it reaches the provider like any other addable language", async () => {
  const { builder, state } = harness({
    runnerScript: [claudeExit(JSON.stringify(translate(en)))],
  });
  const result = await builder.build("ar");
  expect(result.kind).toBe("built");
  expect(state.runs).toHaveLength(1);
  expect(state.locateCalls).toEqual(["claude-code"]);
});

test("L2-17: two build requests for ja at once share one provider run", async () => {
  const { builder, state } = harness({
    runnerScript: [claudeExit(JSON.stringify(translate(en)))],
  });
  const [first, second] = await Promise.all([
    builder.build("ja"),
    builder.build("ja"),
  ]);
  expect(first).toEqual(second);
  expect(state.runs).toHaveLength(1);
});

test("fallback: an unavailable preferred provider tries the next available one", async () => {
  const { builder, state } = harness({
    availableSummaryProviders: ["claude-code", "codex"],
    runnerScript: [claudeExit(JSON.stringify(translate(en)))],
  });
  const result = await builder.build("ja", { preferredCli: "claude-code" });
  expect(result.kind).toBe("built");
  expect(state.locateCalls[0]).toBe("claude-code");
});
