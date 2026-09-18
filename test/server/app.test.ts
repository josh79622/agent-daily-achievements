import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterEach, expect, test } from "vitest";

import type { AchievementReportV1 } from "../../src/report/contract.js";
import type { LocalCollector } from "../../src/collector/local-collector.js";
import { createApp } from "../../src/server/app.js";
import {
  createReportStore,
  type ReportStore,
} from "../../src/storage/report-store.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function startTestApp(reportStore?: ReportStore) {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-server-"));
  const server = createApp({
    reportStore: reportStore ?? createReportStore(directory),
    reportDate: () => "2026-09-16",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.close();
    await once(server, "close");
    await rm(directory, { force: true, recursive: true });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test("returns 404 when no latest report has been generated", async () => {
  const baseUrl = await startTestApp();

  const response = await fetch(`${baseUrl}/api/reports/latest`);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: {
      code: "report_not_found",
      message: "No report has been generated yet.",
    },
  });
});

function sampleReport(): AchievementReportV1 {
  return {
    schemaVersion: 1,
    date: "2026-09-16",
    timezone: "Australia/Sydney",
    status: "complete",
    achievements: [],
    coverage: [],
    incomplete: [],
  };
}

test("serves whatever the store holds, unchanged", async () => {
  const report = sampleReport();
  const reportStore: ReportStore = {
    async save() {
      throw new Error("Nothing in this test saves a report.");
    },
    async read() {
      return { found: true, report };
    },
    async readLatest() {
      return { found: true, report };
    },
    async listDates() {
      return [report.date];
    },
  };
  const baseUrl = await startTestApp(reportStore);

  const response = await fetch(`${baseUrl}/api/reports/latest`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ report });
});

test("returns a structured 404 for an unknown API route", async () => {
  const baseUrl = await startTestApp();

  const response = await fetch(`${baseUrl}/api/not-a-route`);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: "not_found", message: "Route not found." },
  });
});

test("returns 405 when a report route receives the wrong method", async () => {
  const baseUrl = await startTestApp();

  const response = await fetch(`${baseUrl}/api/reports/latest`, {
    method: "POST",
  });

  expect(response.status).toBe(405);
  expect(await response.json()).toEqual({
    error: { code: "method_not_allowed", message: "Method not allowed." },
  });
});

test("serves the local report page from the configured static directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-web-"));
  await writeFile(
    join(directory, "index.html"),
    "<main>Local report page</main>",
  );
  const server = createApp({
    reportStore: createReportStore(join(directory, "reports")),
    staticDirectory: directory,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.close();
    await once(server, "close");
    await rm(directory, { force: true, recursive: true });
  });
  const address = server.address() as AddressInfo;

  const response = await fetch(`http://127.0.0.1:${address.port}/`);

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("<main>Local report page</main>");
  expect(response.headers.get("content-type") ?? "").toMatch(/text\/html/);
});

test("serves collector metadata before a selected local preview", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-proof-collector-api-"));
  const collector: LocalCollector = {
    async collect() {
      return {
        date: "2026-09-16",
        timeZone: "UTC",
        sources: [
          { source: "claude-code", sessions: 1, issues: 0, state: "available" },
          { source: "codex", sessions: 0, issues: 0, state: "no-activity" },
        ],
        sessions: [
          {
            id: "session-1",
            source: "claude-code",
            file: "/local/session.jsonl",
            startedAt: "2026-09-16T01:00:00Z",
            endedAt: "2026-09-16T01:01:00Z",
            messageCount: 1,
            issueCount: 0,
            messages: [
              {
                id: "record-1",
                role: "user",
                text: "Private preview",
                timestamp: "2026-09-16T01:00:00Z",
                parts: [{ kind: "text", text: "Private preview" }],
              },
            ],
          },
        ],
      };
    },
  };
  const server = createApp({
    reportStore: createReportStore(directory),
    collector,
    consentPath: join(directory, "consent.json"),
    collectorDate: () => "2026-09-16",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.close();
    await once(server, "close");
    await rm(directory, { force: true, recursive: true });
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await fetch(`${baseUrl}/api/collector/consent`, {
    method: "PUT",
    headers: { origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ sources: ["claude-code"] }),
  });
  const summary = await fetch(`${baseUrl}/api/collector/today`);
  const preview = await fetch(`${baseUrl}/api/collector/sessions/session-1`);
  const summaryBody = (await summary.json()) as {
    sources: Array<{ source: string; state: string }>;
    sessions: unknown[];
  };

  expect(summary.status).toBe(200);
  expect(summaryBody.sources).toEqual([
    { source: "claude-code", sessions: 1, issues: 0, state: "available" },
  ]);
  expect(JSON.stringify(summaryBody)).not.toMatch(/Private preview/);
  expect(preview.status).toBe(200);
  expect(await preview.text()).toMatch(/Private preview/);
});

test("a trace-back preview collects the report's own date, not today's", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-proof-traceback-api-"));
  const collectedDates: string[] = [];
  const collector: LocalCollector = {
    async collect(date) {
      collectedDates.push(date);
      return {
        date,
        timeZone: "UTC",
        sources: [],
        sessions: [
          {
            id: "session-1",
            source: "claude-code",
            file: "/local/session.jsonl",
            startedAt: `${date}T01:00:00Z`,
            endedAt: `${date}T01:01:00Z`,
            messageCount: 1,
            issueCount: 0,
            messages: [
              {
                id: "record-1",
                role: "user",
                text: `Content for ${date}`,
                timestamp: `${date}T01:00:00Z`,
                parts: [{ kind: "text", text: `Content for ${date}` }],
              },
            ],
          },
        ],
      };
    },
  };
  const server = createApp({
    reportStore: createReportStore(directory),
    collector,
    consentPath: join(directory, "consent.json"),
    collectorDate: () => "2026-09-18",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.close();
    await once(server, "close");
    await rm(directory, { force: true, recursive: true });
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await fetch(`${baseUrl}/api/collector/consent`, {
    method: "PUT",
    headers: { origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ sources: ["claude-code"] }),
  });

  const traced = await fetch(
    `${baseUrl}/api/collector/sessions/session-1?date=2026-09-09`,
  );
  expect(traced.status).toBe(200);
  expect(await traced.text()).toMatch(/Content for 2026-09-09/);

  const live = await fetch(`${baseUrl}/api/collector/sessions/session-1`);
  expect(live.status).toBe(200);
  expect(await live.text()).toMatch(/Content for 2026-09-18/);

  expect(collectedDates).toEqual(["2026-09-09", "2026-09-18"]);

  const invalid = await fetch(
    `${baseUrl}/api/collector/sessions/session-1?date=09-2026-18`,
  );
  expect(invalid.status).toBe(400);
});
