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
