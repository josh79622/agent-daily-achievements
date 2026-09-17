import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isSafeModelValue } from "../summarizer/model-catalog.js";
import type { SummaryProvider } from "./summary-permission.js";

/** Saved per-provider summary models; a missing entry means the CLI default. */
export type SavedModels = Partial<Record<SummaryProvider, string>>;

export interface SavedModelsRead {
  models: SavedModels;
  /** True when the file exists but could not be read or validated. */
  unreadable: boolean;
}

const providers: readonly string[] = ["codex", "claude-code"];

export async function readSummarizerModels(
  path: string,
): Promise<SavedModelsRead> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { models: {}, unreadable: false }
      : { models: {}, unreadable: true };
  }
  try {
    const value = JSON.parse(contents) as unknown;
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.models))
      throw new Error("Invalid summarizer model settings");
    if (Object.keys(value).length !== 2)
      throw new Error("Invalid summarizer model settings");
    const models: SavedModels = {};
    for (const [provider, model] of Object.entries(value.models)) {
      if (!providers.includes(provider) || !isSafeModelValue(model))
        throw new Error("Invalid summarizer model settings");
      models[provider as SummaryProvider] = model;
    }
    return { models, unreadable: false };
  } catch {
    return { models: {}, unreadable: true };
  }
}

export async function writeSummarizerModels(
  path: string,
  models: SavedModels,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, models }), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
