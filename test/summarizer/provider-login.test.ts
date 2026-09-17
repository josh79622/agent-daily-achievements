import { expect, test } from "vitest";

import {
  createProviderLoginService,
  loginCommand,
  statusCommand,
  type CommandExecutor,
  type ProviderProbe,
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
        exitCode: options.statusExitCode ?? 0,
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

  test(`${provider}: signed in without an approved probe is never ready`, async () => {
    const { executor } = fakeExecutor({ statusExitCode: 0 });
    const service = createProviderLoginService({
      executor,
      launcher: fakeLauncher().launcher,
    });

    const status = await service.status(provider);
    expect(status.state).not.toBe("ready");
    expect(status.state).toBe("probe-failed");
    expect(status.reason).toMatch(/not been approved/);
  });

  test(`${provider}: probe success is ready; probe failure is sanitized probe-failed`, async () => {
    const { executor } = fakeExecutor({ statusExitCode: 0 });
    const passing: ProviderProbe = async () => {};
    const ready = createProviderLoginService({
      executor,
      launcher: fakeLauncher().launcher,
      probe: passing,
    });
    expect(await ready.status(provider)).toMatchObject({ state: "ready" });

    const failing: ProviderProbe = async () => {
      throw new Error(secret);
    };
    const failed = createProviderLoginService({
      executor,
      launcher: fakeLauncher().launcher,
      probe: failing,
    });
    const status = await failed.status(provider);
    expect(status.state).toBe("probe-failed");
    expect(JSON.stringify(status)).not.toContain("SECRET");
  });

  test(`${provider}: probe is not run while sign-in is required`, async () => {
    const { executor } = fakeExecutor({ statusExitCode: 1 });
    let probed = 0;
    const service = createProviderLoginService({
      executor,
      launcher: fakeLauncher().launcher,
      probe: async () => {
        probed += 1;
      },
    });
    await service.status(provider);
    expect(probed).toBe(0);
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
