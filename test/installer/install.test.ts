import { expect, test } from "vitest";

import { installFreshMacosApplication } from "../../src/installer/install.js";
import type { NodeRuntimeDescriptor } from "../../src/installer/node-runtime.js";
import type { SystemAdapter } from "../../src/installer/system-adapter.js";

const runtime: NodeRuntimeDescriptor = {
  version: "24.12.0",
  architecture: "arm64",
  archiveUrl: "https://approved.example/node-v24.12.0-darwin-arm64.tar.gz",
  sha256: "approved-node-checksum",
};

const request = {
  layout: {
    sourceInstallPath: "/Users/example/Agent Daily Achievements",
    runtimePath: (version: string) => `/managed/runtimes/node-v${version}`,
    runtimeStagingPath: (version: string) =>
      `/managed/staging/node-v${version}`,
    releaseStagingPath: (version: string) => `/managed/staging/app-v${version}`,
    settingsPath: "/managed/data/settings.json",
    summaryPermissionPath: "/managed/data/summary-permission.json",
  },
  runtimeDescriptors: [runtime],
  sourceRelease: {
    version: "1.2.3",
    archiveUrl: "https://approved.example/app-v1.2.3.tar.gz",
    sha256: "approved-app-checksum",
  },
} as const;

test("installs a fresh macOS application in the required recoverable stage order", async () => {
  const adapter = createAdapter();

  await expect(installFreshMacosApplication(request, adapter)).resolves.toEqual(
    {
      status: "installed",
      nodePath: "/managed/runtimes/node-v24.12.0/bin/node",
      sourceInstallPath: "/Users/example/Agent Daily Achievements",
      providers: "not-connected",
    },
  );
  expect(adapter.operations).toEqual([
    "validate-macos-and-space",
    "runtime:architecture",
    "runtime:download",
    "runtime:verify",
    "runtime:extract",
    "runtime:node-executable",
    "runtime:activate",
    "source-destination",
    "source:download",
    "source:verify",
    "source:extract",
    "npm-ci",
    "build",
    "source:activate",
    "timezone",
    "summary-permission",
    "schedule",
    "open-page",
  ]);
  expect(adapter.scheduleRequests).toEqual([
    {
      nodePath: "/managed/runtimes/node-v24.12.0/bin/node",
      sourceInstallPath: "/Users/example/Agent Daily Achievements",
    },
  ]);
});

test.each([
  ["validate-macos-and-space", "environment"],
  ["runtime:architecture", "runtime"],
  ["runtime:download", "runtime"],
  ["runtime:verify", "runtime"],
  ["runtime:extract", "runtime"],
  ["runtime:node-executable", "runtime"],
  ["runtime:activate", "runtime"],
  ["source-destination", "source-destination"],
  ["source:download", "source"],
  ["source:verify", "source"],
  ["source:extract", "source"],
  ["npm-ci", "dependencies"],
  ["build", "build"],
  ["source:activate", "build"],
  ["timezone", "timezone"],
  ["summary-permission", "summary-permission"],
  ["schedule", "schedule"],
  ["open-page", "open-page"],
] as const)(
  "keeps the existing active installation and job when %s fails",
  async (operation, stage) => {
    const adapter = createAdapter({ failAt: operation });

    await expect(
      installFreshMacosApplication(request, adapter),
    ).resolves.toMatchObject({
      status: "failed",
      stage,
      action: expect.any(String),
    });
    expect(adapter.priorInstallationRemainsUsable).toBe(true);
    expect(adapter.priorJobRemainsLoaded).toBe(true);
    expect(adapter.activeRuntime).toBe("prior-runtime");
    expect(adapter.reportSettings).toBe("prior-settings");
  },
);

test.each(["timezone", "summary-permission", "schedule", "open-page"] as const)(
  "restores runtime, source, settings, and job when %s fails after activation",
  async (operation) => {
    const adapter = createAdapter({ failAt: operation });

    await expect(
      installFreshMacosApplication(request, adapter),
    ).resolves.toMatchObject({ status: "failed", stage: operation });
    expect(adapter.activeRuntime).toBe("prior-runtime");
    expect(adapter.activeSource).toBe("prior-source");
    expect(adapter.reportSettings).toBe("prior-settings");
    expect(adapter.loadedJob).toBe("prior-job");
  },
);

test("reports unsafe recovery when restoring the prior installation fails", async () => {
  const adapter = createAdapter({
    failAt: "timezone",
    restorationFails: true,
  });

  await expect(
    installFreshMacosApplication(request, adapter),
  ).resolves.toMatchObject({
    status: "unsafe-recovery",
    failedStage: "timezone",
  });
});

test("reports unsafe recovery when restoring the prior runtime fails", async () => {
  const adapter = createAdapter({
    failAt: "source:download",
    runtimeRestorationFails: true,
  });

  await expect(
    installFreshMacosApplication(request, adapter),
  ).resolves.toMatchObject({
    status: "unsafe-recovery",
    failedStage: "source",
  });
  expect(adapter.restorationOrder).not.toContain("job");
});

test("reports unsafe recovery when restoring report settings fails", async () => {
  const adapter = createAdapter({
    failAt: "schedule",
    settingsRestorationFails: true,
  });

  await expect(
    installFreshMacosApplication(request, adapter),
  ).resolves.toMatchObject({
    status: "unsafe-recovery",
    failedStage: "schedule",
  });
});

test("restores runtime, source, and settings before reloading the prior job", async () => {
  const adapter = createAdapter({
    failAt: "schedule",
    jobRequiresRestoredPrerequisites: true,
  });

  await expect(
    installFreshMacosApplication(request, adapter),
  ).resolves.toMatchObject({ status: "failed", stage: "schedule" });
  expect(adapter.restorationOrder).toEqual([
    "runtime",
    "source",
    "settings",
    "job",
  ]);
});

test("rejects mixed-version runtime metadata before activating any runtime", async () => {
  const adapter = createAdapter();
  const mixedRuntimeRequest = {
    ...request,
    runtimeDescriptors: [
      { ...runtime, architecture: "x64" as const, version: "24.11.0" },
      runtime,
    ],
  };

  await expect(
    installFreshMacosApplication(mixedRuntimeRequest, adapter),
  ).resolves.toMatchObject({ status: "failed", stage: "runtime" });
  expect(adapter.operations).not.toContain("runtime:download");
  expect(adapter.activeRuntime).toBe("prior-runtime");
});

test("rejects an occupied source destination before fetching the source archive", async () => {
  const adapter = createAdapter({ sourceDestinationOccupied: true });

  await expect(
    installFreshMacosApplication(request, adapter),
  ).resolves.toMatchObject({
    status: "failed",
    stage: "source-destination",
    action: expect.stringMatching(/update/i),
  });
  expect(adapter.operations).not.toContain("source:download");
  expect(adapter.priorInstallationRemainsUsable).toBe(true);
  expect(adapter.priorJobRemainsLoaded).toBe(true);
});

function createAdapter(
  options: {
    failAt?: string;
    sourceDestinationOccupied?: boolean;
    restorationFails?: boolean;
    runtimeRestorationFails?: boolean;
    settingsRestorationFails?: boolean;
    jobRequiresRestoredPrerequisites?: boolean;
  } = {},
) {
  const operations: string[] = [];
  const scheduleRequests: Array<{
    nodePath: string;
    sourceInstallPath: string;
  }> = [];
  let priorInstallationRemainsUsable = false;
  let priorJobRemainsLoaded = false;
  let activeSource = "prior-source";
  let loadedJob = "prior-job";
  let activeRuntime = "prior-runtime";
  let reportSettings = "prior-settings";
  const restorationOrder: string[] = [];

  const failIfRequested = (operation: string): void => {
    if (options.failAt === operation) throw new Error(`${operation} failed`);
  };
  const runtimeSystem: SystemAdapter = {
    describeArchitecture: async () => {
      operations.push("runtime:architecture");
      if (options.failAt === "runtime:architecture") return "unsupported";
      return "arm64";
    },
    downloadToStaging: async (_url, directory) => {
      operations.push("runtime:download");
      failIfRequested("runtime:download");
      return `${directory}/node.tar.gz`;
    },
    verifySha256: async () => {
      operations.push("runtime:verify");
      return options.failAt !== "runtime:verify";
    },
    extractArchiveToRuntimeRoot: async () => {
      operations.push("runtime:extract");
      failIfRequested("runtime:extract");
    },
    isExecutable: async () => {
      operations.push("runtime:node-executable");
      return options.failAt !== "runtime:node-executable";
    },
    activateAtomically: async () => {
      operations.push("runtime:activate");
      activeRuntime = "new-runtime";
      failIfRequested("runtime:activate");
    },
  };

  return {
    operations,
    scheduleRequests,
    restorationOrder,
    get priorInstallationRemainsUsable() {
      return priorInstallationRemainsUsable;
    },
    get priorJobRemainsLoaded() {
      return priorJobRemainsLoaded;
    },
    get activeSource() {
      return activeSource;
    },
    get loadedJob() {
      return loadedJob;
    },
    get activeRuntime() {
      return activeRuntime;
    },
    get reportSettings() {
      return reportSettings;
    },
    runtimeSystem,
    validateMacosAndWritableSpace: async () => {
      operations.push("validate-macos-and-space");
      failIfRequested("validate-macos-and-space");
    },
    sourceDestinationIsOccupied: async () => {
      operations.push("source-destination");
      failIfRequested("source-destination");
      return options.sourceDestinationOccupied ?? false;
    },
    downloadSourceArchiveToStaging: async (_url: string, directory: string) => {
      operations.push("source:download");
      failIfRequested("source:download");
      return `${directory}/source.tar.gz`;
    },
    verifySourceArchive: async () => {
      operations.push("source:verify");
      return options.failAt !== "source:verify";
    },
    extractSourceArchive: async () => {
      operations.push("source:extract");
      failIfRequested("source:extract");
    },
    runManagedNpmCi: async () => {
      operations.push("npm-ci");
      failIfRequested("npm-ci");
    },
    runManagedBuild: async () => {
      operations.push("build");
      failIfRequested("build");
    },
    activateSourceAtomically: async () => {
      operations.push("source:activate");
      activeSource = "new-source";
      failIfRequested("source:activate");
    },
    setupReportTimeZone: async () => {
      operations.push("timezone");
      reportSettings = "new-settings";
      failIfRequested("timezone");
    },
    setupSummaryPermission: async () => {
      operations.push("summary-permission");
      reportSettings = "new-settings";
      failIfRequested("summary-permission");
    },
    writeAndReloadLaunchdJob: async (value: {
      nodePath: string;
      sourceInstallPath: string;
    }) => {
      operations.push("schedule");
      loadedJob = "new-job";
      failIfRequested("schedule");
      scheduleRequests.push(value);
    },
    openLocalPage: async () => {
      operations.push("open-page");
      failIfRequested("open-page");
    },
    restorePriorInstallation: async () => {
      restorationOrder.push("source");
      if (options.restorationFails) throw new Error("source restore failed");
      activeSource = "prior-source";
      priorInstallationRemainsUsable = true;
    },
    restorePriorJob: async () => {
      restorationOrder.push("job");
      if (
        options.jobRequiresRestoredPrerequisites &&
        (activeRuntime !== "prior-runtime" ||
          activeSource !== "prior-source" ||
          reportSettings !== "prior-settings")
      ) {
        throw new Error("job restore ran before prerequisites");
      }
      if (options.restorationFails) throw new Error("job restore failed");
      loadedJob = "prior-job";
      priorJobRemainsLoaded = true;
    },
    restorePriorRuntime: async () => {
      restorationOrder.push("runtime");
      if (options.runtimeRestorationFails)
        throw new Error("runtime restore failed");
      activeRuntime = "prior-runtime";
    },
    restorePriorReportSettings: async () => {
      restorationOrder.push("settings");
      if (options.settingsRestorationFails)
        throw new Error("settings restore failed");
      reportSettings = "prior-settings";
    },
  };
}
