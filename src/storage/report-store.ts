import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { AchievementReportV1 } from "../report/contract.js";

export interface ReportVersion {
  id: string;
  generatedAt: string;
  report: AchievementReportV1;
}

export type ReadReportResult =
  { found: false } | { found: true; report: AchievementReportV1 };

export type ReadReportVersionResult =
  { found: false } | { found: true; version: ReportVersion };

export interface ReportStore {
  save(report: AchievementReportV1): Promise<void>;
  read(date: string): Promise<ReadReportResult>;
  readLatest(): Promise<ReadReportResult>;
  listDates(): Promise<string[]>;
}

export interface ReportVersionStore extends ReportStore {
  listVersions(date: string): Promise<ReportVersion[]>;
  readVersion(date: string, id: string): Promise<ReadReportVersionResult>;
  replaceVersion(
    date: string,
    id: string,
    report: AchievementReportV1,
  ): Promise<ReportVersion>;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const versionIdPattern = /^[a-zA-Z0-9-]+$/;

export function createReportStore(directory: string): ReportVersionStore {
  let lastGeneratedAtMillis = 0;

  function assertDate(date: string): void {
    if (!datePattern.test(date))
      throw new Error(`Invalid report date: ${date}`);
  }

  function assertVersionId(id: string): void {
    if (!versionIdPattern.test(id)) {
      throw new Error(`Invalid report version ID: ${id}`);
    }
  }

  function legacyPathFor(date: string): string {
    assertDate(date);
    return join(directory, `${date}.json`);
  }

  function versionsDirectoryFor(date: string): string {
    assertDate(date);
    return join(directory, date);
  }

  function versionPathFor(date: string, id: string): string {
    assertVersionId(id);
    return join(versionsDirectoryFor(date), `${id}.json`);
  }

  function legacyIdFor(date: string): string {
    return `legacy-${date}`;
  }

  function nextGeneratedAt(): string {
    lastGeneratedAtMillis = Math.max(Date.now(), lastGeneratedAtMillis + 1);
    return new Date(lastGeneratedAtMillis).toISOString();
  }

  async function writeAtomically(
    targetPath: string,
    contents: string,
  ): Promise<void> {
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, contents, "utf8");
      await rename(temporaryPath, targetPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async function readLegacyVersion(
    date: string,
  ): Promise<ReportVersion | undefined> {
    const path = legacyPathFor(date);
    try {
      const [contents, metadata] = await Promise.all([
        readFile(path, "utf8"),
        stat(path),
      ]);
      return {
        id: legacyIdFor(date),
        generatedAt: metadata.mtime.toISOString(),
        report: JSON.parse(contents) as AchievementReportV1,
      };
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }

  async function listStoredVersions(date: string): Promise<ReportVersion[]> {
    const versionsDirectory = versionsDirectoryFor(date);
    let names: string[];
    try {
      names = await readdir(versionsDirectory);
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }

    return Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const contents = await readFile(
            join(versionsDirectory, name),
            "utf8",
          );
          return JSON.parse(contents) as ReportVersion;
        }),
    );
  }

  async function listVersions(date: string): Promise<ReportVersion[]> {
    assertDate(date);
    const [legacy, stored] = await Promise.all([
      readLegacyVersion(date),
      listStoredVersions(date),
    ]);
    return (legacy ? [...stored, legacy] : stored).sort((left, right) =>
      right.generatedAt.localeCompare(left.generatedAt),
    );
  }

  async function readVersion(
    date: string,
    id: string,
  ): Promise<ReadReportVersionResult> {
    assertDate(date);
    assertVersionId(id);
    const version = (await listVersions(date)).find((item) => item.id === id);
    return version ? { found: true, version } : { found: false };
  }

  async function readDate(date: string): Promise<ReadReportResult> {
    const newest = (await listVersions(date)).at(0);
    return newest ? { found: true, report: newest.report } : { found: false };
  }

  async function listDates(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }
    return [
      ...new Set(
        entries.flatMap((name) => {
          if (datePattern.test(name)) return [name];
          const date = name.slice(0, -".json".length);
          return datePattern.test(date) && name === `${date}.json`
            ? [date]
            : [];
        }),
      ),
    ].sort();
  }

  return {
    async save(report) {
      assertDate(report.date);
      const id = randomUUID();
      const version: ReportVersion = {
        id,
        generatedAt: nextGeneratedAt(),
        report,
      };
      const versionsDirectory = versionsDirectoryFor(report.date);
      await mkdir(versionsDirectory, { recursive: true });
      await writeAtomically(
        versionPathFor(report.date, id),
        `${JSON.stringify(version, null, 2)}\n`,
      );
    },

    read: readDate,

    async readLatest() {
      const dates = await listDates();
      const latest = dates.at(-1);
      return latest ? readDate(latest) : { found: false };
    },

    listDates,
    listVersions,
    readVersion,

    async replaceVersion(date, id, report) {
      assertDate(date);
      assertVersionId(id);
      if (report.date !== date) {
        throw new Error("Replacement report date must match the version date.");
      }

      const found = await readVersion(date, id);
      if (!found.found) throw new Error(`Report version not found: ${id}`);

      const replacement = { ...found.version, report };
      if (id === legacyIdFor(date)) {
        await writeAtomically(
          legacyPathFor(date),
          `${JSON.stringify(report, null, 2)}\n`,
        );
        const updated = await readLegacyVersion(date);
        if (!updated) throw new Error(`Report version not found: ${id}`);
        return updated;
      }

      const versionsDirectory = versionsDirectoryFor(date);
      await mkdir(versionsDirectory, { recursive: true });
      await writeAtomically(
        versionPathFor(date, id),
        `${JSON.stringify(replacement, null, 2)}\n`,
      );
      return replacement;
    },
  };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
