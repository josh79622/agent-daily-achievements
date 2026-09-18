import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  createLocalCollector,
  type LocalCollector,
} from "../../src/collector/local-collector.js";
import { createApp, type SummaryRequest } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";

// Wiring for the first Phase 5 item: /api/reports/generate must build its
// payload with buildReportDayPayload rather than an injected test factory.
// Synthetic records only; no CLI is invoked.

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function claudeLine(session: string, uuid: string, text: string): string {
  return JSON.stringify({
    type: "user",
    sessionId: session,
    timestamp: "2026-09-18T09:12:00Z",
    uuid,
    message: { role: "user", content: text },
  });
}

function codexLines(session: string, text: string): string {
  return [
    JSON.stringify({ type: "session_meta", payload: { id: session } }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-09-18T09:30:00Z",
      payload: {
        role: "user",
        type: "message",
        content: [{ type: "input_text", text }],
      },
    }),
  ].join("\n");
}

async function setup({
  collector,
  withCollector = true,
  summaryRequestFactory,
}: {
  collector?: LocalCollector;
  withCollector?: boolean;
  summaryRequestFactory?: { create(): Promise<SummaryRequest> };
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "report-generation-test-"));
  const claude = join(root, "claude");
  const codex = join(root, "codex");
  await mkdir(claude);
  await mkdir(codex);
  await writeFile(
    join(claude, "claude-session.jsonl"),
    claudeLine("claude-session", "cc-1", "reviewed the design"),
  );
  await writeFile(
    join(codex, "codex-session.jsonl"),
    codexLines("codex-session", "wrote the payload builder"),
  );

  const calls: SummaryRequest[] = [];
  const server = createApp({
    reportStore: createReportStore(join(root, "reports")),
    summaryPermissionPath: join(root, "settings", "summary-permission.json"),
    availableSummaryProviders: ["codex", "claude-code"],
    reportDate: () => "2026-09-18",
    summaryRunner: {
      async run(_provider, request) {
        calls.push(request);
      },
    },
    ...(summaryRequestFactory ? { summaryRequestFactory } : {}),
    ...(withCollector
      ? {
          collector:
            collector ??
            createLocalCollector({
              claudeDirectories: [claude],
              codexDirectories: [codex],
              timeZone: "UTC",
            }),
        }
      : {}),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
    () => rm(root, { recursive: true, force: true }),
  );
  return {
    calls,
    permit: (sourceScope: string[]) =>
      fetch(url + "/api/summarizer/permission", {
        method: "PUT",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify({ sourceScope }),
      }),
    generate: () =>
      fetch(url + "/api/reports/generate", {
        method: "POST",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify({ scheduled: true }),
      }),
  };
}

test("RG-1: the route builds the payload from collected sessions with no injected factory", async () => {
  const app = await setup();
  expect((await app.permit(["codex", "claude-code"])).status).toBe(200);

  expect((await app.generate()).status).toBe(201);

  const request = app.calls[0];
  expect(request?.scheduled).toBe(true);
  // Conversations follow the approved source scope order, not the clock: the
  // 09:30 Codex session precedes the 09:12 Claude Code one.
  expect(JSON.parse(request?.payload.payloadJson ?? "null")).toEqual({
    date: "2026-09-18",
    conversations: [
      {
        source: "codex",
        recordId: "codex-session",
        messages: [
          {
            id: "codex-session.jsonl:2",
            role: "user",
            time: "09:30",
            text: "wrote the payload builder",
          },
        ],
      },
      {
        source: "claude-code",
        recordId: "claude-session",
        messages: [
          {
            id: "cc-1",
            role: "user",
            time: "09:12",
            text: "reviewed the design",
          },
        ],
      },
    ],
  });
  expect(request?.payload.manifest).toEqual([
    {
      source: "codex",
      recordId: "codex-session",
      messageIds: ["codex-session.jsonl:2"],
    },
    {
      source: "claude-code",
      recordId: "claude-session",
      messageIds: ["cc-1"],
    },
  ]);
  expect(request?.payload.coverage).toEqual([
    { source: "codex", state: "included" },
    { source: "claude-code", state: "included" },
  ]);
});

test("RG-2: the built payload covers only the sources in the saved permission", async () => {
  const app = await setup();
  expect((await app.permit(["codex"])).status).toBe(200);

  expect((await app.generate()).status).toBe(201);

  const payload = app.calls[0]?.payload;
  expect(payload?.payloadJson).not.toContain("claude-code");
  expect(payload?.payloadJson).not.toContain("reviewed the design");
  expect(payload?.manifest.map(({ recordId }) => recordId)).toEqual([
    "codex-session",
  ]);
  expect(payload?.date).toBe("2026-09-18");
});

test("RG-3: an over-broad collector cannot widen the built payload", async () => {
  // A collector that ignores the requested scope must not be able to widen what
  // the summarizer receives. The builder drops the unpermitted source, so the
  // report is codex-only rather than refused: that is what the scope means.
  const app = await setup({
    collector: {
      async collect(date) {
        return {
          date,
          timeZone: "UTC",
          sources: [
            {
              source: "claude-code",
              sessions: 1,
              issues: 0,
              state: "available",
            },
          ],
          sessions: [
            {
              id: "unpermitted",
              source: "claude-code",
              file: "/synthetic/unpermitted.jsonl",
              startedAt: "2026-09-18T09:00:00Z",
              endedAt: "2026-09-18T09:00:00Z",
              messageCount: 1,
              issueCount: 0,
              messages: [
                {
                  id: "m-1",
                  role: "user",
                  text: "outside the grant",
                  timestamp: "2026-09-18T09:00:00Z",
                  parts: [{ kind: "text", text: "outside the grant" }],
                },
              ],
            },
          ],
        };
      },
    },
  });
  expect((await app.permit(["codex"])).status).toBe(200);

  expect((await app.generate()).status).toBe(201);

  const payload = app.calls[0]?.payload;
  expect(payload?.manifest).toEqual([]);
  expect(payload?.payloadJson).not.toContain("outside the grant");
  expect(payload?.payloadJson).not.toContain("unpermitted");
});

test("RG-4: with no collector configured the route reports no server-side builder", async () => {
  const app = await setup({ withCollector: false });
  expect((await app.permit(["codex"])).status).toBe(200);

  const response = await app.generate();

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    report: {
      status: "incomplete",
      reason: "No server-side report-day conversation builder is available.",
    },
  });
  expect(app.calls).toEqual([]);
});

test("RG-5: a payload whose manifest carries an unpermitted source is refused", async () => {
  // The route keeps its own check for any injected builder, so a payload that
  // reaches it with an out-of-scope record never gets sent.
  const app = await setup({
    summaryRequestFactory: {
      async create() {
        return {
          scheduled: true,
          payload: {
            date: "2026-09-18",
            timeZone: "Australia/Sydney",
            payloadJson: '{"date":"2026-09-18","conversations":[]}',
            manifest: [
              {
                source: "claude-code",
                recordId: "unpermitted",
                messageIds: ["m-1"],
              },
            ],
            coverage: [],
            byteLength: 41,
          },
        };
      },
    },
  });
  expect((await app.permit(["codex"])).status).toBe(200);

  const response = await app.generate();

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { message: "Conversation source is outside the saved permission." },
  });
  expect(app.calls).toEqual([]);
});
