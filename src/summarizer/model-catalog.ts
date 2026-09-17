// Per-provider summary model lists (decision M2). Design:
// docs/plans/2026-09-17-readiness-probe-design.md

import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";

import type { SummaryProvider } from "../storage/summary-permission.js";
import type {
  ProbeProcessRunner,
  ProbeRunResult,
  ProbeTempDirs,
} from "./readiness-probe.js";

export interface ModelOption {
  value: string;
  label: string;
  effortLevels: string[];
}

export interface ProviderCatalog {
  source: "fetched" | "built-in";
  options: ModelOption[];
  /** Effort levels of the CLI's default model, when the list states them (D2). */
  defaultEffortLevels: string[];
}

export type ModelCatalog = Record<SummaryProvider, ProviderCatalog>;

// Fallback lists maintained by Josh; values observed on 2026-09-17.
export const builtInModels: Record<SummaryProvider, ModelOption[]> = {
  codex: [
    {
      value: "gpt-5.6-sol",
      label: "GPT-5.6-Sol",
      effortLevels: ["low", "medium", "high", "xhigh", "max", "ultra"],
    },
    {
      value: "gpt-6-astra",
      label: "GPT-6-Astra",
      effortLevels: ["low", "medium", "high", "xhigh", "max", "ultra"],
    },
    {
      value: "gpt-5.6-terra",
      label: "GPT-5.6-Terra",
      effortLevels: ["low", "medium", "high", "xhigh", "max", "ultra"],
    },
    {
      value: "gpt-5.6-luna",
      label: "GPT-5.6-Luna",
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      value: "gpt-5.5",
      label: "GPT-5.5",
      effortLevels: ["low", "medium", "high", "xhigh"],
    },
  ],
  "claude-code": [
    {
      value: "sonnet",
      label: "Sonnet",
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      value: "claude-fable-5[1m]",
      label: "Fable",
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      value: "opus",
      label: "Opus",
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
    },
    { value: "haiku", label: "Haiku", effortLevels: [] },
  ],
};

// Claude Code's default entry was observed with these levels on 2026-09-17;
// Codex does not mark a default model.
export const builtInDefaultEffortLevels: Record<SummaryProvider, string[]> = {
  "claude-code": ["low", "medium", "high", "xhigh", "max"],
  codex: [],
};

/** A model value that can only ever be one CLI argument, never an option. */
export function isSafeModelValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._\-[\]]{0,63}$/.test(value)
  );
}

const codexTimeoutMs = 15_000;
const codexMaxBytes = 4 * 1024 * 1024;
const claudeMaxBytes = 4 * 1024 * 1024;
const claudeArgs = [
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
];
const initializeRequest = {
  type: "control_request",
  request_id: "init-1",
  request: { subtype: "initialize" },
};

export interface CatalogChild extends EventEmitter {
  stdout: EventEmitter | null;
  stdin: {
    write(chunk: string): boolean;
    on?(event: "error", listener: () => void): unknown;
  } | null;
  kill(signal: NodeJS.Signals): boolean;
}

export type ClaudeCatalogSpawn = (
  file: string,
  args: readonly string[],
  options: {
    cwd: string;
    shell: false;
    stdio: ["pipe", "pipe", "ignore"];
  },
) => CatalogChild;

const defaultClaudeSpawn: ClaudeCatalogSpawn = (file, args, options) =>
  nodeSpawn(file, [...args], options) as unknown as CatalogChild;

export function createModelCatalogLoader({
  locate,
  runner,
  tempDirs,
  spawnClaude = defaultClaudeSpawn,
  claudeTimeoutMs = 15_000,
}: {
  locate(executable: string): Promise<string | undefined>;
  runner: ProbeProcessRunner;
  tempDirs: ProbeTempDirs;
  spawnClaude?: ClaudeCatalogSpawn;
  claudeTimeoutMs?: number;
}): () => Promise<ModelCatalog> {
  async function inTempDir<T>(
    work: (directory: string) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    let directory: string;
    try {
      directory = await tempDirs.create();
    } catch {
      return undefined;
    }
    try {
      return await work(directory);
    } catch {
      return undefined;
    } finally {
      await tempDirs.remove(directory).catch(() => {});
    }
  }

  async function codex(): Promise<ParsedList | undefined> {
    const path = await locate("codex");
    if (!path) return undefined;
    return inTempDir(async (directory) => {
      const result: ProbeRunResult = await runner({
        file: path,
        args: ["debug", "models"],
        cwd: directory,
        captureStdout: true,
        timeoutMs: codexTimeoutMs,
        maxStdoutBytes: codexMaxBytes,
      });
      if (
        result.kind !== "exited" ||
        result.exitCode !== 0 ||
        result.stdoutTooLarge
      )
        return undefined;
      const options = parseCodexCatalog(result.stdout);
      return options && { options, defaultEffortLevels: [] };
    });
  }

  async function claude(): Promise<ParsedList | undefined> {
    const path = await locate("claude");
    if (!path) return undefined;
    return inTempDir(
      (directory) =>
        new Promise<ParsedList | undefined>((resolve) => {
          let child: CatalogChild;
          try {
            child = spawnClaude(path, claudeArgs, {
              cwd: directory,
              shell: false,
              stdio: ["pipe", "pipe", "ignore"],
            });
          } catch {
            resolve(undefined);
            return;
          }
          let done = false;
          let buffer = "";
          let size = 0;
          const decoder = new TextDecoder();
          const finish = (options: ParsedList | undefined) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try {
              child.kill("SIGTERM");
            } catch {
              // Already exited.
            }
            resolve(options);
          };
          const timer = setTimeout(() => finish(undefined), claudeTimeoutMs);

          child.stdout?.on("data", (chunk: unknown) => {
            const text =
              typeof chunk === "string"
                ? chunk
                : decoder.decode(chunk as Uint8Array, { stream: true });
            size += Buffer.byteLength(text);
            if (size > claudeMaxBytes) return finish(undefined);
            buffer += text;
            let newline: number;
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline).trim();
              buffer = buffer.slice(newline + 1);
              if (!line) continue;
              let message: unknown;
              try {
                message = JSON.parse(line);
              } catch {
                return finish(undefined);
              }
              const response = initializeResponse(message);
              if (response === "other") continue;
              return finish(
                response ? parseClaudeModels(response.models) : undefined,
              );
            }
          });
          child.on("error", () => finish(undefined));
          child.on("close", () => finish(undefined));
          child.stdin?.on?.("error", () => finish(undefined));
          // Only the initialize request is written; no prompt is ever sent.
          child.stdin?.write(`${JSON.stringify(initializeRequest)}\n`);
        }),
    );
  }

  return async () => {
    const [codexOptions, claudeOptions] = await Promise.all([
      codex(),
      claude(),
    ]);
    return {
      codex: catalogOrBuiltIn("codex", codexOptions),
      "claude-code": catalogOrBuiltIn("claude-code", claudeOptions),
    };
  };
}

interface ParsedList {
  options: ModelOption[];
  defaultEffortLevels: string[];
}

function catalogOrBuiltIn(
  provider: SummaryProvider,
  parsed: ParsedList | undefined,
): ProviderCatalog {
  return parsed?.options.length
    ? { source: "fetched", ...parsed }
    : {
        source: "built-in",
        options: builtInModels[provider],
        defaultEffortLevels: builtInDefaultEffortLevels[provider],
      };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function effortLevels(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const levels = value.map((level) => (isRecord(level) ? level.effort : level));
  return levels.every(
    (level): level is string =>
      typeof level === "string" && /^[a-z]{1,16}$/.test(level),
  )
    ? levels
    : undefined;
}

function option(
  value: unknown,
  label: unknown,
  levels: unknown,
): ModelOption | undefined {
  const efforts = effortLevels(levels);
  if (
    !isSafeModelValue(value) ||
    typeof label !== "string" ||
    !label.trim() ||
    label.length > 100 ||
    !efforts
  )
    return undefined;
  return { value, label, effortLevels: efforts };
}

function parseCodexCatalog(stdout: string): ModelOption[] | undefined {
  let catalog: unknown;
  try {
    catalog = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!isRecord(catalog) || !Array.isArray(catalog.models)) return undefined;
  return catalog.models.flatMap((model) =>
    isRecord(model) && model.visibility === "list"
      ? (option(
          model.slug,
          model.display_name,
          model.supported_reasoning_levels,
        ) ?? [])
      : [],
  );
}

function initializeResponse(
  message: unknown,
): { models: unknown } | "other" | undefined {
  if (!isRecord(message) || message.type !== "control_response") return "other";
  const response = message.response;
  if (!isRecord(response) || response.request_id !== "init-1") return "other";
  if (response.subtype !== "success" || !isRecord(response.response))
    return undefined;
  // Only `models` is read; `account` and everything else are discarded.
  return { models: response.response.models };
}

function parseClaudeModels(models: unknown): ParsedList | undefined {
  if (!Array.isArray(models)) return undefined;
  const defaultEntry = models.find(
    (model) => isRecord(model) && model.value === "default",
  ) as Record<string, unknown> | undefined;
  return {
    // The default entry is not offered as a model; only its levels are kept.
    options: models.flatMap((model) =>
      isRecord(model) && model.value !== "default"
        ? (option(
            model.value,
            model.displayName,
            model.supportedEffortLevels,
          ) ?? [])
        : [],
    ),
    defaultEffortLevels:
      effortLevels(defaultEntry?.supportedEffortLevels) ?? [],
  };
}
