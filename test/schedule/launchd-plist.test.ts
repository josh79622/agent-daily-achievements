import { expect, test } from "vitest";

import { buildLaunchdPlist } from "../../src/schedule/launchd-plist.js";

// Task S1, test case S1-17.

test("S1-17: the generated .plist runs the job entry point at 07:00 daily, with the repository's Node runtime", () => {
  const managedNodePath =
    "/Users/example/Library/Application Support/Agent Daily Achievements/runtimes/node-v24.12.0/bin/node";
  const plist = buildLaunchdPlist({
    label: "com.dailyproof.scheduled-report",
    nodePath: managedNodePath,
    scriptPath: "/repo/dist/src/schedule/entry.js",
    workingDirectory: "/repo",
  });

  // A real, well-formed plist: DOCTYPE plus a single top-level <dict>.
  expect(plist).toContain(
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"',
  );
  expect(plist).toContain("<key>Label</key>");
  expect(plist).toContain("<string>com.dailyproof.scheduled-report</string>");

  // Runs the repository's Node runtime against the job entry point, not a
  // bare "node" that would depend on launchd inheriting a shell PATH.
  expect(plist).toContain("<key>ProgramArguments</key>");
  const programArguments = plist
    .split("<key>ProgramArguments</key>")[1]
    ?.split("</array>")[0];
  expect(programArguments).toContain(`<string>${managedNodePath}</string>`);
  expect(programArguments).not.toContain("/opt/homebrew/opt/node@24/bin/node");
  expect(programArguments).toContain(
    "<string>/repo/dist/src/schedule/entry.js</string>",
  );

  // Daily at 07:00:00 local time: StartCalendarInterval with only Hour and
  // Minute set (no Day/Weekday/Month key would narrow it to less than daily).
  const interval = plist
    .split("<key>StartCalendarInterval</key>")[1]
    ?.split("</dict>")[0];
  expect(interval).toContain("<key>Hour</key>");
  expect(interval).toContain("<integer>7</integer>");
  expect(interval).toContain("<key>Minute</key>");
  expect(interval).toContain("<integer>0</integer>");
  expect(interval).not.toContain("<key>Day</key>");
  expect(interval).not.toContain("<key>Weekday</key>");
  expect(interval).not.toContain("<key>Month</key>");
});

test("S1-17: the default label is used when none is given", () => {
  const plist = buildLaunchdPlist({
    nodePath:
      "/Users/example/Library/Application Support/Agent Daily Achievements/runtimes/node-v24.12.0/bin/node",
    scriptPath: "/repo/dist/src/schedule/entry.js",
    workingDirectory: "/repo",
  });

  expect(plist).toContain("<string>com.dailyproof.scheduled-report</string>");
});
