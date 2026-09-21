// On-disk cache for built language packs (Task L2, assumption 3):
// `data/locales/<code>.json`, written once and reused forever. Deleting the
// file makes the language addable again; `data/` is already git-ignored.

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { Translations } from "../../web/i18n.js";

export interface LanguagePackStore {
  read(code: string): Promise<Translations | undefined>;
  write(code: string, pack: Translations): Promise<void>;
}

function pathFor(directory: string, code: string): string {
  // Language codes only ever come from the fixed catalog (never user text),
  // so no extra escaping is needed for the file name.
  return join(directory, `${code}.json`);
}

export function createLanguagePackStore(directory: string): LanguagePackStore {
  return {
    async read(code) {
      let contents: string;
      try {
        contents = await readFile(pathFor(directory, code), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return undefined;
        throw error;
      }
      try {
        return JSON.parse(contents) as Translations;
      } catch {
        return undefined;
      }
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
  };
}
