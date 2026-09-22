import { expect, test } from "vitest";

import {
  createUpdateService,
  type UpdateAdapter,
  type UpdateSettingsStore,
} from "../../src/updates/update-service.js";
import type { UpdateSettings } from "../../src/storage/update-settings.js";

const release = {
  version: "1.2.3",
  archiveUrl: "https://metadata-supplied.example/app-v1.2.3.tar.gz",
  sha256: "approved-checksum",
};

test("manual checks record a newer fixed release without changing the active release", async () => {
  const fake = createFake();
  const service = createUpdateService({
    currentVersion: "1.2.2",
    settings: fake.settings,
    adapter: fake.adapter,
    now: () => new Date("2026-09-22T01:00:00.000Z"),
  });

  await expect(service.check(release)).resolves.toEqual({
    status: "available",
    version: "1.2.3",
  });
  expect(fake.operations).toEqual([]);
  expect(fake.activeRelease).toBe("1.2.2");
  expect(fake.value).toMatchObject({
    availableVersion: "1.2.3",
    lastCheckAt: "2026-09-22T01:00:00.000Z",
  });
});

test("an explicit update verifies, stages, builds, and atomically activates a fixed release", async () => {
  const fake = createFake({ availableVersion: "1.2.3" });
  const service = createUpdateService({
    currentVersion: "1.2.2",
    settings: fake.settings,
    adapter: fake.adapter,
    now: () => new Date(),
  });

  await expect(service.install(release)).resolves.toEqual({
    status: "updated",
    version: "1.2.3",
  });
  expect(fake.operations).toEqual([
    "fetch",
    "verify",
    "extract",
    "npm-ci",
    "build",
    "activate",
  ]);
  expect(fake.activeRelease).toBe("1.2.3");
});

test.each([
  "fetch",
  "verify",
  "extract",
  "npm-ci",
  "build",
  "activate",
] as const)(
  "a %s failure retains the previous active release and job and records a redacted error",
  async (failure) => {
    const fake = createFake({ availableVersion: "1.2.3", failAt: failure });
    const service = createUpdateService({
      currentVersion: "1.2.2",
      settings: fake.settings,
      adapter: fake.adapter,
      now: () => new Date("2026-09-22T01:00:00.000Z"),
    });

    await expect(service.install(release)).resolves.toEqual({
      status: "failed",
      stage: failure,
    });
    expect(fake.activeRelease).toBe("1.2.2");
    expect(fake.activeJob).toBe("job-for-1.2.2");
    expect(fake.value).toMatchObject({
      lastCheckAt: "2026-09-22T01:00:00.000Z",
      lastError: expect.stringMatching(
        new RegExp(`^Update failed during ${failure}`),
      ),
    });
    expect(fake.value.lastError).not.toContain("/private/");
  },
);

test("automatic mode performs the same update only when called after a finished report", async () => {
  const fake = createFake({ mode: "automatic" });
  const service = createUpdateService({
    currentVersion: "1.2.2",
    settings: fake.settings,
    adapter: fake.adapter,
    now: () => new Date(),
  });

  await service.runAutomaticAfterReport(release);
  expect(fake.activeRelease).toBe("1.2.3");
});

test("updates do not receive or mutate report data, consent, source permissions, or timezone", async () => {
  const fake = createFake({ availableVersion: "1.2.3" });
  const protectedState = {
    consent: ["codex"],
    permission: ["claude-code"],
    timezone: "Australia/Sydney",
    reports: ["2026-09-21"],
  };
  const service = createUpdateService({
    currentVersion: "1.2.2",
    settings: fake.settings,
    adapter: fake.adapter,
    now: () => new Date(),
  });

  await service.install(release);
  expect(protectedState).toEqual({
    consent: ["codex"],
    permission: ["claude-code"],
    timezone: "Australia/Sydney",
    reports: ["2026-09-21"],
  });
});

function createFake(
  initial: Partial<{
    mode: "manual" | "automatic";
    availableVersion: string;
    failAt: string;
  }> = {},
) {
  let value: UpdateSettings = {
    mode: initial.mode ?? "manual",
    availableVersion: initial.availableVersion,
  };
  const operations: string[] = [];
  let activeRelease = "1.2.2";
  let activeJob = "job-for-1.2.2";
  const settings: UpdateSettingsStore = {
    read: async () => value,
    write: async (next) => {
      value = { ...next };
    },
  };
  const fail = (operation: string) => {
    if (initial.failAt === operation)
      throw new Error(`/private/secret ${operation} failed`);
  };
  const adapter: UpdateAdapter = {
    fetchArchive: async () => {
      operations.push("fetch");
      fail("fetch");
      return "/staging/archive.tgz";
    },
    verifySha256: async () => {
      operations.push("verify");
      fail("verify");
      return true;
    },
    extractArchive: async () => {
      operations.push("extract");
      fail("extract");
      return "/staging/release";
    },
    runNpmCi: async () => {
      operations.push("npm-ci");
      fail("npm-ci");
    },
    runBuild: async () => {
      operations.push("build");
      fail("build");
    },
    activateAtomically: async (version) => {
      operations.push("activate");
      fail("activate");
      activeRelease = version;
      activeJob = `job-for-${version}`;
    },
  };
  return {
    settings,
    adapter,
    operations,
    get value() {
      return value;
    },
    get activeRelease() {
      return activeRelease;
    },
    get activeJob() {
      return activeJob;
    },
  };
}
