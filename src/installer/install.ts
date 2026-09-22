import {
  installManagedNodeRuntime,
  type NodeRuntimeDescriptor,
} from "./node-runtime.js";
import type { SystemAdapter } from "./system-adapter.js";

type FreshInstallLayout = {
  sourceInstallPath: string;
  runtimePath(version: string): string;
  runtimeStagingPath(version: string): string;
  releaseStagingPath(version: string): string;
  settingsPath: string;
};

export interface SourceReleaseDescriptor {
  version: string;
  archiveUrl: string;
  sha256: string;
}

export interface FreshMacosInstallationRequest {
  layout: FreshInstallLayout;
  runtimeDescriptors: readonly NodeRuntimeDescriptor[];
  sourceRelease: SourceReleaseDescriptor;
}

export interface FreshMacosInstallationAdapter {
  runtimeSystem: SystemAdapter;
  validateMacosAndWritableSpace(): Promise<void>;
  sourceDestinationIsOccupied(path: string): Promise<boolean>;
  downloadSourceArchiveToStaging(
    archiveUrl: string,
    stagingDirectory: string,
  ): Promise<string>;
  verifySourceArchive(
    archivePath: string,
    expectedSha256: string,
  ): Promise<boolean>;
  extractSourceArchive(
    archivePath: string,
    stagingDirectory: string,
  ): Promise<void>;
  runManagedNpmCi(nodePath: string, sourceDirectory: string): Promise<void>;
  runManagedBuild(nodePath: string, sourceDirectory: string): Promise<void>;
  activateSourceAtomically(
    stagedSourcePath: string,
    sourceInstallPath: string,
  ): Promise<void>;
  setupReportTimeZone(settingsPath: string): Promise<void>;
  writeAndReloadLaunchdJob(config: {
    nodePath: string;
    sourceInstallPath: string;
  }): Promise<void>;
  openLocalPage(sourceInstallPath: string): Promise<void>;
  /** Restores the active source installation captured before this transaction. */
  restorePriorInstallation(): Promise<void>;
  /** Restores the launchd job loaded before this transaction. */
  restorePriorJob(): Promise<void>;
}

export type FreshMacosInstallationResult =
  | {
      status: "installed";
      nodePath: string;
      sourceInstallPath: string;
      providers: "not-connected";
    }
  | {
      status: "failed";
      stage: InstallationStage;
      action: string;
    }
  | {
      status: "unsafe-recovery";
      failedStage: InstallationStage;
      action: string;
    };

type InstallationStage =
  | "environment"
  | "runtime"
  | "source-destination"
  | "source"
  | "dependencies"
  | "build"
  | "timezone"
  | "schedule"
  | "open-page";

/**
 * Coordinates a fresh install entirely through injected platform operations.
 * Source work remains staged until dependencies and the production build pass;
 * a failure therefore keeps the caller's prior active installation and job.
 */
export async function installFreshMacosApplication(
  request: FreshMacosInstallationRequest,
  adapter: FreshMacosInstallationAdapter,
): Promise<FreshMacosInstallationResult> {
  let stage: InstallationStage = "environment";
  try {
    await adapter.validateMacosAndWritableSpace();

    stage = "runtime";
    const managedRuntime = await installManagedNodeRuntime(
      {
        descriptors: request.runtimeDescriptors,
        stagingDirectory: request.layout.runtimeStagingPath(
          requiredRuntimeVersion(request.runtimeDescriptors),
        ),
        activeDirectory: request.layout.runtimePath(
          requiredRuntimeVersion(request.runtimeDescriptors),
        ),
      },
      adapter.runtimeSystem,
    );

    stage = "source-destination";
    if (
      await adapter.sourceDestinationIsOccupied(
        request.layout.sourceInstallPath,
      )
    ) {
      return recoveryResult(
        "source-destination",
        "The selected source directory is already installed; use the update flow instead.",
        adapter,
      );
    }

    stage = "source";
    const sourceStagingPath = request.layout.releaseStagingPath(
      request.sourceRelease.version,
    );
    const sourceArchivePath = await adapter.downloadSourceArchiveToStaging(
      request.sourceRelease.archiveUrl,
      sourceStagingPath,
    );
    if (
      !(await adapter.verifySourceArchive(
        sourceArchivePath,
        request.sourceRelease.sha256,
      ))
    ) {
      throw new Error("source archive verification failed: SHA-256 mismatch");
    }
    await adapter.extractSourceArchive(sourceArchivePath, sourceStagingPath);

    stage = "dependencies";
    await adapter.runManagedNpmCi(managedRuntime.nodePath, sourceStagingPath);

    stage = "build";
    await adapter.runManagedBuild(managedRuntime.nodePath, sourceStagingPath);
    await adapter.activateSourceAtomically(
      sourceStagingPath,
      request.layout.sourceInstallPath,
    );

    stage = "timezone";
    await adapter.setupReportTimeZone(request.layout.settingsPath);

    stage = "schedule";
    await adapter.writeAndReloadLaunchdJob({
      nodePath: managedRuntime.nodePath,
      sourceInstallPath: request.layout.sourceInstallPath,
    });

    stage = "open-page";
    await adapter.openLocalPage(request.layout.sourceInstallPath);

    return {
      status: "installed",
      nodePath: managedRuntime.nodePath,
      sourceInstallPath: request.layout.sourceInstallPath,
      providers: "not-connected",
    };
  } catch {
    return recoveryResult(stage, actionFor(stage), adapter);
  }
}

function requiredRuntimeVersion(
  descriptors: readonly NodeRuntimeDescriptor[],
): string {
  const version = descriptors[0]?.version;
  if (!version)
    throw new Error("an approved Node runtime descriptor is required");
  return version;
}

async function recoveryResult(
  stage: InstallationStage,
  action: string,
  adapter: FreshMacosInstallationAdapter,
): Promise<FreshMacosInstallationResult> {
  if (await restorePriorInstallation(adapter)) {
    return failedResult(stage, action);
  }
  return {
    status: "unsafe-recovery",
    failedStage: stage,
    action:
      "The installation could not restore the prior application or scheduled job. Do not retry automatically; inspect the installation state before continuing.",
  };
}

async function restorePriorInstallation(
  adapter: FreshMacosInstallationAdapter,
): Promise<boolean> {
  const results = await Promise.allSettled([
    adapter.restorePriorInstallation(),
    adapter.restorePriorJob(),
  ]);
  return results.every((result) => result.status === "fulfilled");
}

function failedResult(
  stage: InstallationStage,
  action: string,
): FreshMacosInstallationResult {
  return { status: "failed", stage, action };
}

function actionFor(stage: InstallationStage): string {
  const actions: Record<InstallationStage, string> = {
    environment:
      "Check that this is macOS and free writable disk space, then retry.",
    runtime:
      "Check the approved Node runtime metadata and retry the installation.",
    "source-destination":
      "Choose an empty source directory or use the update flow.",
    source: "Check the approved source archive and checksum, then retry.",
    dependencies: "Check the managed npm dependency installation and retry.",
    build: "Check the production build output and retry.",
    timezone: "Choose a valid report timezone, then retry.",
    schedule: "Check the launchd job setup and retry.",
    "open-page":
      "Open the local page manually after checking the local server.",
  };
  return actions[stage];
}
