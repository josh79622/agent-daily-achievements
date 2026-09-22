import type { UpdateSettings } from "../storage/update-settings.js";

/** Approved fixed-version release metadata supplied by the caller. */
export interface UpdateRelease {
  version: string;
  archiveUrl: string;
  sha256: string;
}

export interface UpdateSettingsStore {
  read(): Promise<UpdateSettings>;
  write(settings: UpdateSettings): Promise<void>;
}

/**
 * Platform boundary: the update service has no network, filesystem, process,
 * or launchd implementation. The adapter owns staging and atomic activation.
 */
export interface UpdateAdapter {
  fetchArchive(release: UpdateRelease): Promise<string>;
  verifySha256(archivePath: string, expectedSha256: string): Promise<boolean>;
  extractArchive(archivePath: string, version: string): Promise<string>;
  runNpmCi(stagedReleasePath: string): Promise<void>;
  runBuild(stagedReleasePath: string): Promise<void>;
  activateAtomically(version: string, stagedReleasePath: string): Promise<void>;
}

export type UpdateResult =
  | { status: "current" }
  | { status: "available"; version: string }
  | { status: "updated"; version: string }
  | { status: "disabled" }
  | { status: "failed"; stage: UpdateStage };

type UpdateStage =
  "fetch" | "verify" | "extract" | "npm-ci" | "build" | "activate";

export function createUpdateService({
  currentVersion,
  settings,
  adapter,
  now,
}: {
  currentVersion: string;
  settings: UpdateSettingsStore;
  adapter: UpdateAdapter;
  now: () => Date;
}) {
  async function check(release: UpdateRelease): Promise<UpdateResult> {
    const current = await settings.read();
    const next: UpdateSettings = {
      ...current,
      lastCheckAt: now().toISOString(),
      lastError: undefined,
      availableVersion:
        release.version === currentVersion ? undefined : release.version,
    };
    await settings.write(next);
    return release.version === currentVersion
      ? { status: "current" }
      : { status: "available", version: release.version };
  }

  async function install(release: UpdateRelease): Promise<UpdateResult> {
    const available = await check(release);
    if (available.status === "current") return available;

    let stage: UpdateStage = "fetch";
    try {
      const archive = await adapter.fetchArchive(release);
      stage = "verify";
      if (!(await adapter.verifySha256(archive, release.sha256))) {
        throw new Error("checksum mismatch");
      }
      stage = "extract";
      const stagedRelease = await adapter.extractArchive(
        archive,
        release.version,
      );
      stage = "npm-ci";
      await adapter.runNpmCi(stagedRelease);
      stage = "build";
      await adapter.runBuild(stagedRelease);
      stage = "activate";
      await adapter.activateAtomically(release.version, stagedRelease);
      const current = await settings.read();
      await settings.write({
        ...current,
        availableVersion: undefined,
        lastError: undefined,
      });
      return { status: "updated", version: release.version };
    } catch {
      const current = await settings.read();
      await settings.write({
        ...current,
        lastCheckAt: now().toISOString(),
        lastError: `Update failed during ${stage}.`,
      });
      return { status: "failed", stage };
    }
  }

  async function runAutomaticAfterReport(
    release: UpdateRelease,
  ): Promise<UpdateResult> {
    if ((await settings.read()).mode !== "automatic") {
      return { status: "disabled" };
    }
    return install(release);
  }

  return { check, install, runAutomaticAfterReport };
}
