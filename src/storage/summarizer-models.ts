import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  isSafeEffortLevel,
  isSafeModelValue,
} from "../summarizer/model-catalog.js";
import type { SummaryProvider } from "./summary-permission.js";

/** Per-provider values; a missing entry means the CLI default. */
export type SavedModels = Partial<Record<SummaryProvider, string>>;

export interface SavedSettings {
  models: SavedModels;
  efforts: SavedModels;
}

export interface SavedModelsRead extends SavedSettings {
  /** True when the file exists but could not be read or validated. */
  unreadable: boolean;
}

const providers: readonly string[] = ["codex", "claude-code", "agy"];
const empty = (unreadable: boolean): SavedModelsRead => ({
  models: {},
  efforts: {},
  unreadable,
});

export async function readSummarizerModels(
  path: string,
): Promise<SavedModelsRead> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    return empty((error as NodeJS.ErrnoException).code !== "ENOENT");
  }
  try {
    const value = JSON.parse(contents) as unknown;
    if (!isRecord(value)) throw new Error("Invalid summarizer settings");
    // Version 1 (models only) remains readable; version 2 adds efforts.
    const keys = Object.keys(value).sort().join();
    const version1 = value.version === 1 && keys === "models,version";
    const version2 = value.version === 2 && keys === "efforts,models,version";
    if (!version1 && !version2) throw new Error("Invalid summarizer settings");
    return {
      models: entries(value.models, isSafeModelValue),
      efforts: version2 ? entries(value.efforts, isSafeEffortLevel) : {},
      unreadable: false,
    };
  } catch {
    return empty(true);
  }
}

export async function writeSummarizerModels(
  path: string,
  settings: SavedSettings,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      JSON.stringify({
        version: 2,
        models: settings.models,
        efforts: settings.efforts,
      }),
      { flag: "wx", mode: 0o600 },
    );
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function entries(
  value: unknown,
  valid: (entry: unknown) => entry is string,
): SavedModels {
  if (!isRecord(value)) throw new Error("Invalid summarizer settings");
  const result: SavedModels = {};
  for (const [provider, entry] of Object.entries(value)) {
    if (!providers.includes(provider) || !valid(entry))
      throw new Error("Invalid summarizer settings");
    result[provider as SummaryProvider] = entry;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
