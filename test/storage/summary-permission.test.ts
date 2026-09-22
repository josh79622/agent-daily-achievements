import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  DEFAULT_SUMMARY_PERMISSION,
  readSummaryPermission,
  setupSummaryPermission,
  validSummaryPermission,
  writeSummaryPermission,
} from "../../src/storage/summary-permission.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

async function tempFilePath(
  filename = "summary-permission.json",
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "daily-proof-summary-permission-"));
  directories.push(dir);
  return join(dir, filename);
}

describe("DEFAULT_SUMMARY_PERMISSION", () => {
  test("defines approved defaults for fresh installation", () => {
    expect(DEFAULT_SUMMARY_PERMISSION).toEqual({
      sourceScope: ["claude-code", "codex", "antigravity"],
      preferredCli: "agy",
      recipients: ["codex", "claude-code", "agy"],
      summaryLanguage: "zh-TW",
    });
    expect(validSummaryPermission(DEFAULT_SUMMARY_PERMISSION)).toBe(true);
  });
});

describe("setupSummaryPermission", () => {
  test("writes DEFAULT_SUMMARY_PERMISSION when file is absent", async () => {
    const path = await tempFilePath();
    const result = await setupSummaryPermission({ path });

    expect(result.status).toBe("written");
    expect(result.permission).toEqual(DEFAULT_SUMMARY_PERMISSION);

    const stored = await readSummaryPermission(path);
    expect(stored).toEqual(DEFAULT_SUMMARY_PERMISSION);
  });

  test("writes custom permission when specified and file is absent", async () => {
    const path = await tempFilePath();
    const custom = {
      sourceScope: ["claude-code" as const],
      preferredCli: "claude-code" as const,
      recipients: ["claude-code" as const, "codex" as const],
      summaryLanguage: "en",
    };

    const result = await setupSummaryPermission({ path, permission: custom });
    expect(result.status).toBe("written");
    expect(result.permission).toEqual(custom);

    const stored = await readSummaryPermission(path);
    expect(stored).toEqual(custom);
  });

  test("keeps existing permission with non-empty sourceScope when force is false", async () => {
    const path = await tempFilePath();
    const existing = {
      sourceScope: ["codex" as const],
      preferredCli: "codex" as const,
      recipients: ["codex" as const, "claude-code" as const],
      summaryLanguage: "es",
    };
    await writeSummaryPermission(path, existing);

    const result = await setupSummaryPermission({ path });
    expect(result.status).toBe("kept");
    expect(result.permission).toEqual(existing);

    const stored = await readSummaryPermission(path);
    expect(stored).toEqual(existing);
  });

  test("overwrites existing permission when force is true", async () => {
    const path = await tempFilePath();
    const existing = {
      sourceScope: ["codex" as const],
      preferredCli: "codex" as const,
      recipients: ["codex" as const, "claude-code" as const],
      summaryLanguage: "es",
    };
    await writeSummaryPermission(path, existing);

    const result = await setupSummaryPermission({ path, force: true });
    expect(result.status).toBe("written");
    expect(result.permission).toEqual(DEFAULT_SUMMARY_PERMISSION);

    const stored = await readSummaryPermission(path);
    expect(stored).toEqual(DEFAULT_SUMMARY_PERMISSION);
  });

  test("replaces corrupt file with default permission", async () => {
    const path = await tempFilePath();
    await writeFile(path, "{ corrupt json", "utf8");

    const result = await setupSummaryPermission({ path });
    expect(result.status).toBe("written");
    expect(result.permission).toEqual(DEFAULT_SUMMARY_PERMISSION);

    const stored = await readSummaryPermission(path);
    expect(stored).toEqual(DEFAULT_SUMMARY_PERMISSION);
  });

  test("replaces file when existing permission has empty sourceScope", async () => {
    const path = await tempFilePath();
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        permission: {
          sourceScope: [],
          preferredCli: "agy",
          recipients: ["codex", "claude-code"],
          summaryLanguage: "zh-TW",
        },
      }),
      "utf8",
    );

    const result = await setupSummaryPermission({ path });
    expect(result.status).toBe("written");
    expect(result.permission).toEqual(DEFAULT_SUMMARY_PERMISSION);

    const stored = await readSummaryPermission(path);
    expect(stored).toEqual(DEFAULT_SUMMARY_PERMISSION);
  });

  test("returns write-failed when path is missing or invalid", async () => {
    const result = await setupSummaryPermission({ path: undefined });
    expect(result.status).toBe("write-failed");
  });
});
