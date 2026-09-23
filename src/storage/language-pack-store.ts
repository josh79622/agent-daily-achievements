// On-disk cache for built language packs (Task L2, assumption 3):
// `data/locales/<code>.json`, written once and reused forever. Deleting the
// file makes the language addable again; `data/` is already git-ignored.

import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";

import type { Translations } from "../report/language-pack.js";

export interface LanguagePackStore {
  read(code: string): Promise<Translations | undefined>;
  write(code: string, pack: Translations): Promise<void>;
  /**
   * Every code with a valid pack file on disk (Task L4), sorted. A file
   * that isn't a `.json` pack, or doesn't parse as one, is left out; a
   * missing cache directory yields an empty list rather than an error.
   */
  list(): Promise<string[]>;
}

function pathFor(directory: string, code: string): string {
  // Language codes only ever come from the fixed catalog (never user text),
  // so no extra escaping is needed for the file name.
  return join(directory, `${code}.json`);
}

async function readPack(
  directory: string,
  code: string,
): Promise<Translations | undefined> {
  let contents: string;
  try {
    contents = await readFile(pathFor(directory, code), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(contents) as Translations;
  } catch {
    return undefined;
  }
}

export function createLanguagePackStore(directory: string): LanguagePackStore {
  return {
    read(code) {
      return readPack(directory, code);
    },
    async write(code, pack) {
      await mkdir(directory, { recursive: true });
      const target = pathFor(directory, code);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(pack), { flag: "wx" });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    async list() {
      let entries: string[];
      try {
        entries = await readdir(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const codes: string[] = [];
      for (const entry of entries) {
        if (extname(entry) !== ".json") continue;
        const code = entry.slice(0, -".json".length);
        const pack = await readPack(directory, code);
        if (pack) codes.push(code);
      }
      return codes.sort();
    },
  };
}
