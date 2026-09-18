import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { AchievementReportV1 } from "../report/contract.js";

export type ReadReportResult =
  { found: false } | { found: true; report: AchievementReportV1 };

/**
 * Retention (Josh, 2026-09-18): reports are kept indefinitely by default, one
 * per report date, with no automatic deletion. A report holds a derived
 * summary and evidence pointers (source, recordId, messageIds), never raw
 * conversation text, so keeping the history is a much lower privacy risk
 * than keeping the underlying sessions would be. Deleting a report is left
 * to Josh (the file system today; a UI action is separate, later work).
 */
export interface ReportStore {
  save(report: AchievementReportV1): Promise<void>;
  /** The exact report for one date, or `found: false` if none was saved. */
  read(date: string): Promise<ReadReportResult>;
  /** The report for the most recent date that has one saved. */
  readLatest(): Promise<ReadReportResult>;
  /** Every date with a saved report, ascending. */
  listDates(): Promise<string[]>;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function createReportStore(directory: string): ReportStore {
  function pathFor(date: string): string {
    if (!datePattern.test(date))
      throw new Error(`Invalid report date: ${date}`);
    return join(directory, `${date}.json`);
  }

  async function readDate(date: string): Promise<ReadReportResult> {
    try {
      const contents = await readFile(pathFor(date), "utf8");
      return {
        found: true,
        report: JSON.parse(contents) as AchievementReportV1,
      };
    } catch (error) {
      if (isMissingFileError(error)) return { found: false };
      throw error;
    }
  }

  async function listDates(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }
    return entries
      .filter((name) => datePattern.test(name.replace(/\.json$/, "")))
      .map((name) => name.slice(0, -".json".length))
      .sort();
  }

  return {
    async save(report) {
      await mkdir(directory, { recursive: true });
      const targetPath = pathFor(report.date);
      const temporaryPath = join(
        directory,
        `${report.date}.${randomUUID()}.tmp`,
      );

      try {
        await writeFile(
          temporaryPath,
          `${JSON.stringify(report, null, 2)}\n`,
          "utf8",
        );
        await rename(temporaryPath, targetPath);
      } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
      }
    },

    read: readDate,

    async readLatest() {
      const dates = await listDates();
      const latest = dates.at(-1);
      return latest ? readDate(latest) : { found: false };
    },

    listDates,
  };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
