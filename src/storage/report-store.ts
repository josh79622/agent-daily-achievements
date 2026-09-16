import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DailyReport } from "../domain/report.js";

export type ReadReportResult =
  { found: false } | { found: true; report: DailyReport };

export interface ReportStore {
  save(report: DailyReport): Promise<void>;
  readLatest(): Promise<ReadReportResult>;
}

export function createReportStore(directory: string): ReportStore {
  const reportPath = join(directory, "latest.json");

  return {
    async save(report) {
      await mkdir(directory, { recursive: true });
      const temporaryPath = join(directory, `latest.${randomUUID()}.tmp`);

      try {
        await writeFile(
          temporaryPath,
          `${JSON.stringify(report, null, 2)}\n`,
          "utf8",
        );
        await rename(temporaryPath, reportPath);
      } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
      }
    },

    async readLatest() {
      try {
        const contents = await readFile(reportPath, "utf8");
        return {
          found: true,
          report: JSON.parse(contents) as DailyReport,
        };
      } catch (error) {
        if (isMissingFileError(error)) {
          return { found: false };
        }
        throw error;
      }
    },
  };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
