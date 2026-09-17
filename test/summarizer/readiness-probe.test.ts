import { EventEmitter } from "node:events";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SummaryProvider } from "../../src/storage/summary-permission.js";
import {
  createProcessRunner,
  createReadinessProbe,
  lowestCostModels,
  maxReplyBytes,
  probePrompt,
  probeTimeoutMs,
  type ProbeRunRequest,
  type ProbeRunResult,
  type ReplyFileResult,
} from "../../src/summarizer/readiness-probe.js";

const secret = "FICTIONAL-SECRET-REPLY sk-test-token";
const disabledCodexFeatures = [
  "shell_tool",
  "unified_exec",
  "browser_use",
  "computer_use",
  "apps",
  "plugins",
  "image_generation",
  "view_image",
];

interface Scripted {
  run?: ProbeRunResult | "throw";
  reply?: ReplyFileResult;
}

function harness(attempts: Scripted[]) {
  const runs: ProbeRunRequest[] = [];
  const created: string[] = [];
  const removed: string[] = [];
  const readPaths: string[] = [];
  let index = 0;
  let current: Scripted = {};
  const probe = createReadinessProbe({
    runner: async (request) => {
      runs.push(request);
      current = attempts[index] ?? {};
      index += 1;
      if (current.run === "throw") throw new Error(secret);
      return (
        current.run ?? {
          kind: "exited",
          exitCode: 0,
          stdout: JSON.stringify({ is_error: false, result: "ready" }),
          stdoutTooLarge: false,
        }
      );
    },
    tempDirs: {
      async create() {
        const dir = `/fake/tmp/probe-${created.length + 1}`;
        created.push(dir);
        return dir;
      },
      async remove(dir) {
        removed.push(dir);
      },
    },
    readReplyFile: async (path, maxBytes) => {
      readPaths.push(path);
      expect(maxBytes).toBe(maxReplyBytes);
      return current.reply ?? { kind: "text", text: "ready" };
    },
  });
  return { probe, runs, created, removed, readPaths };
}

function exited(exitCode: number | null, stdout = ""): ProbeRunResult {
  return { kind: "exited", exitCode, stdout, stdoutTooLarge: false };
}

const claudeOk = exited(
  0,
  JSON.stringify({ is_error: false, result: "ready" }),
);

describe("PR-1 / PR-2 commands", () => {
  test("PR-1: Claude Code attempt uses the approved tool-free print command in a new temporary directory", async () => {
    const { probe, runs } = harness([{ run: claudeOk }]);

    await probe({
      provider: "claude-code",
      executablePath: "/fake/bin/claude",
    });

    expect(runs).toEqual([
      {
        file: "/fake/bin/claude",
        args: [
          "-p",
          "--tools",
          "",
          "--no-session-persistence",
          "--strict-mcp-config",
          "--output-format",
          "json",
          "--model",
          "haiku",
          probePrompt,
        ],
        cwd: "/fake/tmp/probe-1",
        captureStdout: true,
        timeoutMs: probeTimeoutMs,
        maxStdoutBytes: maxReplyBytes,
      },
    ]);
  });

  test("PR-2: Codex attempt uses the approved restricted exec command with a reply file", async () => {
    const { probe, runs, readPaths } = harness([{}]);

    await probe({ provider: "codex", executablePath: "/fake/bin/codex" });

    expect(runs).toEqual([
      {
        file: "/fake/bin/codex",
        args: [
          "exec",
          "--ephemeral",
          "--skip-git-repo-check",
          "--ignore-user-config",
          "--sandbox",
          "read-only",
          "--color",
          "never",
          "-o",
          "/fake/tmp/probe-1/reply.txt",
          "-m",
          "gpt-5.6-luna",
          "-C",
          "/fake/tmp/probe-1",
          ...disabledCodexFeatures.flatMap((feature) => ["--disable", feature]),
          probePrompt,
        ],
        cwd: "/fake/tmp/probe-1",
        captureStdout: false,
        timeoutMs: probeTimeoutMs,
        maxStdoutBytes: maxReplyBytes,
      },
    ]);
    expect(readPaths).toEqual(["/fake/tmp/probe-1/reply.txt"]);
  });

  test("PR-1/PR-2: no bare, schema, or permission-bypass option is ever passed", async () => {
    for (const provider of ["claude-code", "codex"] as const) {
      const { probe, runs } = harness([{ run: exited(1) }, { run: exited(1) }]);
      await probe({
        provider,
        executablePath: `/fake/bin/${provider}`,
        summaryModel: "fictional-model",
      });
      const joined = runs.flatMap((run) => run.args).join(" ");
      expect(joined).not.toMatch(
        /--bare|schema|dangerously|bypass|approve-for-me|skip-permissions|--add-dir|workspace-write|full-access/,
      );
    }
  });
});

describe("PR-3 to PR-6 attempt order", () => {
  test("PR-3: the lowest-cost model is tried first and a pass stops there", async () => {
    expect(lowestCostModels).toEqual({
      "claude-code": "haiku",
      codex: "gpt-5.6-luna",
    });
    const { probe, runs } = harness([{ run: claudeOk }]);

    expect(
      await probe({
        provider: "claude-code",
        executablePath: "/fake/bin/claude",
        summaryModel: "opus",
      }),
    ).toEqual({ ok: true, attempt: "lowest-cost-model" });
    expect(runs).toHaveLength(1);
  });

  test("PR-4: a failed first attempt retries with the summary model, or no model option for the default", async () => {
    const withModel = harness([{ run: exited(1) }, { run: claudeOk }]);
    expect(
      await withModel.probe({
        provider: "claude-code",
        executablePath: "/fake/bin/claude",
        summaryModel: "opus",
      }),
    ).toEqual({ ok: true, attempt: "summary-model" });
    expect(withModel.runs[1]?.args).toContain("opus");
    expect(withModel.runs[1]?.cwd).toBe("/fake/tmp/probe-2");

    const withDefault = harness([{ run: exited(1) }, {}]);
    expect(
      await withDefault.probe({
        provider: "codex",
        executablePath: "/fake/bin/codex",
      }),
    ).toEqual({ ok: true, attempt: "summary-model" });
    expect(withDefault.runs[1]?.args).not.toContain("-m");
    expect(withDefault.runs[1]?.args).not.toContain("gpt-5.6-luna");
  });

  test("PR-5: both attempts failing is not ready with one fixed reason per attempt", async () => {
    const { probe } = harness([
      { run: { kind: "timed-out" } },
      { run: exited(2) },
    ]);

    expect(
      await probe({ provider: "codex", executablePath: "/fake/bin/codex" }),
    ).toEqual({
      ok: false,
      failures: [
        { attempt: "lowest-cost-model", reason: "timed-out" },
        { attempt: "summary-model", reason: "exited-with-error" },
      ],
    });
  });

  test("PR-6: when the summary model is the lowest-cost model only one attempt runs", async () => {
    const { probe, runs } = harness([{ run: exited(1) }, { run: claudeOk }]);

    expect(
      await probe({
        provider: "claude-code",
        executablePath: "/fake/bin/claude",
        summaryModel: "haiku",
      }),
    ).toEqual({
      ok: false,
      failures: [{ attempt: "lowest-cost-model", reason: "exited-with-error" }],
    });
    expect(runs).toHaveLength(1);
  });
});

describe("PR-7 pass rule", () => {
  async function firstReason(provider: SummaryProvider, scripted: Scripted) {
    const { probe } = harness([scripted, scripted]);
    const outcome = await probe({
      provider,
      executablePath: `/fake/bin/${provider}`,
      summaryModel: lowestCostModels[provider],
    });
    return outcome.ok ? "pass" : outcome.failures[0]?.reason;
  }

  test("PR-7: Claude Code passes only with exit 0 and a non-empty reply field", async () => {
    const cases: Array<[ProbeRunResult, string]> = [
      [claudeOk, "pass"],
      [exited(1, JSON.stringify({ result: "ready" })), "exited-with-error"],
      [exited(null), "exited-with-error"],
      [
        exited(0, JSON.stringify({ is_error: true, result: "x" })),
        "exited-with-error",
      ],
      [exited(0, JSON.stringify({ result: "   " })), "empty-reply"],
      [exited(0, JSON.stringify({ other: "ready" })), "empty-reply"],
      [exited(0, ""), "unreadable-reply"],
      [exited(0, "not json"), "unreadable-reply"],
      [exited(0, "[]"), "unreadable-reply"],
      [
        { kind: "exited", exitCode: 0, stdout: "", stdoutTooLarge: true },
        "reply-too-large",
      ],
    ];
    for (const [run, expected] of cases) {
      expect(
        await firstReason("claude-code", { run }),
        JSON.stringify(run),
      ).toBe(expected);
    }
  });

  test("PR-7: Codex passes only with exit 0 and a non-empty reply file", async () => {
    const cases: Array<[Scripted, string]> = [
      [{ reply: { kind: "text", text: "ready" } }, "pass"],
      [
        { run: exited(3), reply: { kind: "text", text: "ready" } },
        "exited-with-error",
      ],
      [{ reply: { kind: "text", text: " \n" } }, "empty-reply"],
      [{ reply: { kind: "missing" } }, "empty-reply"],
      [{ reply: { kind: "unreadable" } }, "unreadable-reply"],
      [{ reply: { kind: "too-large" } }, "reply-too-large"],
    ];
    for (const [scripted, expected] of cases) {
      expect(
        await firstReason("codex", scripted),
        JSON.stringify(scripted),
      ).toBe(expected);
    }
  });
});

describe("PR-8 / PR-9 process runner", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  class FakeChild extends EventEmitter {
    stdout = new EventEmitter();
    signals: string[] = [];
    constructor(private readonly exitOn: string | undefined) {
      super();
    }
    kill(signal: string) {
      this.signals.push(signal);
      if (signal === this.exitOn)
        queueMicrotask(() => this.emit("close", null, signal));
      return true;
    }
  }

  const request: ProbeRunRequest = {
    file: "/fake/bin/codex",
    args: ["exec"],
    cwd: "/fake/tmp/probe-1",
    captureStdout: true,
    timeoutMs: probeTimeoutMs,
    maxStdoutBytes: 8,
  };

  test("PR-8: an attempt still running at 60 seconds is stopped and reported as timed-out", async () => {
    vi.useFakeTimers();
    const child = new FakeChild("SIGTERM");
    const runner = createProcessRunner({ spawn: () => child });

    const result = runner(request);
    await vi.advanceTimersByTimeAsync(probeTimeoutMs - 1);
    expect(child.signals).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(await result).toEqual({ kind: "timed-out" });
    expect(child.signals).toEqual(["SIGTERM"]);
  });

  test("PR-8: a process that ignores SIGTERM is force-killed", async () => {
    vi.useFakeTimers();
    const child = new FakeChild("SIGKILL");
    const runner = createProcessRunner({ spawn: () => child, graceMs: 5_000 });

    const result = runner(request);
    await vi.advanceTimersByTimeAsync(probeTimeoutMs);
    expect(child.signals).toEqual(["SIGTERM"]);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await result).toEqual({ kind: "timed-out" });
    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  test("PR-9: a synchronous spawn failure or an error event is could-not-start", async () => {
    const throwing = createProcessRunner({
      spawn: () => {
        throw new Error(secret);
      },
    });
    expect(await throwing(request)).toEqual({ kind: "could-not-start" });

    const child = new FakeChild(undefined);
    const erroring = createProcessRunner({ spawn: () => child });
    const result = erroring(request);
    child.emit("error", new Error(secret));
    expect(await result).toEqual({ kind: "could-not-start" });
  });

  test("PR-9: the probe maps could-not-start and runner or temp-directory errors to could-not-start", async () => {
    const { probe } = harness([
      { run: { kind: "could-not-start" } },
      { run: "throw" },
    ]);
    expect(
      await probe({ provider: "codex", executablePath: "/fake/bin/codex" }),
    ).toEqual({
      ok: false,
      failures: [
        { attempt: "lowest-cost-model", reason: "could-not-start" },
        { attempt: "summary-model", reason: "could-not-start" },
      ],
    });

    const noTemp = createReadinessProbe({
      runner: async () => claudeOk,
      tempDirs: {
        async create() {
          throw new Error(secret);
        },
        async remove() {},
      },
      readReplyFile: async () => ({ kind: "missing" }),
    });
    const outcome = await noTemp({
      provider: "claude-code",
      executablePath: "/fake/bin/claude",
      summaryModel: "haiku",
    });
    expect(outcome).toEqual({
      ok: false,
      failures: [{ attempt: "lowest-cost-model", reason: "could-not-start" }],
    });
  });

  test("runner spawns without a shell, captures stdout only when asked, and caps it", async () => {
    const calls: Array<{
      file: string;
      args: readonly string[];
      options: unknown;
    }> = [];
    const child = new FakeChild(undefined);
    const runner = createProcessRunner({
      spawn: (file, args, options) => {
        calls.push({ file, args, options });
        return child;
      },
    });

    const result = runner(request);
    child.stdout.emit("data", Buffer.from("123456789"));
    child.emit("close", 0, null);

    expect(await result).toEqual({
      kind: "exited",
      exitCode: 0,
      stdout: "12345678",
      stdoutTooLarge: true,
    });
    expect(calls[0]?.options).toEqual({
      cwd: "/fake/tmp/probe-1",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });

    const quiet = new FakeChild(undefined);
    const quietRunner = createProcessRunner({
      spawn: (file, args, options) => {
        calls.push({ file, args, options });
        return quiet;
      },
    });
    const quietResult = quietRunner({ ...request, captureStdout: false });
    quiet.emit("close", 0, null);
    expect(await quietResult).toEqual({
      kind: "exited",
      exitCode: 0,
      stdout: "",
      stdoutTooLarge: false,
    });
    expect(calls[1]?.options).toMatchObject({
      stdio: ["ignore", "ignore", "ignore"],
    });
  });
});

test("PR-10: reply text, errors, and environment never appear in outcomes; temporary directories are always removed", async () => {
  process.env.PROBE_TEST_SECRET = secret;
  try {
    const scenarios: Scripted[][] = [
      [{ run: exited(0, JSON.stringify({ result: secret })) }],
      [{ run: exited(1, secret) }, { run: exited(0, secret) }],
      [{ run: { kind: "timed-out" } }, { run: "throw" }],
      [
        { run: { kind: "could-not-start" } },
        { reply: { kind: "text", text: secret } },
      ],
    ];
    for (const attempts of scenarios) {
      for (const provider of ["claude-code", "codex"] as const) {
        const { probe, created, removed } = harness(attempts);
        const outcome = await probe({
          provider,
          executablePath: `/fake/bin/${provider}`,
        });
        expect(JSON.stringify(outcome)).not.toMatch(/SECRET|sk-test/);
        expect(removed).toEqual(created);
        expect(created.length).toBeGreaterThan(0);
      }
    }
  } finally {
    delete process.env.PROBE_TEST_SECRET;
  }
});

test("regression (not an approved product case): disk reply reader and temporary directories", async () => {
  const { writeFile, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { osProbeTempDirs, readReplyFileFromDisk } =
    await import("../../src/summarizer/readiness-probe.js");

  const directory = await osProbeTempDirs.create();
  try {
    const file = join(directory, "reply.txt");
    expect(await readReplyFileFromDisk(file, 8)).toEqual({ kind: "missing" });
    await writeFile(file, "ready");
    expect(await readReplyFileFromDisk(file, 8)).toEqual({
      kind: "text",
      text: "ready",
    });
    await writeFile(file, "123456789");
    expect(await readReplyFileFromDisk(file, 8)).toEqual({ kind: "too-large" });
    expect(await readReplyFileFromDisk(directory, 8)).toEqual({
      kind: "unreadable",
    });
  } finally {
    await osProbeTempDirs.remove(directory);
  }
  await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

describe("PR-11 to PR-15 readiness state", () => {
  async function loginModule() {
    return import("../../src/summarizer/provider-login.js");
  }

  function signIn(initial: "signed-in" | "signed-out" | "missing") {
    let state = initial;
    const spawnedStatus: string[] = [];
    return {
      set(next: typeof state) {
        state = next;
      },
      spawnedStatus,
      executor: {
        async locate(name: string) {
          return state === "missing" ? undefined : `/fake/bin/${name}`;
        },
        async run(file: string) {
          spawnedStatus.push(file);
          return {
            exitCode: state === "signed-in" ? 0 : 1,
            stdout: secret,
            stderr: secret,
          };
        },
      },
    };
  }

  const launcher = { async launch() {} };
  const clock = () => new Date("2026-09-18T04:32:00.000Z");

  test("PR-11: a probe starts only for a signed-in provider", async () => {
    const { createProviderLoginService } = await loginModule();
    for (const initial of ["signed-out", "missing"] as const) {
      const account = signIn(initial);
      let probes = 0;
      const service = createProviderLoginService({
        executor: account.executor,
        launcher,
        probe: async () => {
          probes += 1;
          return { ok: true, attempt: "lowest-cost-model" };
        },
        now: clock,
      });
      for (const provider of ["codex", "claude-code"] as const) {
        const status = await service.checkReadiness(provider);
        expect(status.state).toBe(
          initial === "missing" ? "not-installed" : "sign-in-required",
        );
      }
      expect(probes).toBe(0);
    }
  });

  test("PR-12: a second request while a probe runs does not start another and reports checking", async () => {
    const { createProviderLoginService } = await loginModule();
    const account = signIn("signed-in");
    let probes = 0;
    let release: (() => void) | undefined;
    const service = createProviderLoginService({
      executor: account.executor,
      launcher,
      probe: () => {
        probes += 1;
        return new Promise((resolve) => {
          release = () => resolve({ ok: true, attempt: "lowest-cost-model" });
        });
      },
      now: clock,
    });

    const first = service.checkReadiness("codex");
    await vi.waitFor(() => expect(release).toBeDefined());
    const second = await service.checkReadiness("codex");
    expect(second).toMatchObject({ state: "probe-failed", checking: true });
    expect((await service.status("codex")).checking).toBe(true);
    expect(probes).toBe(1);

    release?.();
    expect(await first).toMatchObject({ state: "ready" });
    expect(await service.status("codex")).not.toHaveProperty("checking");
  });

  test("PR-13: Ready is held in memory with its check time, replaced by the next result, and absent after restart", async () => {
    const { createProviderLoginService } = await loginModule();
    const account = signIn("signed-in");
    const outcomes = [
      { ok: true as const, attempt: "summary-model" as const },
      {
        ok: false as const,
        failures: [
          {
            attempt: "lowest-cost-model" as const,
            reason: "timed-out" as const,
          },
          { attempt: "summary-model" as const, reason: "empty-reply" as const },
        ],
      },
    ];
    let time = 0;
    const times = ["2026-09-18T04:32:00.000Z", "2026-09-18T05:00:00.000Z"];
    const makeService = () =>
      createProviderLoginService({
        executor: account.executor,
        launcher,
        probe: async () =>
          outcomes.shift() ?? {
            ok: true as const,
            attempt: "lowest-cost-model" as const,
          },
        now: () => new Date(times[time++] ?? times[0]!),
      });
    const service = makeService();

    expect(await service.checkReadiness("claude-code")).toEqual({
      provider: "claude-code",
      label: "Claude Code",
      state: "ready",
      installUrl: expect.stringMatching(/^https:/),
      signedIn: true,
      checkedAt: "2026-09-18T04:32:00.000Z",
      readyVia: "summary-model",
    });
    expect(await service.status("claude-code")).toMatchObject({
      state: "ready",
      checkedAt: "2026-09-18T04:32:00.000Z",
    });

    expect(await service.checkReadiness("claude-code")).toMatchObject({
      state: "probe-failed",
      checkedAt: "2026-09-18T05:00:00.000Z",
      probeFailures: [
        { attempt: "lowest-cost-model", reason: "timed-out" },
        { attempt: "summary-model", reason: "empty-reply" },
      ],
    });

    const restarted = makeService();
    const fresh = await restarted.status("claude-code");
    expect(fresh.state).toBe("probe-failed");
    expect(fresh).not.toHaveProperty("checkedAt");
    expect(fresh.reason).toBe("Signed in; readiness has not been checked.");
  });

  test("PR-14: a later status read showing the provider not signed in clears Ready", async () => {
    const { createProviderLoginService } = await loginModule();
    for (const next of ["signed-out", "missing"] as const) {
      const account = signIn("signed-in");
      const service = createProviderLoginService({
        executor: account.executor,
        launcher,
        probe: async () => ({ ok: true, attempt: "lowest-cost-model" }),
        now: clock,
      });
      expect((await service.checkReadiness("codex")).state).toBe("ready");

      account.set(next);
      await service.status("codex");
      account.set("signed-in");

      const status = await service.status("codex");
      expect(status.state).toBe("probe-failed");
      expect(status).not.toHaveProperty("checkedAt");
    }
  });

  test("PR-15: ready only while Ready is held and still signed in; otherwise the not-ready state", async () => {
    const { createProviderLoginService } = await loginModule();
    const account = signIn("signed-in");
    const service = createProviderLoginService({
      executor: account.executor,
      launcher,
      probe: async () => ({ ok: true, attempt: "lowest-cost-model" }),
      now: clock,
    });
    expect(await service.status("codex")).toMatchObject({
      state: "probe-failed",
      reason: "Signed in; readiness has not been checked.",
    });
    await service.checkReadiness("codex");
    expect((await service.status("codex")).state).toBe("ready");
    expect((await service.status("claude-code")).state).toBe("probe-failed");

    const noProbe = createProviderLoginService({
      executor: account.executor,
      launcher,
    });
    expect(await noProbe.checkReadiness("codex")).toMatchObject({
      state: "probe-failed",
      reason: "Signed in; readiness check is unavailable.",
    });
  });

  test("PR-10 (service): a throwing probe is a sanitized could-not-start failure", async () => {
    const { createProviderLoginService } = await loginModule();
    const account = signIn("signed-in");
    const service = createProviderLoginService({
      executor: account.executor,
      launcher,
      probe: async () => {
        throw new Error(secret);
      },
      now: clock,
    });
    const status = await service.checkReadiness("codex");
    expect(status).toMatchObject({
      state: "probe-failed",
      probeFailures: [
        { attempt: "lowest-cost-model", reason: "could-not-start" },
      ],
    });
    expect(JSON.stringify(status)).not.toMatch(/SECRET|sk-test/);
  });
});

test("PR-17 support: only signed-in statuses carry signedIn, so the page can enable Check readiness", async () => {
  const { createProviderLoginService } =
    await import("../../src/summarizer/provider-login.js");
  const cases: Array<[number | "missing", boolean]> = [
    [0, true],
    [1, false],
    [134, false],
    ["missing", false],
  ];
  for (const [exitCode, signedIn] of cases) {
    const service = createProviderLoginService({
      executor: {
        async locate(name) {
          return exitCode === "missing" ? undefined : `/fake/bin/${name}`;
        },
        async run() {
          return {
            exitCode: exitCode === "missing" ? 1 : exitCode,
            stdout: "",
            stderr: "",
          };
        },
      },
      launcher: { async launch() {} },
      probe: async () => ({ ok: true, attempt: "lowest-cost-model" }),
    });
    const status = await service.status("codex");
    if (signedIn) expect(status.signedIn).toBe(true);
    else expect(status).not.toHaveProperty("signedIn");
  }
});

describe("EP probe effort", () => {
  test("EP-1: the first attempt never passes an effort; the second passes the summary effort", async () => {
    const claude = harness([{ run: exited(1) }, { run: claudeOk }]);
    await claude.probe({
      provider: "claude-code",
      executablePath: "/fake/bin/claude",
      summaryModel: "opus",
      summaryEffort: "max",
    });
    expect(claude.runs[0]?.args).not.toContain("--effort");
    expect(claude.runs[1]?.args).toEqual([
      "-p",
      "--tools",
      "",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--output-format",
      "json",
      "--model",
      "opus",
      "--effort",
      "max",
      probePrompt,
    ]);

    const codex = harness([{ run: exited(1) }, {}]);
    await codex.probe({
      provider: "codex",
      executablePath: "/fake/bin/codex",
      summaryModel: "gpt-5.6-terra",
      summaryEffort: "ultra",
    });
    expect(codex.runs[0]?.args.join(" ")).not.toContain(
      "model_reasoning_effort",
    );
    const second = codex.runs[1]?.args ?? [];
    const index = second.indexOf("-m");
    expect(second.slice(index, index + 4)).toEqual([
      "-m",
      "gpt-5.6-terra",
      "-c",
      'model_reasoning_effort="ultra"',
    ]);

    const noEffort = harness([{ run: exited(1) }, { run: exited(1) }]);
    await noEffort.probe({
      provider: "codex",
      executablePath: "/fake/bin/codex",
    });
    expect(noEffort.runs.flatMap((run) => run.args).join(" ")).not.toMatch(
      /effort/,
    );
  });

  test("EP-2: the same model with an effort still runs a second attempt", async () => {
    const { probe, runs } = harness([{ run: exited(1) }, { run: claudeOk }]);
    expect(
      await probe({
        provider: "claude-code",
        executablePath: "/fake/bin/claude",
        summaryModel: "haiku",
        summaryEffort: "low",
      }),
    ).toEqual({ ok: true, attempt: "summary-model" });
    expect(runs).toHaveLength(2);
    expect(runs[1]?.args).toContain("--effort");
  });
});

test("PR-18: the service holds which attempt passed with Ready and clears it with Ready", async () => {
  const { createProviderLoginService } =
    await import("../../src/summarizer/provider-login.js");
  let signedIn = true;
  const outcomes = [
    { ok: true as const, attempt: "lowest-cost-model" as const },
    {
      ok: false as const,
      failures: [
        { attempt: "lowest-cost-model" as const, reason: "timed-out" as const },
      ],
    },
  ];
  const service = createProviderLoginService({
    executor: {
      async locate(name) {
        return `/fake/bin/${name}`;
      },
      async run() {
        return { exitCode: signedIn ? 0 : 1, stdout: "", stderr: "" };
      },
    },
    launcher: { async launch() {} },
    probe: async () =>
      outcomes.shift() ?? { ok: true, attempt: "summary-model" },
  });

  expect(await service.checkReadiness("codex")).toMatchObject({
    state: "ready",
    readyVia: "lowest-cost-model",
  });
  const failed = await service.checkReadiness("codex");
  expect(failed.state).toBe("probe-failed");
  expect(failed).not.toHaveProperty("readyVia");
  expect(await service.checkReadiness("codex")).toMatchObject({
    readyVia: "summary-model",
  });
  signedIn = false;
  await service.status("codex");
  signedIn = true;
  expect(await service.status("codex")).not.toHaveProperty("readyVia");
});
