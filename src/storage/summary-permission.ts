import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import type { LocalSource } from "../collector/local-collector.js";
import { isSupportedSummaryLanguage } from "../report/languages.js";

export type SummaryProvider = "claude-code" | "codex" | "agy";

export interface SummaryPermission {
  sourceScope: LocalSource[];
  preferredCli?: SummaryProvider;
  recipients: readonly SummaryProvider[];
  summaryLanguage?: string;
}

export interface SummaryPermissionInput {
  sourceScope: LocalSource[];
  preferredCli?: SummaryProvider;
  summaryLanguage?: string;
}

export function validSummaryPermissionInput(
  value: unknown,
): value is SummaryPermissionInput {
  if (!value || typeof value !== "object") return false;
  const permission = value as Record<string, unknown>;
  const sourceScope = permission.sourceScope;
  if (
    !Array.isArray(sourceScope) ||
    sourceScope.length > 3 ||
    new Set(sourceScope).size !== sourceScope.length ||
    !sourceScope.every(
      (source) =>
        source === "claude-code" ||
        source === "codex" ||
        source === "antigravity",
    )
  )
    return false;
  return (
    Object.keys(permission).every(
      (key) =>
        key === "sourceScope" ||
        key === "preferredCli" ||
        key === "summaryLanguage",
    ) &&
    (permission.preferredCli === undefined ||
      permission.preferredCli === "claude-code" ||
      permission.preferredCli === "codex" ||
      permission.preferredCli === "agy") &&
    (permission.summaryLanguage === undefined ||
      isSupportedSummaryLanguage(permission.summaryLanguage))
  );
}

export function validSummaryPermission(
  value: unknown,
): value is SummaryPermission {
  if (!value || typeof value !== "object") return false;
  const permission = value as Record<string, unknown>;
  const { recipients, ...input } = permission;
  return (
    validSummaryPermissionInput(input) &&
    Array.isArray(recipients) &&
    recipients.length >= 2 &&
    recipients.length <= 3 &&
    new Set(recipients).size === recipients.length &&
    recipients.every(
      (recipient) =>
        recipient === "codex" ||
        recipient === "claude-code" ||
        recipient === "agy",
    )
  );
}

export async function readSummaryPermission(
  path: string | undefined,
): Promise<SummaryPermission | undefined> {
  if (!path) return undefined;
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const value = JSON.parse(contents) as Record<string, unknown>;
  if (
    value.version !== 1 ||
    !validSummaryPermission(value.permission) ||
    Object.keys(value).length !== 2
  )
    throw new Error("Invalid summary permission settings");
  return value.permission;
}

export async function writeSummaryPermission(
  path: string | undefined,
  permission: SummaryPermission,
): Promise<void> {
  if (!path) throw new Error("Summary permission storage unavailable");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, permission }), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
