import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../../src/server/app.js";
import { readSummarizerModels } from "../../src/storage/summarizer-models.js";
import { createReportStore } from "../../src/storage/report-store.js";
import type { ModelCatalog } from "../../src/summarizer/model-catalog.js";
import {
  createSummarizerModelsService,
  type SummarizerModelsService,
} from "../../src/summarizer/model-settings.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

// Fictional model lists.
const catalog: ModelCatalog = {
  codex: {
    source: "fetched",
    defaultEffortLevels: [],
    options: [
      { value: "gpt-fiction-terra", label: "Terra", effortLevels: ["low"] },
      { value: "gpt-fiction-luna", label: "Luna", effortLevels: [] },
    ],
  },
  "claude-code": {
    source: "built-in",
    defaultEffortLevels: [],
    options: [{ value: "fiction-opus", label: "Opus", effortLevels: ["max"] }],
  },
};

async function setup(withService = true) {
  const root = await mkdtemp(join(tmpdir(), "summarizer-models-server-"));
  const settingsPath = join(root, "summarizer-models.json");
  const summarizerModels: SummarizerModelsService | undefined = withService
    ? createSummarizerModelsService({
        catalog: async () => catalog,
        settingsPath,
      })
    : undefined;
  const server = createApp({
    reportStore: createReportStore(join(root, "reports")),
    summarizerModels,
  } as Parameters<typeof createApp>[0]);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
    () => rm(root, { recursive: true, force: true }),
  );
  const send = (
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string,
  ) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method,
          path,
          headers: { host: `127.0.0.1:${port}`, ...headers },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (text += chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: text }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  const put = (provider: string, body: unknown, headers = {}) =>
    send(
      "PUT",
      `/api/summarizer/models/${provider}`,
      { origin, "content-type": "application/json", ...headers },
      typeof body === "string" ? body : JSON.stringify(body),
    );
  return { origin, send, put, settingsPath };
}

test("SE-1: GET returns per-provider options, source, selection, effective model, and warnings only", async () => {
  const app = await setup();

  const response = await app.send("GET", "/api/summarizer/models");

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({
    providers: [
      {
        provider: "codex",
        source: "fetched",
        options: [
          { value: "gpt-fiction-terra", label: "Terra" },
          { value: "gpt-fiction-luna", label: "Luna" },
        ],
        selected: "default",
        effective: null,
        warnings: [],
      },
      {
        provider: "claude-code",
        source: "built-in",
        options: [{ value: "fiction-opus", label: "Opus" }],
        selected: "default",
        effective: null,
        warnings: ["model-list-unavailable"],
      },
    ],
  });
  expect(response.body).not.toContain("effortLevels");
});

test("SE-1: GET rejects non-local or cross-site requests and reports an absent service", async () => {
  const app = await setup();
  const statuses = await Promise.all([
    app.send("GET", "/api/summarizer/models", { origin: "http://evil.test" }),
    app.send("GET", "/api/summarizer/models", { host: "evil.test" }),
    app.send("GET", "/api/summarizer/models", {
      "sec-fetch-site": "cross-site",
    }),
    app.send("POST", "/api/summarizer/models", { origin: app.origin }),
  ]);
  expect(statuses.map((response) => response.status)).toEqual([
    403, 403, 403, 405,
  ]);

  const absent = await setup(false);
  expect((await absent.send("GET", "/api/summarizer/models")).status).toBe(503);
});

test("SE-2: PUT saves a listed model or default for that provider only", async () => {
  const app = await setup();

  const saved = await app.put("codex", { model: "gpt-fiction-luna" });
  expect(saved.status).toBe(200);
  expect(JSON.parse(saved.body)).toEqual({
    provider: {
      provider: "codex",
      source: "fetched",
      options: [
        { value: "gpt-fiction-terra", label: "Terra" },
        { value: "gpt-fiction-luna", label: "Luna" },
      ],
      selected: "gpt-fiction-luna",
      effective: "gpt-fiction-luna",
      warnings: [],
    },
  });
  expect(await readSummarizerModels(app.settingsPath)).toEqual({
    models: { codex: "gpt-fiction-luna" },
    unreadable: false,
  });

  expect((await app.put("claude-code", { model: "fiction-opus" })).status).toBe(
    200,
  );
  expect((await app.put("codex", { model: "default" })).status).toBe(200);
  expect(await readSummarizerModels(app.settingsPath)).toEqual({
    models: { "claude-code": "fiction-opus" },
    unreadable: false,
  });
});

test("SE-2: invalid, cross-provider, malformed, non-local, or unknown requests are rejected and not saved", async () => {
  const app = await setup();
  const attempts = [
    app.put("codex", { model: "fiction-opus" }),
    app.put("codex", { model: "gpt-fiction-retired" }),
    app.put("codex", { model: "--dangerously-bypass-approvals-and-sandbox" }),
    app.put("codex", { model: 7 }),
    app.put("codex", { model: "gpt-fiction-luna", effort: "max" }),
    app.put("codex", {}),
    app.put("codex", "not json"),
    app.put(
      "codex",
      { model: "gpt-fiction-luna" },
      { "content-type": "text/plain" },
    ),
    app.put(
      "codex",
      { model: "gpt-fiction-luna" },
      { origin: "http://evil.test" },
    ),
    app.send(
      "PUT",
      "/api/summarizer/models/codex",
      { "content-type": "application/json" },
      JSON.stringify({ model: "gpt-fiction-luna" }),
    ),
    app.put(
      "codex",
      { model: "gpt-fiction-luna" },
      { "sec-fetch-site": "cross-site" },
    ),
    app.put("bash", { model: "gpt-fiction-luna" }),
    app.send("GET", "/api/summarizer/models/codex", { origin: app.origin }),
    app.send("POST", "/api/summarizer/models/codex", { origin: app.origin }),
  ];
  const statuses = (await Promise.all(attempts)).map(
    (response) => response.status,
  );

  expect(statuses).toEqual([
    400, 400, 400, 400, 400, 400, 400, 403, 403, 403, 403, 404, 405, 405,
  ]);
  expect(await readSummarizerModels(app.settingsPath)).toEqual({
    models: {},
    unreadable: false,
  });
});
