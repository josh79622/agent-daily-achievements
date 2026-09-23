// Generates the launchd .plist that runs the job entry point at 09:00 daily
// (S1-17). A pure string builder: nothing here touches the filesystem or
// calls launchctl (docs/plans/2026-09-21-task-s1-seven-am-window-and-schedule-test-cases.md:
// "generate the launchd .plist from code").

export const defaultLaunchdJobLabel = "com.dailyproof.scheduled-report";

export interface LaunchdJobConfig {
  /** Reverse-DNS launchd job label, also the `.plist` file's basename. */
  label?: string;
  /** Absolute path to the repository's approved Node runtime. */
  nodePath: string;
  /** Absolute path to the compiled job entry point (dist/src/schedule/entry.js). */
  scriptPath: string;
  /** Absolute path to the repository checkout, used as the job's cwd. */
  workingDirectory: string;
  /** Where launchd appends the job's stdout/stderr; optional. */
  standardOutPath?: string;
  standardErrorPath?: string;
  /** Scheduled hour in local time, defaults to 9. */
  hour?: number;
  /** Scheduled minute in local time, defaults to 0. */
  minute?: number;
}

/** Builds the `.plist` XML content. Runs daily at local 09:00:00 by default. */
export function buildLaunchdPlist(config: LaunchdJobConfig): string {
  const label = config.label ?? defaultLaunchdJobLabel;
  const hour = config.hour ?? 9;
  const minute = config.minute ?? 0;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${escapeXml(label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    `    <string>${escapeXml(config.nodePath)}</string>`,
    `    <string>${escapeXml(config.scriptPath)}</string>`,
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${escapeXml(config.workingDirectory)}</string>`,
    "  <key>StartCalendarInterval</key>",
    "  <dict>",
    "    <key>Hour</key>",
    `    <integer>${hour}</integer>`,
    "    <key>Minute</key>",
    `    <integer>${minute}</integer>`,
    "  </dict>",
    "  <key>RunAtLoad</key>",
    "  <false/>",
    ...(config.standardOutPath
      ? [
          "  <key>StandardOutPath</key>",
          `  <string>${escapeXml(config.standardOutPath)}</string>`,
        ]
      : []),
    ...(config.standardErrorPath
      ? [
          "  <key>StandardErrorPath</key>",
          `  <string>${escapeXml(config.standardErrorPath)}</string>`,
        ]
      : []),
    "</dict>",
    "</plist>",
    "",
  ];
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
