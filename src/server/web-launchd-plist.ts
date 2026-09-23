// Generates the launchd .plist that supervises the Daily Proof web server.
// Runs the server on load and keeps it alive, reviving it if killed or crashed.

import { homedir } from "node:os";
import { join } from "node:path";

export const defaultWebServerJobLabel = "com.dailyproof.web-server";

export function defaultWebServerPlistPath(
  label = defaultWebServerJobLabel,
): string {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

export interface WebServerJobConfig {
  label?: string;
  nodePath: string;
  scriptPath: string; // e.g. dist/src/server/index.js
  workingDirectory: string;
  standardOutPath?: string;
  standardErrorPath?: string;
}

export function buildWebServerLaunchdPlist(config: WebServerJobConfig): string {
  const label = config.label ?? defaultWebServerJobLabel;
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
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
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
