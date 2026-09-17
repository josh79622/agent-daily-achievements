import { expect, test } from "vitest";

import {
  createMacTerminalLauncher,
  createProviderLoginService,
  loginCommand,
  statusCommand,
  type CommandExecutor,
  type ProcessSpawner,
} from "../../src/summarizer/provider-login.js";
import type { SummaryProvider } from "../../src/storage/summary-permission.js";

const providers: SummaryProvider[] = ["codex", "claude-code"];
const secret = "sk-SECRET-token user@example.com /Users/someone/.codex";

interface FakeOptions {
  installed?: boolean;
  statusExitCode?: number | null;
  statusError?: boolean;
}

function fakeExecutor(options: FakeOptions = {}) {
  const runs: Array<{ file: string; args: readonly string[] }> = [];
  const executor: CommandExecutor = {
    async locate(name) {
      return options.installed === false ? undefined : `/fake/bin/${name}`;
    },
    async run(file, args) {
      runs.push({ file, args });
      if (options.statusError) throw new Error(secret);
      return {
        exitCode: "statusExitCode" in options ? options.statusExitCode! : 0,
        stdout: secret,
        stderr: secret,
      };
    },
  };
  return { executor, runs };
}

function fakeLauncher() {
  const launches: Array<{ file: string; args: readonly string[] }> = [];
  return {
    launches,
    launcher: {
      async launch(file: string, args: readonly string[]) {
        launches.push({ file, args });
      },
    },
  };
}

for (const provider of providers) {
  test(`${provider}: a missing executable is not-installed and never starts login`, async () => {
    const { executor, runs } = fakeExecutor({ installed: false });
    const { launcher, launches } = fakeLauncher();
    const service = createProviderLoginService({ executor, launcher });

    const status = await service.status(provider);
    expect(status).toMatchObject({ provider, state: "not-installed" });
    expect(status.installUrl).toMatch(/^https:\/\//);

    expect((await service.startLogin(provider)).state).toBe("not-installed");
    expect(runs).toEqual([]);
    expect(launches).toEqual([]);
  });

  test(`${provider}: an unauthenticated status command means sign-in-required`, async () => {
    const { executor, runs } = fakeExecutor({ statusExitCode: 1 });
    const service = createProviderLoginService({
      executor,
      launcher: fakeLauncher().launcher,
    });

    expect((await service.status(provider)).state).toBe("sign-in-required");
    expect(runs).toEqual([
      { file: fakePath(provider), args: statusCommand(provider) },
    ]);
  });

  test(`${provider}: an unexpected status exit is status-unavailable, never sign-in-required`, async () => {
    // Codex source and Claude Code docs both use exit 1 for "not logged in";
    // 134 is what a crashing CLI wrapper (SIGABRT) returns on this Mac.
    for (const statusExitCode of [134, 2, 127, 255, null]) {
      const { executor } = fakeExecutor({ statusExitCode });
      const { launcher } = fakeLauncher();
      const service = createProviderLoginService({ executor, launcher });

      const status = await service.status(provider);
      expect(status, `exit ${statusExitCode}`).toMatchObject({
        state: "probe-failed",
        reason: "Sign-in status could not be checked.",
      });
      expect(JSON.stringify(status)).not.toContain("SECRET");

      await service.startLogin(provider);
      expect((await service.status(provider)).state).toBe("probe-failed");
    }
  });

  test(`${provider}: signed in without a configured readiness probe is never ready`, async () => {
    const { executor } = fakeExecutor({ statusExitCode: 0 });
    const service = createProviderLoginService({
      executor,
      launcher: fakeLauncher().launcher,
    });

    const status = await service.status(provider);
    expect(status.state).not.toBe("ready");
    expect(status.state).toBe("probe-failed");
    expect(status.reason).toBe("Signed in; readiness check is unavailable.");
  });

  test(`${provider}: reading status never runs the probe; only checkReadiness does (decision C1)`, async () => {
    for (const statusExitCode of [0, 1]) {
      const { executor } = fakeExecutor({ statusExitCode });
      let probed = 0;
      const service = createProviderLoginService({
        executor,
        launcher: fakeLauncher().launcher,
        probe: async () => {
          probed += 1;
          return { ok: true, attempt: "lowest-cost-model" };
        },
      });
      await service.status(provider);
      await service.list();
      expect(probed).toBe(0);
      if (statusExitCode === 0) {
        expect((await service.checkReadiness(provider)).state).toBe("ready");
        expect(probed).toBe(1);
      }
    }
  });

  test(`${provider}: starting login launches only the fixed command and shows login-in-progress`, async () => {
    const { executor } = fakeExecutor({ statusExitCode: 1 });
    const { launcher, launches } = fakeLauncher();
    const service = createProviderLoginService({ executor, launcher });

    expect((await service.startLogin(provider)).state).toBe(
      "login-in-progress",
    );
    expect(launches).toEqual([
      { file: fakePath(provider), args: loginCommand(provider) },
    ]);
    expect((await service.status(provider)).state).toBe("login-in-progress");
  });

  test(`${provider}: command output, errors, and environment never reach status`, async () => {
    process.env.PROVIDER_LOGIN_TEST_SECRET = secret;
    try {
      for (const options of [
        { statusExitCode: 0 },
        { statusExitCode: 2 },
        { statusError: true },
      ]) {
        const { executor } = fakeExecutor(options);
        const service = createProviderLoginService({
          executor,
          launcher: {
            async launch() {
              throw new Error(secret);
            },
          },
          probe: async () => {
            throw new Error(secret);
          },
        });
        const statuses = [
          await service.status(provider),
          await service.checkReadiness(provider),
          await service.startLogin(provider),
          ...(await service.list()),
        ];
        expect(JSON.stringify(statuses)).not.toMatch(/SECRET|example\.com/);
      }
    } finally {
      delete process.env.PROVIDER_LOGIN_TEST_SECRET;
    }
  });
}

test("fixed commands: each provider maps to its own login and status arguments", () => {
  expect(loginCommand("codex")).toEqual(["login"]);
  expect(statusCommand("codex")).toEqual(["login", "status"]);
  expect(loginCommand("claude-code")).toEqual(["auth", "login"]);
  expect(statusCommand("claude-code")).toEqual(["auth", "status"]);
});

test("fixed commands: arbitrary provider strings are rejected", async () => {
  for (const value of ["", "bash", "codex; rm -rf /", "__proto__", "claude"]) {
    expect(() => loginCommand(value as SummaryProvider)).toThrow();
    expect(() => statusCommand(value as SummaryProvider)).toThrow();
  }
  const { executor, runs } = fakeExecutor();
  const { launcher, launches } = fakeLauncher();
  const service = createProviderLoginService({ executor, launcher });
  await expect(
    service.startLogin("sh -c id" as SummaryProvider),
  ).rejects.toThrow();
  expect(runs).toEqual([]);
  expect(launches).toEqual([]);
});

test("list: returns both providers with only safe fields", async () => {
  const { executor } = fakeExecutor({ statusExitCode: 1 });
  const service = createProviderLoginService({
    executor,
    launcher: fakeLauncher().launcher,
  });

  const statuses = await service.list();
  expect(statuses.map((status) => status.provider)).toEqual([
    "codex",
    "claude-code",
  ]);
  for (const status of statuses) {
    expect(Object.keys(status).sort()).toEqual(
      ["installUrl", "label", "provider", "state"].sort(),
    );
  }
});

function fakePath(provider: SummaryProvider): string {
  return provider === "codex" ? "/fake/bin/codex" : "/fake/bin/claude";
}

function fakeSpawner(exitCode: number | null = 0) {
  const spawns: Array<{
    file: string;
    args: readonly string[];
    options: Parameters<ProcessSpawner>[2];
  }> = [];
  const spawner: ProcessSpawner = async (file, args, options) => {
    spawns.push({ file, args, options });
    if (exitCode === null) throw new Error(secret);
    return { exitCode };
  };
  return { spawner, spawns };
}

for (const provider of providers) {
  test(`mac launcher: ${provider} opens Terminal via osascript with only its fixed login command`, async () => {
    const { spawner, spawns } = fakeSpawner();
    const { executor } = fakeExecutor({ statusExitCode: 1 });
    const service = createProviderLoginService({
      executor,
      launcher: createMacTerminalLauncher({ spawner, platform: "darwin" }),
    });

    expect((await service.startLogin(provider)).state).toBe(
      "login-in-progress",
    );

    expect(spawns).toHaveLength(1);
    const [spawn] = spawns;
    expect(spawn?.file).toBe("/usr/bin/osascript");
    expect(spawn?.options).toEqual({ shell: false, stdio: "ignore" });
    const scriptEnd = spawn!.args.lastIndexOf("end run");
    expect(spawn!.args.slice(scriptEnd + 1)).toEqual([
      fakePath(provider),
      ...loginCommand(provider),
    ]);
    expect(spawn!.args.join("\n")).toMatch(/tell application "Terminal"/);
    expect(spawn!.args.join("\n")).toMatch(/quoted form of/);
    expect(spawn!.args.slice(0, scriptEnd + 1).join("\n")).not.toContain(
      fakePath(provider),
    );
  });
}

test("mac launcher: rejects untrusted executable and argument text without spawning", async () => {
  const { spawner, spawns } = fakeSpawner();
  const launcher = createMacTerminalLauncher({ spawner, platform: "darwin" });

  const attempts: Array<[string, readonly string[]]> = [
    ["/bin/sh", ["login"]],
    ["codex", ["login"]],
    ["/fake/bin/codex; id", ["login"]],
    ["/fake/bin/codex", ["exec", "hello"]],
    ["/fake/bin/codex", ["login", "--with-api-key"]],
    ["/fake/bin/claude", ["login"]],
    ["/fake/bin/codex", ["auth", "login"]],
    ["/fake/b'in/claude", ["auth", "login"]],
  ];
  for (const [file, args] of attempts) {
    await expect(launcher.launch(file, args)).rejects.toThrow();
  }
  expect(spawns).toEqual([]);
});

test("mac launcher: refuses to run outside macOS", async () => {
  const { spawner, spawns } = fakeSpawner();
  const launcher = createMacTerminalLauncher({ spawner, platform: "linux" });

  await expect(launcher.launch("/fake/bin/codex", ["login"])).rejects.toThrow(
    /macOS/,
  );
  expect(spawns).toEqual([]);
});

for (const exitCode of [1, null]) {
  test(`mac launcher: ${exitCode === null ? "spawn error" : "non-zero exit"} becomes a sanitized launch failure`, async () => {
    const { spawner } = fakeSpawner(exitCode);
    const { executor } = fakeExecutor({ statusExitCode: 1 });
    const service = createProviderLoginService({
      executor,
      launcher: createMacTerminalLauncher({ spawner, platform: "darwin" }),
    });

    const started = await service.startLogin("codex");
    expect(started).toMatchObject({
      state: "probe-failed",
      reason: "Sign-in could not be started.",
    });
    expect(JSON.stringify(started)).not.toContain("SECRET");
    expect((await service.status("codex")).state).toBe("sign-in-required");
    expect((await service.status("claude-code")).state).toBe(
      "sign-in-required",
    );
  });
}
