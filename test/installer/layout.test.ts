import { expect, test } from "vitest";

import { createInstallerLayout } from "../../src/installer/layout.js";

const homeDirectory = "/Users/ava";
const sourceInstallPath = "/Users/ava/Applications/Agent Daily Achievements";

test("creates versioned managed runtime and application paths separately from user data", () => {
  const layout = createInstallerLayout({
    homeDirectory,
    sourceInstallPath,
  });

  expect(layout.managedRoot).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements",
  );
  expect(layout.runtimePath("24.12.0")).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/runtimes/node-v24.12.0",
  );
  expect(layout.runtimeStagingPath("24.12.0")).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/staging/node-v24.12.0",
  );
  expect(layout.releasePath("0.1.0")).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/releases/app-v0.1.0",
  );
  expect(layout.releaseStagingPath("0.1.0")).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/staging/app-v0.1.0",
  );
  expect(layout.activeReleasePath).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/active-release",
  );
  expect(layout.userDataRoot).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/data",
  );
  expect(layout.reportsPath).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/data/reports",
  );
  expect(layout.settingsPath).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/data/settings.json",
  );
  expect(layout.summaryPermissionPath).toBe(
    "/Users/ava/Library/Application Support/Agent Daily Achievements/data/summary-permission.json",
  );
  expect(layout.sourceInstallPath).toBe(sourceInstallPath);
});

test("requires the visible source-install default to be supplied as configuration", () => {
  // This value represents the documented default chosen by a future public
  // installer. The layout module must not select that still-unapproved value.
  const layout = createInstallerLayout({
    homeDirectory,
    sourceInstallPath,
  });

  expect(layout.sourceInstallPath).toBe(sourceInstallPath);
  expect(() =>
    createInstallerLayout({ homeDirectory } as Parameters<
      typeof createInstallerLayout
    >[0]),
  ).toThrow(/source-install/i);
});

test("rejects relative and escaping installer path inputs", () => {
  expect(() =>
    createInstallerLayout({
      homeDirectory: "Users/ava",
      sourceInstallPath,
    }),
  ).toThrow(/absolute/i);
  expect(() =>
    createInstallerLayout({
      homeDirectory,
      sourceInstallPath: "Applications/Agent Daily Achievements",
    }),
  ).toThrow(/absolute/i);
  expect(() =>
    createInstallerLayout({
      homeDirectory,
      sourceInstallPath: "/Users/ava/Applications/../outside",
    }),
  ).toThrow(/escape/i);
  expect(() =>
    createInstallerLayout({
      homeDirectory,
      sourceInstallPath,
    }).runtimePath("../outside"),
  ).toThrow(/escape/i);
});

test("rejects a source installation that overlaps managed runtime or user-data paths", () => {
  expect(() =>
    createInstallerLayout({
      homeDirectory,
      sourceInstallPath:
        "/Users/ava/Library/Application Support/Agent Daily Achievements/data/reports",
    }),
  ).toThrow(/overlap/i);
  expect(() =>
    createInstallerLayout({
      homeDirectory,
      sourceInstallPath: "/Users/ava/Library/Application Support",
    }),
  ).toThrow(/overlap/i);
});
