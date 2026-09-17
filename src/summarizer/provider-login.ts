import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { basename, delimiter, isAbsolute, join } from "node:path";

import type { SummaryProvider } from "../storage/summary-permission.js";

export type ProviderLoginState =
  | "not-installed"
  | "sign-in-required"
  | "login-in-progress"
  | "ready"
  | "probe-failed";

export interface ProviderLoginStatus {
  provider: SummaryProvider;
  label: string;
  state: ProviderLoginState;
  installUrl: string;
  reason?: string;
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface CommandExecutor {
  locate(executable: string): Promise<string | undefined>;
  run(file: string, args: readonly string[]): Promise<CommandResult>;
}

export interface LoginLauncher {
  launch(file: string, args: readonly string[]): Promise<void>;
}

// A zero-conversation readiness check. Production has none until Josh
// approves a concrete probe command.
export type ProviderProbe = (
  provider: SummaryProvider,
  executablePath: string,
) => Promise<void>;

export interface ProviderLoginService {
  list(): Promise<ProviderLoginStatus[]>;
  status(provider: SummaryProvider): Promise<ProviderLoginStatus>;
  startLogin(provider: SummaryProvider): Promise<ProviderLoginStatus>;
}

interface ProviderDefinition {
  label: string;
  executable: string;
  installUrl: string;
  login: readonly string[];
  status: readonly string[];
}

const definitions: Record<SummaryProvider, ProviderDefinition> = {
  codex: {
    label: "Codex",
    executable: "codex",
    installUrl: "https://github.com/openai/codex#quickstart",
    login: ["login"],
    status: ["login", "status"],
  },
  "claude-code": {
    label: "Claude Code",
    executable: "claude",
    installUrl: "https://docs.claude.com/en/docs/claude-code/setup",
    login: ["auth", "login"],
    status: ["auth", "status"],
  },
};

export const summaryProviders: readonly SummaryProvider[] = [
  "codex",
  "claude-code",
];

export function isSummaryProvider(value: unknown): value is SummaryProvider {
  return value === "codex" || value === "claude-code";
}

function definitionFor(provider: SummaryProvider): ProviderDefinition {
  if (!isSummaryProvider(provider)) throw new Error("Unknown provider");
  return definitions[provider];
}

export function loginCommand(provider: SummaryProvider): readonly string[] {
  return definitionFor(provider).login;
}

export function statusCommand(provider: SummaryProvider): readonly string[] {
  return definitionFor(provider).status;
}

export function executableName(provider: SummaryProvider): string {
  return definitionFor(provider).executable;
}

const reasons = {
  statusUnavailable: "Sign-in status could not be checked.",
  probeUnapproved:
    "Signed in, but a readiness check has not been approved yet.",
  probeFailed: "The readiness check did not pass.",
  launchFailed: "Sign-in could not be started.",
} as const;

export function createProviderLoginService({
  executor,
  launcher,
  probe,
}: {
  executor: CommandExecutor;
  launcher: LoginLauncher;
  probe?: ProviderProbe;
}): ProviderLoginService {
  const launched = new Set<SummaryProvider>();

  function result(
    provider: SummaryProvider,
    state: ProviderLoginState,
    reason?: string,
  ): ProviderLoginStatus {
    const { label, installUrl } = definitionFor(provider);
    return reason
      ? { provider, label, state, installUrl, reason }
      : { provider, label, state, installUrl };
  }

  async function status(
    provider: SummaryProvider,
  ): Promise<ProviderLoginStatus> {
    const definition = definitionFor(provider);
    const path = await executor.locate(definition.executable);
    if (!path) {
      launched.delete(provider);
      return result(provider, "not-installed");
    }
    let signedIn: boolean;
    try {
      // Only the exit code is used; command output is never inspected.
      signedIn = (await executor.run(path, definition.status)).exitCode === 0;
    } catch {
      return result(provider, "probe-failed", reasons.statusUnavailable);
    }
    if (!signedIn) {
      return result(
        provider,
        launched.has(provider) ? "login-in-progress" : "sign-in-required",
      );
    }
    launched.delete(provider);
    if (!probe)
      return result(provider, "probe-failed", reasons.probeUnapproved);
    try {
      await probe(provider, path);
    } catch {
      return result(provider, "probe-failed", reasons.probeFailed);
    }
    return result(provider, "ready");
  }

  return {
    list: () => Promise.all(summaryProviders.map(status)),
    status,
    async startLogin(provider) {
      const definition = definitionFor(provider);
      const path = await executor.locate(definition.executable);
      if (!path) return result(provider, "not-installed");
      try {
        await launcher.launch(path, definition.login);
      } catch {
        launched.delete(provider);
        return result(provider, "probe-failed", reasons.launchFailed);
      }
      launched.add(provider);
      return result(provider, "login-in-progress");
    },
  };
}

export interface SpawnOptions {
  shell: false;
  stdio: "ignore";
}

export type ProcessSpawner = (
  file: string,
  args: readonly string[],
  options: SpawnOptions,
) => Promise<{ exitCode: number | null }>;

const spawnOptions: SpawnOptions = { shell: false, stdio: "ignore" };

// Paths are passed to AppleScript as argv and shell-quoted there, never
// interpolated into script text; this check is an additional allowlist.
const safeExecutablePath = /^\/[A-Za-z0-9._/@+-]+$/;

const terminalScript = [
  "on run argv",
  'set commandLine to ""',
  "repeat with part in argv",
  'set commandLine to commandLine & quoted form of (part as text) & " "',
  "end repeat",
  'tell application "Terminal"',
  "activate",
  "do script commandLine",
  "end tell",
  "end run",
];

export function createMacTerminalLauncher({
  spawner = spawnProcess,
  platform = process.platform,
}: {
  spawner?: ProcessSpawner;
  platform?: NodeJS.Platform;
} = {}): LoginLauncher {
  return {
    async launch(file, args) {
      if (platform !== "darwin") {
        throw new Error("Sign-in launch is only supported on macOS.");
      }
      const provider = summaryProviders.find(
        (candidate) =>
          basename(file) === executableName(candidate) &&
          sameArgs(args, loginCommand(candidate)),
      );
      if (!provider || !safeExecutablePath.test(file)) {
        throw new Error("Refusing to launch an unrecognized command.");
      }
      const scriptArgs = terminalScript.flatMap((line) => ["-e", line]);
      const { exitCode } = await spawner(
        "/usr/bin/osascript",
        [...scriptArgs, file, ...loginCommand(provider)],
        spawnOptions,
      );
      if (exitCode !== 0) throw new Error("Terminal launch failed.");
    },
  };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export const spawnProcess: ProcessSpawner = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { ...options, timeout: 15_000 });
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode }));
  });

// Output is never captured: stdio is ignored and only the exit code returns.
export function createLocalCommandExecutor({
  spawner = spawnProcess,
  searchPath = process.env.PATH ?? "",
}: {
  spawner?: ProcessSpawner;
  searchPath?: string;
} = {}): CommandExecutor {
  return {
    async locate(executable) {
      for (const directory of searchPath.split(delimiter)) {
        if (!isAbsolute(directory)) continue;
        const candidate = join(directory, executable);
        try {
          await access(candidate, constants.X_OK);
          return candidate;
        } catch {
          continue;
        }
      }
      return undefined;
    },
    async run(file, args) {
      const { exitCode } = await spawner(file, args, spawnOptions);
      return { exitCode, stdout: "", stderr: "" };
    },
  };
}
