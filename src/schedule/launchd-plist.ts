// Generates the launchd .plist that runs the job entry point at 07:00 daily
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
}

/** Builds the `.plist` XML content. Runs daily at local 07:00:00. */
export function buildLaunchdPlist(config: LaunchdJobConfig): string {
  const label = config.label ?? defaultLaunchdJobLabel;
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
    "    <integer>7</integer>",
    "    <key>Minute</key>",
    "    <integer>0</integer>",
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
