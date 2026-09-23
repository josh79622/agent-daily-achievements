import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

export type UpdateMode = "manual" | "automatic";

export interface UpdateSettings {
  mode: UpdateMode;
  availableVersion?: string;
  lastCheckAt?: string;
  lastError?: string;
}

const defaultSettings: UpdateSettings = { mode: "manual" };

export async function readUpdateSettings(
  path: string,
): Promise<UpdateSettings> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultSettings;
    }
    throw error;
  }
  const value = JSON.parse(contents) as Record<string, unknown>;
  if (value.version !== 1 || !validSettings(value.settings)) {
    throw new Error("Invalid update settings");
  }
  return value.settings;
}

export async function writeUpdateSettings(
  path: string,
  settings: UpdateSettings,
): Promise<void> {
  if (!validSettings(settings)) throw new Error("Invalid update settings");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, settings }), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function validSettings(value: unknown): value is UpdateSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return (
    (settings.mode === "manual" || settings.mode === "automatic") &&
    Object.keys(settings).every(
      (key) =>
        key === "mode" ||
        ((key === "availableVersion" ||
          key === "lastCheckAt" ||
          key === "lastError") &&
          typeof settings[key] === "string"),
    )
  );
}
