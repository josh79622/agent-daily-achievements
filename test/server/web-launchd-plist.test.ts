import { describe, expect, test } from "vitest";

import {
  buildWebServerLaunchdPlist,
  defaultWebServerJobLabel,
  defaultWebServerPlistPath,
} from "../../src/server/web-launchd-plist.js";

describe("Web Server launchd plist builder (AW-5)", () => {
  test("generates valid plist with default label, KeepAlive, and RunAtLoad", () => {
    const plist = buildWebServerLaunchdPlist({
      nodePath: "/usr/local/bin/node",
      scriptPath: "/repo/dist/src/server/index.js",
      workingDirectory: "/repo",
    });

    expect(plist).toContain(
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"',
    );
    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain(`<string>${defaultWebServerJobLabel}</string>`);

    expect(plist).toContain("<key>ProgramArguments</key>");
    expect(plist).toContain("<string>/usr/local/bin/node</string>");
    expect(plist).toContain("<string>/repo/dist/src/server/index.js</string>");

    expect(plist).toContain("<key>WorkingDirectory</key>");
    expect(plist).toContain("<string>/repo</string>");

    expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(plist).toContain("<key>KeepAlive</key>\n  <true/>");

    expect(plist).not.toContain("<key>StandardOutPath</key>");
    expect(plist).not.toContain("<key>StandardErrorPath</key>");
  });

  test("supports custom label and stdout/stderr log paths", () => {
    const plist = buildWebServerLaunchdPlist({
      label: "custom.dailyproof.server",
      nodePath: "/custom/node",
      scriptPath: "/custom/dist/index.js",
      workingDirectory: "/custom",
      standardOutPath: "/custom/logs/out.log",
      standardErrorPath: "/custom/logs/err.log",
    });

    expect(plist).toContain("<string>custom.dailyproof.server</string>");
    expect(plist).toContain("<key>StandardOutPath</key>");
    expect(plist).toContain("<string>/custom/logs/out.log</string>");
    expect(plist).toContain("<key>StandardErrorPath</key>");
    expect(plist).toContain("<string>/custom/logs/err.log</string>");
  });

  test("escapes XML special characters in paths and labels", () => {
    const plist = buildWebServerLaunchdPlist({
      label: "label&<>'\"",
      nodePath: "/path/with/&<>'\"/node",
      scriptPath: "/path/with/&<>'\"/index.js",
      workingDirectory: "/path/with/&<>'\"",
      standardOutPath: "/path/&.log",
    });

    expect(plist).toContain("<string>label&amp;&lt;&gt;&apos;&quot;</string>");
    expect(plist).toContain(
      "<string>/path/with/&amp;&lt;&gt;&apos;&quot;/node</string>",
    );
    expect(plist).toContain("<string>/path/&amp;.log</string>");
  });

  test("defaultWebServerPlistPath returns path under ~/Library/LaunchAgents", () => {
    const plistPath = defaultWebServerPlistPath();
    expect(plistPath).toContain("Library/LaunchAgents");
    expect(plistPath).toContain(`${defaultWebServerJobLabel}.plist`);
  });
});
