import { execFile as execFileCallback } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFile = promisify(execFileCallback);
const scriptPath = resolve(process.cwd(), "scripts/verify-fresh-install.mjs");

describe("Fresh Install Verification Script (Phase 7)", () => {
  test("executes scripts/verify-fresh-install.mjs and passes all checks", async () => {
    const result = await execFile(process.execPath, [scriptPath]);

    expect(result.stdout).toContain("[PASS] Node.js version >= 24");
    if (process.platform === "darwin") {
      expect(result.stdout).toContain("[PASS] macOS system utilities exist");
    } else {
      expect(result.stdout).toContain(
        `[PASS] macOS system utilities check skipped on ${process.platform}`,
      );
    }
    expect(result.stdout).toContain(
      "[PASS] Isolated report timezone and summary permission setup",
    );
    expect(result.stdout).toContain(
      "[PASS] LaunchAgent plist generator valid XML and absolute paths",
    );
    expect(result.stdout).toContain(
      "[PASS] Port 4317 listener logic responds cleanly",
    );
    expect(result.stdout).toContain(
      "All fresh-install verification checks passed successfully!",
    );
  });
});
