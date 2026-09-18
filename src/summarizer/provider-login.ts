import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { basename, delimiter, isAbsolute, join } from "node:path";

import type { SummaryProvider } from "../storage/summary-permission.js";
import type {
  ProbeAttempt,
  ProbeAttemptFailure,
  ReadinessProbe,
} from "./readiness-probe.js";

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
  /** Present only when the status command reported a signed-in provider. */
  signedIn?: true;
  /** When the held readiness result was checked (ISO 8601). */
  checkedAt?: string;
  probeFailures?: ProbeAttemptFailure[];
  checking?: true;
  /** Which probe attempt produced Ready. */
  readyVia?: ProbeAttempt;
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

export interface ProviderLoginService {
  list(): Promise<ProviderLoginStatus[]>;
  status(provider: SummaryProvider): Promise<ProviderLoginStatus>;
  startLogin(provider: SummaryProvider): Promise<ProviderLoginStatus>;
  /** Runs the readiness probe; only when the user asks (decision C1). */
  checkReadiness(provider: SummaryProvider): Promise<ProviderLoginStatus>;
}

interface ProviderDefinition {
  label: string;
  executable: string;
  installUrl: string;
  login: readonly string[];
  status: readonly string[];
  // The status command's documented "not logged in" exit code. Any other
  // non-zero exit (a crashed wrapper, a signal, a timeout) is not proof that
  // sign-in is required.
  unauthenticatedExitCode: number;
}

const definitions: Record<SummaryProvider, ProviderDefinition> = {
  codex: {
    label: "Codex",
    executable: "codex",
    installUrl: "https://github.com/openai/codex#quickstart",
    login: ["login"],
    status: ["login", "status"],
    // codex-rs/cli/src/login.rs: "Not logged in" exits 1. An auth-file read
    // error also exits 1 and cannot be told apart without reading output.
    unauthenticatedExitCode: 1,
  },
  "claude-code": {
    label: "Claude Code",
    executable: "claude",
    installUrl: "https://docs.claude.com/en/docs/claude-code/setup",
    login: ["auth", "login"],
    status: ["auth", "status"],
    // CLI reference: "Exits with code 0 if logged in, 1 if not".
    unauthenticatedExitCode: 1,
  },
  agy: {
    label: "Gemini (agy)",
    executable: "agy",
    installUrl: "https://github.com/google-gemini/antigravity",
    login: [],
    status: ["models"],
    unauthenticatedExitCode: 1,
  },
};

export const summaryProviders: readonly SummaryProvider[] = [
  "codex",
  "claude-code",
  "agy",
];

export function isSummaryProvider(value: unknown): value is SummaryProvider {
  return value === "codex" || value === "claude-code" || value === "agy";
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
  probeUnavailable: "Signed in; readiness check is unavailable.",
  notChecked: "Signed in; readiness has not been checked.",
  checking: "Readiness check in progress.",
  probeFailed: "The readiness check did not pass.",
  launchFailed: "Sign-in could not be started.",
} as const;

type HeldReadiness =
  | { kind: "ready"; checkedAt: string; attempt: ProbeAttempt }
  | { kind: "failed"; checkedAt: string; failures: ProbeAttemptFailure[] };

type SignIn =
  | { kind: "not-installed" }
  | { kind: "signed-out" }
  | { kind: "unavailable" }
  | { kind: "signed-in"; path: string };

export function createProviderLoginService({
  executor,
  launcher,
  probe,
  now = () => new Date(),
  summarySettings,
}: {
  executor: CommandExecutor;
  launcher: LoginLauncher;
  probe?: ReadinessProbe;
  now?: () => Date;
  /** Effective summary model and effort; undefined values mean CLI defaults. */
  summarySettings?: (
    provider: SummaryProvider,
  ) => Promise<{ model?: string; effort?: string }>;
}): ProviderLoginService {
  const launched = new Set<SummaryProvider>();
  // Decision E1: readiness is held in memory only.
  const held = new Map<SummaryProvider, HeldReadiness>();
  const checking = new Set<SummaryProvider>();

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

  async function readSignIn(provider: SummaryProvider): Promise<SignIn> {
    const definition = definitionFor(provider);
    const path = await executor.locate(definition.executable);
    if (!path) return { kind: "not-installed" };
    let exitCode: number | null;
    try {
      // Only the exit code is used; command output is never inspected.
      ({ exitCode } = await executor.run(path, definition.status));
    } catch {
      return { kind: "unavailable" };
    }
    if (exitCode === 0) return { kind: "signed-in", path };
    if (exitCode === definition.unauthenticatedExitCode)
      return { kind: "signed-out" };
    return { kind: "unavailable" };
  }

  async function status(
    provider: SummaryProvider,
  ): Promise<ProviderLoginStatus> {
    const signIn = await readSignIn(provider);
    if (signIn.kind === "not-installed") {
      launched.delete(provider);
      held.delete(provider);
      return result(provider, "not-installed");
    }
    if (signIn.kind === "unavailable")
      return result(provider, "probe-failed", reasons.statusUnavailable);
    if (signIn.kind === "signed-out") {
      held.delete(provider);
      return result(
        provider,
        launched.has(provider) ? "login-in-progress" : "sign-in-required",
      );
    }
    launched.delete(provider);
    const signedIn = (
      state: ProviderLoginState,
      reason?: string,
    ): ProviderLoginStatus => ({
      ...result(provider, state, reason),
      signedIn: true,
    });
    if (checking.has(provider))
      return { ...signedIn("probe-failed", reasons.checking), checking: true };
    const readiness = held.get(provider);
    if (readiness?.kind === "ready")
      return {
        ...signedIn("ready"),
        checkedAt: readiness.checkedAt,
        readyVia: readiness.attempt,
      };
    if (readiness?.kind === "failed")
      return {
        ...signedIn("probe-failed", reasons.probeFailed),
        checkedAt: readiness.checkedAt,
        probeFailures: readiness.failures,
      };
    return signedIn(
      "probe-failed",
      probe ? reasons.notChecked : reasons.probeUnavailable,
    );
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
    async checkReadiness(provider) {
      definitionFor(provider);
      if (checking.has(provider) || !probe) return status(provider);
      checking.add(provider);
      try {
        const signIn = await readSignIn(provider);
        if (signIn.kind !== "signed-in") {
          checking.delete(provider);
          return status(provider);
        }
        let outcome: Awaited<ReturnType<ReadinessProbe>>;
        try {
          const settings = await summarySettings?.(provider).catch(
            () => undefined,
          );
          outcome = await probe({
            provider,
            executablePath: signIn.path,
            summaryModel: settings?.model,
            summaryEffort: settings?.effort,
          });
        } catch {
          outcome = {
            ok: false,
            failures: [
              { attempt: "lowest-cost-model", reason: "could-not-start" },
            ],
          };
        }
        const checkedAt = now().toISOString();
        held.set(
          provider,
          outcome.ok
            ? { kind: "ready", checkedAt, attempt: outcome.attempt }
            : { kind: "failed", checkedAt, failures: outcome.failures },
        );
      } finally {
        checking.delete(provider);
      }
      return status(provider);
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
