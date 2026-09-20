import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import type { AchievementReportV1 } from "../../src/report/contract.js";
import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";

// Test cases RE-1 to RE-10: editing/removing an achievement in an
// already-saved report (BRIEF.md: an incorrect item must be correctable or
// removable). No CLI is invoked; this only touches ReportStore.

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function sampleReport(): AchievementReportV1 {
  return {
    schemaVersion: 1,
    date: "2026-09-09",
    timezone: "Australia/Sydney",
    status: "complete",
    achievements: [
      {
        id: "item-1",
        category: "progress",
        title: "Original title",
        detail: "Original detail",
        evidence: [{ source: "codex", recordId: "rec-1", messageIds: ["m1"] }],
      },
      {
        id: "item-2",
        category: "decision",
        title: "Second item",
        detail: "Second detail",
        evidence: [{ source: "codex", recordId: "rec-2" }],
      },
    ],
    coverage: [{ source: "codex", state: "included" }],
    incomplete: [],
  };
}

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "report-achievements-"));
  const reportStore = createReportStore(directory);
  await reportStore.save(sampleReport());
  const server = createApp({ reportStore });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.close();
    await once(server, "close");
    await rm(directory, { force: true, recursive: true });
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    reportStore,
    patch: (id: string, body: unknown) =>
      fetch(`${baseUrl}/api/reports/2026-09-09/achievements/${id}`, {
        method: "PATCH",
        headers: { origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    del: (id: string) =>
      fetch(`${baseUrl}/api/reports/2026-09-09/achievements/${id}`, {
        method: "DELETE",
        headers: { origin: baseUrl },
      }),
  };
}

test("RE-1: PATCH with only a title edits just the title", async () => {
  const { patch } = await setup();

  const response = await patch("item-1", { title: "Fixed title" });
  const body = (await response.json()) as { report: AchievementReportV1 };

  expect(response.status).toBe(200);
  const item = body.report.achievements.find((a) => a.id === "item-1");
  expect(item?.title).toBe("Fixed title");
  expect(item?.detail).toBe("Original detail");
});

test("RE-2: PATCH with only a detail edits just the detail", async () => {
  const { patch } = await setup();

  const response = await patch("item-1", { detail: "Fixed detail" });
  const body = (await response.json()) as { report: AchievementReportV1 };
  const item = body.report.achievements.find((a) => a.id === "item-1");

  expect(item?.title).toBe("Original title");
  expect(item?.detail).toBe("Fixed detail");
});

test("RE-3: PATCH with both fields edits both, and the change is persisted", async () => {
  const { patch, reportStore } = await setup();

  await patch("item-1", { title: "New title", detail: "New detail" });
  const stored = await reportStore.read("2026-09-09");

  expect(stored.found && stored.report.achievements[0]).toMatchObject({
    title: "New title",
    detail: "New detail",
  });
});

test("RE-4: an invalid edit is rejected and nothing on disk changes", async () => {
  const { patch, reportStore } = await setup();

  for (const invalid of [
    {},
    { title: "" },
    { title: "x".repeat(121) },
    { id: "new-id" },
    { category: "learning" },
    { evidence: [] },
    "not an object",
  ]) {
    const response = await patch("item-1", invalid);
    expect(response.status).toBe(400);
  }
  const stored = await reportStore.read("2026-09-09");
  expect(stored.found && stored.report.achievements[0]).toMatchObject({
    title: "Original title",
    detail: "Original detail",
  });
});

test("RE-5: PATCH for an achievement id that does not exist is 404", async () => {
  const { patch } = await setup();

  const response = await patch("no-such-id", { title: "Anything" });

  expect(response.status).toBe(404);
});

test("RE-6: PATCH for a date with no saved report is 404", async () => {
  const { baseUrl } = await setup();

  const response = await fetch(
    `${baseUrl}/api/reports/2026-01-01/achievements/item-1`,
    {
      method: "PATCH",
      headers: { origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ title: "Anything" }),
    },
  );

  expect(response.status).toBe(404);
});

test("RE-7: DELETE removes only that achievement and leaves the rest of the report untouched", async () => {
  const { del, reportStore } = await setup();
  const before = await reportStore.read("2026-09-09");

  const response = await del("item-1");
  const body = (await response.json()) as { report: AchievementReportV1 };

  expect(response.status).toBe(200);
  expect(body.report.achievements.map((a) => a.id)).toEqual(["item-2"]);
  expect(body.report.status).toBe(before.found && before.report.status);
  expect(body.report.coverage).toEqual(before.found && before.report.coverage);
  expect(body.report.incomplete).toEqual(
    before.found && before.report.incomplete,
  );
  const stored = await reportStore.read("2026-09-09");
  expect(stored.found && stored.report.achievements).toHaveLength(1);
});

test("RE-8: DELETE for an achievement id that does not exist is 404", async () => {
  const { del } = await setup();

  const response = await del("no-such-id");

  expect(response.status).toBe(404);
});

test("RE-9: DELETE for a date with no saved report is 404", async () => {
  const { baseUrl } = await setup();

  const response = await fetch(
    `${baseUrl}/api/reports/2026-01-01/achievements/item-1`,
    { method: "DELETE", headers: { origin: baseUrl } },
  );

  expect(response.status).toBe(404);
});

test("RE-10: a cross-site PATCH or DELETE is refused, and nothing changes", async () => {
  const { baseUrl, reportStore } = await setup();

  const patchResponse = await fetch(
    `${baseUrl}/api/reports/2026-09-09/achievements/item-1`,
    {
      method: "PATCH",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "Hijacked" }),
    },
  );
  const deleteResponse = await fetch(
    `${baseUrl}/api/reports/2026-09-09/achievements/item-1`,
    { method: "DELETE", headers: { origin: "https://evil.example" } },
  );

  expect(patchResponse.status).toBe(403);
  expect(deleteResponse.status).toBe(403);
  const stored = await reportStore.read("2026-09-09");
  expect(stored.found && stored.report.achievements).toHaveLength(2);
});

test("RE-11: a PATCH or DELETE with no Origin header at all is refused, and nothing changes", async () => {
  const { baseUrl, reportStore } = await setup();

  const patchResponse = await fetch(
    `${baseUrl}/api/reports/2026-09-09/achievements/item-1`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Hijacked" }),
    },
  );
  const deleteResponse = await fetch(
    `${baseUrl}/api/reports/2026-09-09/achievements/item-1`,
    { method: "DELETE" },
  );

  expect(patchResponse.status).toBe(403);
  expect(deleteResponse.status).toBe(403);
  const stored = await reportStore.read("2026-09-09");
  expect(stored.found && stored.report.achievements).toHaveLength(2);
});

test("RE-12: PATCH with isPrimary: true marks target achievement as primary and clears it on others", async () => {
  const { patch, reportStore } = await setup();

  const res1 = await patch("item-1", { isPrimary: true });
  const body1 = (await res1.json()) as { report: AchievementReportV1 };
  expect(
    body1.report.achievements.find((a) => a.id === "item-1")?.isPrimary,
  ).toBe(true);

  const res2 = await patch("item-2", { isPrimary: true });
  const body2 = (await res2.json()) as { report: AchievementReportV1 };
  expect(
    body2.report.achievements.find((a) => a.id === "item-2")?.isPrimary,
  ).toBe(true);
  expect(
    body2.report.achievements.find((a) => a.id === "item-1")?.isPrimary,
  ).toBe(false);

  const stored = await reportStore.read("2026-09-09");
  expect(
    stored.found &&
      stored.report.achievements.find((a) => a.id === "item-2")?.isPrimary,
  ).toBe(true);
  expect(
    stored.found &&
      stored.report.achievements.find((a) => a.id === "item-1")?.isPrimary,
  ).toBe(false);
});
