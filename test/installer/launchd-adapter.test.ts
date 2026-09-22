import { expect, test, vi } from "vitest";

import { installLaunchdJob } from "../../scripts/install-launchd.mjs";

const nodePath = "/managed/runtimes/node-v24.12.0/bin/node";
const repositoryRoot = "/Applications/Agent Daily Achievements";
const plistPath =
  "/Users/example/Library/LaunchAgents/com.dailyproof.scheduled-report.plist";

test("reloads exactly one existing launchd plist before bootstrapping it", async () => {
  const launchctl = vi.fn(() => ({ status: 0 }));
  const writeLaunchdJob = vi.fn(async () => ({ replaced: true }));
  const report = vi.fn();

  await expect(
    installLaunchdJob(
      { nodePath, repositoryRoot, plistPath, uid: 501 },
      { launchctl, writeLaunchdJob, report },
    ),
  ).resolves.toEqual({ status: "ready", replaced: true });

  expect(launchctl).toHaveBeenCalledTimes(2);
  expect(launchctl).toHaveBeenNthCalledWith(1, [
    "bootout",
    "gui/501",
    plistPath,
  ]);
  expect(launchctl).toHaveBeenNthCalledWith(2, [
    "bootstrap",
    "gui/501",
    plistPath,
  ]);
  expect(writeLaunchdJob).toHaveBeenCalledWith({
    plistPath,
    content: expect.stringContaining(`<string>${nodePath}</string>`),
  });
  expect(report).toHaveBeenCalledWith(expect.stringMatching(/Replaced/));
});

test("reports bootstrap failure without claiming launchd readiness", async () => {
  const launchctl = vi
    .fn()
    .mockReturnValueOnce({ status: 0 })
    .mockReturnValueOnce({ status: 1 });
  const writeLaunchdJob = vi.fn(async () => ({ replaced: false }));
  const report = vi.fn();

  await expect(
    installLaunchdJob(
      { nodePath, repositoryRoot, plistPath, uid: 501 },
      { launchctl, writeLaunchdJob, report },
    ),
  ).resolves.toEqual({ status: "failed", exitCode: 1 });

  expect(report).toHaveBeenCalledWith(
    expect.stringMatching(/bootstrap failed/i),
  );
  expect(report).not.toHaveBeenCalledWith(
    expect.stringMatching(/Installed|Replaced/),
  );
});
