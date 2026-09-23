import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
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

export type ReportVersionUpdater = (
  version: ReportVersion,
) => AchievementReportV1 | Promise<AchievementReportV1>;

export interface ReportStore {
  save(report: AchievementReportV1): Promise<void>;
  read(date: string): Promise<ReadReportResult>;
  readLatest(): Promise<ReadReportResult>;
  listDates(): Promise<string[]>;
}

export interface ReportVersionStore extends ReportStore {
  listVersions(date: string): Promise<ReportVersion[]>;
  readVersion(date: string, id: string): Promise<ReadReportVersionResult>;
  updateVersion(
    date: string,
    id: string,
    updater: ReportVersionUpdater,
  ): Promise<ReportVersion>;
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
  const versionLocks = new Map<string, Promise<void>>();

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
    modifiedAt?: Date,
  ): Promise<void> {
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, contents, "utf8");
      if (modifiedAt) await utimes(temporaryPath, modifiedAt, modifiedAt);
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
    return (legacy ? [...stored, legacy] : stored).sort(
      (left, right) =>
        right.generatedAt.localeCompare(left.generatedAt) ||
        right.id.localeCompare(left.id),
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

  async function withVersionLock<T>(
    date: string,
    id: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${date}:${id}`;
    const previous = versionLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    versionLocks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (versionLocks.get(key) === current) versionLocks.delete(key);
    }
  }

  async function hasStoredVersion(date: string): Promise<boolean> {
    try {
      const entries = await readdir(versionsDirectoryFor(date), {
        withFileTypes: true,
      });
      return entries.some(
        (entry) => entry.isFile() && entry.name.endsWith(".json"),
      );
    } catch (error) {
      if (isMissingFileError(error)) return false;
      throw error;
    }
  }

  async function listDates(): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }
    const candidates = [
      ...new Set(
        entries.flatMap((entry) => {
          if (entry.isDirectory() && datePattern.test(entry.name)) {
            return [entry.name];
          }
          const date = entry.name.slice(0, -".json".length);
          return entry.isFile() &&
            datePattern.test(date) &&
            entry.name === `${date}.json`
            ? [date]
            : [];
        }),
      ),
    ].sort();
    const dates = await Promise.all(
      candidates.map(async (date) => {
        const hasLegacy = entries.some(
          (entry) => entry.isFile() && entry.name === `${date}.json`,
        );
        return hasLegacy || (await hasStoredVersion(date)) ? date : undefined;
      }),
    );
    return dates.filter((date): date is string => date !== undefined);
  }

  async function updateVersion(
    date: string,
    id: string,
    updater: ReportVersionUpdater,
  ): Promise<ReportVersion> {
    assertDate(date);
    assertVersionId(id);
    return withVersionLock(date, id, async () => {
      const found = await readVersion(date, id);
      if (!found.found) throw new Error(`Report version not found: ${id}`);

      const report = await updater(found.version);
      if (report.date !== date) {
        throw new Error("Replacement report date must match the version date.");
      }

      const replacement = { ...found.version, report };
      if (id === legacyIdFor(date)) {
        await writeAtomically(
          legacyPathFor(date),
          `${JSON.stringify(report, null, 2)}\n`,
          new Date(found.version.generatedAt),
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
    });
  }

  return {
    async save(report) {
      assertDate(report.date);
      const id = `${process.hrtime.bigint().toString().padStart(20, "0")}-${randomUUID()}`;
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
      for (const date of dates.toReversed()) {
        const result = await readDate(date);
        if (result.found) return result;
      }
      return { found: false };
    },

    listDates,
    listVersions,
    readVersion,
    updateVersion,

    async replaceVersion(date, id, report) {
      return updateVersion(date, id, () => report);
    },
  };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
