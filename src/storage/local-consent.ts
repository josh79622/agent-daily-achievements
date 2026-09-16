import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { LocalSource } from "../collector/local-collector.js";

export function validSources(value: unknown): value is LocalSource[] {
  return (
    Array.isArray(value) &&
    value.length <= 2 &&
    new Set(value).size === value.length &&
    value.every((source) => source === "claude-code" || source === "codex")
  );
}

export async function readConsent(
  path: string | undefined,
): Promise<LocalSource[]> {
  if (!path) return [];
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const value = JSON.parse(contents) as {
    version?: unknown;
    sources?: unknown;
  };
  if (
    !value ||
    value.version !== 1 ||
    !validSources(value.sources) ||
    Object.keys(value).length !== 2
  )
    throw new Error("Invalid consent settings");
  return value.sources;
}

export async function writeConsent(
  path: string | undefined,
  sources: LocalSource[],
): Promise<void> {
  if (!path) throw new Error("Consent storage unavailable");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, sources }), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
