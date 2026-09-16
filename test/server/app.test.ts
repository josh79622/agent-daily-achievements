import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import test from "node:test";

import type { DailyReport } from "../../src/domain/report.js";
import type { LocalCollector } from "../../src/collector/local-collector.js";
import { createApp } from "../../src/server/app.js";
import {
  createReportStore,
  type ReportStore,
} from "../../src/storage/report-store.js";

async function startTestApp(
  context: test.TestContext,
  reportStore?: ReportStore,
) {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-server-"));
  const server = createApp({
    reportStore: reportStore ?? createReportStore(directory),
    reportDate: () => "2026-09-16",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    server.close();
    await once(server, "close");
    await rm(directory, { force: true, recursive: true });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test("returns 404 when no latest report has been generated", async (context) => {
  const baseUrl = await startTestApp(context);

  const response = await fetch(`${baseUrl}/api/reports/latest`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "report_not_found",
      message: "No report has been generated yet.",
    },
  });
});

test("generates a sample report and reads the stored result back", async (context) => {
  const baseUrl = await startTestApp(context);

  const generationResponse = await fetch(`${baseUrl}/api/reports/sample`, {
    method: "POST",
  });
  const generationBody = (await generationResponse.json()) as {
    report: unknown;
  };
  const latestResponse = await fetch(`${baseUrl}/api/reports/latest`);

  assert.equal(generationResponse.status, 201);
  assert.equal(latestResponse.status, 200);
  assert.deepEqual(await latestResponse.json(), generationBody);
});

test("returns the persisted report after sample generation", async (context) => {
  let savedReport: DailyReport | undefined;
  const reportStore: ReportStore = {
    async save(report) {
      savedReport = report;
    },
    async readLatest() {
      assert.ok(savedReport);
      return {
        found: true,
        report: { ...savedReport, title: "Read-back report" },
      };
    },
  };
  const baseUrl = await startTestApp(context, reportStore);

  const response = await fetch(`${baseUrl}/api/reports/sample`, {
    method: "POST",
  });
  const body = (await response.json()) as { report: DailyReport };

  assert.equal(response.status, 201);
  assert.equal(body.report.title, "Read-back report");
});

test("returns a structured 404 for an unknown API route", async (context) => {
  const baseUrl = await startTestApp(context);

  const response = await fetch(`${baseUrl}/api/not-a-route`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: "not_found", message: "Route not found." },
  });
});

test("returns 405 when a report route receives the wrong method", async (context) => {
  const baseUrl = await startTestApp(context);

  const response = await fetch(`${baseUrl}/api/reports/sample`);

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), {
    error: { code: "method_not_allowed", message: "Method not allowed." },
  });
});

test("serves the local report page from the configured static directory", async (context) => {
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
  context.after(async () => {
    server.close();
    await once(server, "close");
    await rm(directory, { force: true, recursive: true });
  });
  const address = server.address() as AddressInfo;

  const response = await fetch(`http://127.0.0.1:${address.port}/`);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<main>Local report page</main>");
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
});

test("serves collector metadata before a selected local preview", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "daily-proof-collector-api-"));
  const collector: LocalCollector = {
    async collect() {
      return {
        date: "2026-09-16",
        sources: [{ source: "claude-code", sessions: 1, issues: 0 }, { source: "codex", sessions: 0, issues: 0 }],
        sessions: [{ id: "session-1", source: "claude-code", file: "/local/session.jsonl", startedAt: "2026-09-16T01:00:00Z", endedAt: "2026-09-16T01:01:00Z", messageCount: 1, issueCount: 0, messages: [{ id: "record-1", role: "user", text: "Private preview", timestamp: "2026-09-16T01:00:00Z" }] }],
      };
    },
  };
  const server = createApp({ reportStore: createReportStore(directory), collector, collectorDate: () => "2026-09-16" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => { server.close(); await once(server, "close"); await rm(directory, { force: true, recursive: true }); });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const summary = await fetch(`${baseUrl}/api/collector/today`);
  const preview = await fetch(`${baseUrl}/api/collector/sessions/session-1`);

  assert.equal(summary.status, 200);
  assert.doesNotMatch(await summary.text(), /Private preview/);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Private preview/);
});
