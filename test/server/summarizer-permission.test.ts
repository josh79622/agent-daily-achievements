import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";

type Provider = "claude-code" | "codex";

interface SummaryRequest {
  payload: {
    date: string;
    timeZone: string;
    payloadJson: string;
    manifest: Array<{
      source: Provider;
      recordId: string;
      messageIds: readonly string[];
    }>;
    coverage: unknown[];
    byteLength: number;
  };
  scheduled: boolean;
}

interface SummaryRunner {
  run(provider: Provider, request: SummaryRequest): Promise<void>;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function setup(
  runner: SummaryRunner,
  availableProviders: Provider[] = ["codex", "claude-code"],
  summaryRequest = request(),
) {
  const root = await mkdtemp(join(tmpdir(), "summary-permission-test-"));
  const server = createApp({
    reportStore: createReportStore(join(root, "reports")),
    summaryPermissionPath: join(root, "settings", "summary-permission.json"),
    summaryRunner: runner,
    availableSummaryProviders: availableProviders,
    summaryRequestFactory: {
      async create() {
        return summaryRequest;
      },
    },
  } as Parameters<typeof createApp>[0]);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
    () => rm(root, { recursive: true, force: true }),
  );
  return {
    get: (path: string) => fetch(url + path),
    putPermission: (body: unknown) =>
      fetch(url + "/api/summarizer/permission", {
        method: "PUT",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    generate: (body: unknown = { scheduled: true }) =>
      fetch(url + "/api/reports/generate", {
        method: "POST",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    summaryPermissionPath: join(root, "settings", "summary-permission.json"),
  };
}

function request(): SummaryRequest {
  const payloadJson = JSON.stringify({
    date: "2026-09-18",
    conversations: [
      {
        source: "codex",
        recordId: "synthetic-session",
        messages: [
          { id: "m-1", role: "user", time: "09:12", text: "Synthetic content" },
        ],
      },
    ],
  });
  return {
    scheduled: true,
    payload: {
      date: "2026-09-18",
      timeZone: "Australia/Sydney",
      payloadJson,
      manifest: [
        { source: "codex", recordId: "synthetic-session", messageIds: ["m-1"] },
      ],
      coverage: [],
      byteLength: Buffer.byteLength(payloadJson),
    },
  };
}

test("permission: no saved maximum grant blocks a summary request", async () => {
  const calls: Array<{ provider: Provider; request: SummaryRequest }> = [];
  const app = await setup({
    async run(provider, summaryRequest) {
      calls.push({ provider, request: summaryRequest });
    },
  });

  expect((await app.generate()).status).toBe(403);
  expect(calls).toEqual([]);
});

test("permission: disclosure identifies scope, complete day conversations, and both CLI recipients", async () => {
  const app = await setup({ async run() {} });

  const response = await app.get("/api/summarizer/permission");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    permission: null,
    disclosure: {
      sourceScope: ["claude-code", "codex"],
      conversationScope:
        "Complete conversations with report-day activity, including context through the end of that day.",
      possibleRecipients: ["codex", "claude-code", "agy"],
    },
  });
});

test("permission: selects Codex by default, or Claude Code when it is the only usable CLI", async () => {
  const calls: Provider[] = [];
  const app = await setup({
    async run(provider) {
      calls.push(provider);
    },
  });

  expect(
    (await app.putPermission({ sourceScope: ["claude-code", "codex"] })).status,
  ).toBe(200);
  expect((await app.generate()).status).toBe(201);
  expect(calls).toEqual(["codex"]);

  const claudeOnlyCalls: Provider[] = [];
  const claudeOnly = await setup(
    {
      async run(provider) {
        claudeOnlyCalls.push(provider);
      },
    },
    ["claude-code"],
  );
  expect(
    (
      await claudeOnly.putPermission({
        sourceScope: ["claude-code", "codex"],
      })
    ).status,
  ).toBe(200);
  expect((await claudeOnly.generate()).status).toBe(201);
  expect(claudeOnlyCalls).toEqual(["claude-code"]);
});

test("permission: one saved maximum grant permits scheduled requests and fallback", async () => {
  const calls: Provider[] = [];
  const app = await setup({
    async run(provider) {
      calls.push(provider);
      if (provider === "codex") throw new Error("Synthetic Codex failure");
    },
  });
  expect(
    (await app.putPermission({ sourceScope: ["claude-code", "codex"] })).status,
  ).toBe(200);

  expect((await app.generate()).status).toBe(201);
  expect(calls).toEqual(["codex", "claude-code"]);
});

test("permission: Codex failure falls back to Claude Code, then reports both failures as incomplete", async () => {
  const calls: Provider[] = [];
  const app = await setup({
    async run(provider) {
      calls.push(provider);
      throw new Error("Synthetic CLI failure");
    },
  });
  expect(
    (await app.putPermission({ sourceScope: ["claude-code", "codex"] })).status,
  ).toBe(200);

  const response = await app.generate();

  expect(response.status).toBe(503);
  expect(calls).toEqual(["codex", "claude-code"]);
  expect(await response.json()).toEqual({
    report: {
      status: "incomplete",
      reason:
        "Codex failed: Synthetic CLI failure. Claude Code failed: Synthetic CLI failure.",
    },
  });
});

test("permission: later saved settings change the next request's permission and preferred CLI", async () => {
  const calls: Provider[] = [];
  const app = await setup({
    async run(provider) {
      calls.push(provider);
    },
  });
  expect(
    (await app.putPermission({ sourceScope: ["claude-code", "codex"] })).status,
  ).toBe(200);
  expect((await app.generate()).status).toBe(201);
  expect(
    (
      await app.putPermission({
        sourceScope: ["claude-code", "codex"],
        preferredCli: "claude-code",
      })
    ).status,
  ).toBe(200);
  expect((await app.generate()).status).toBe(201);
  expect(calls).toEqual(["codex", "claude-code"]);

  expect((await app.putPermission({ sourceScope: [] })).status).toBe(200);
  expect((await app.generate()).status).toBe(403);
  expect(calls).toEqual(["codex", "claude-code"]);
});

test("permission: the server-built report-day payload is the only payload sent to a runner", async () => {
  const calls: SummaryRequest[] = [];
  const serverRequest = request();
  const app = await setup(
    {
      async run(_provider, receivedRequest) {
        calls.push(receivedRequest);
      },
    },
    ["codex"],
    serverRequest,
  );
  expect(
    (await app.putPermission({ sourceScope: ["claude-code", "codex"] })).status,
  ).toBe(200);

  expect(
    (
      await app.generate({
        scheduled: true,
        payload: {
          date: "2026-09-18",
          payloadJson: '{"date":"2026-09-18","conversations":[]}',
          manifest: [],
          coverage: [],
          byteLength: 41,
        },
      })
    ).status,
  ).toBe(400);
  expect(calls).toEqual([]);
  expect((await app.generate()).status).toBe(201);
  expect(calls).toEqual([serverRequest]);
});

test("permission: a saved maximum grant records both possible recipients", async () => {
  const app = await setup({ async run() {} });

  expect(
    (await app.putPermission({ sourceScope: ["claude-code", "codex"] })).status,
  ).toBe(200);

  expect(JSON.parse(await readFile(app.summaryPermissionPath, "utf8"))).toEqual(
    {
      version: 1,
      permission: {
        sourceScope: ["claude-code", "codex"],
        recipients: ["codex", "claude-code", "agy"],
      },
    },
  );
});
