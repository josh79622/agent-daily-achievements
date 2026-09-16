import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";

async function startTestApp(context: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-server-"));
  const server = createApp({
    reportStore: createReportStore(directory),
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
