import { request } from "node:http";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";
import type {
  LocalCollector,
  LocalSource,
} from "../../src/collector/local-collector.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function setup(collector?: LocalCollector) {
  const root = await mkdtemp(join(tmpdir(), "consent-test-"));
  const consentPath = join(root, "settings", "local-sources.json");
  const calls: LocalSource[][] = [];
  const start = async () => {
    const server = createApp({
      reportStore: createReportStore(join(root, "reports")),
      consentPath,
      collector: collector ?? {
        async collect(date, sources = []) {
          calls.push([...sources]);
          return { date, timeZone: "UTC", sources: [], sessions: [] };
        },
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    cleanups.push(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
      server,
      url,
      get: (path: string) => fetch(url + path),
      save: (sources: unknown) =>
        fetch(url + "/api/collector/consent", {
          method: "PUT",
          headers: { origin: url, "content-type": "application/json" },
          body: JSON.stringify({ sources }),
        }),
    };
  };
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return { ...(await start()), root, consentPath, calls, start };
}

test("consent: direct summary and preview cannot read before explicit choice", async () => {
  const app = await setup();
  expect((await app.get("/api/collector/today")).status).toBe(403);
  expect((await app.get("/api/collector/sessions/known")).status).toBe(403);
  expect(await (await app.get("/api/collector/consent")).json()).toEqual({
    sources: [],
  });
  expect(app.calls).toEqual([]);
});

test("consent: known sessions from an unselected source cannot be previewed", async () => {
  const app = await setup({
    async collect(date) {
      return {
        date,
        timeZone: "UTC",
        sources: [
          { source: "codex", sessions: 1, issues: 0, state: "available" },
        ],
        sessions: [
          {
            id: "known-codex-session",
            source: "codex",
            file: "/synthetic/codex.jsonl",
            startedAt: "2026-09-16T00:00:00Z",
            endedAt: "2026-09-16T00:00:00Z",
            messageCount: 1,
            issueCount: 0,
            messages: [
              {
                id: "synthetic-message",
                role: "user",
                text: "Synthetic private content",
                timestamp: "2026-09-16T00:00:00Z",
                parts: [{ kind: "text", text: "Synthetic private content" }],
              },
            ],
          },
        ],
      };
    },
  });
  expect((await app.save(["claude-code"])).status).toBe(200);

  const response = await app.get(
    "/api/collector/sessions/known-codex-session?source=codex",
  );

  expect(response.status).toBe(404);
  expect(await response.text()).not.toMatch(/Synthetic private content/);
});

for (const sources of [
  [],
  ["claude-code"],
  ["codex"],
  ["claude-code", "codex"],
]) {
  test(`consent: persists and enforces ${JSON.stringify(sources)} across restart`, async () => {
    const app = await setup();
    expect((await app.save(sources)).status).toBe(200);
    const restarted = await app.start();
    expect(
      await (await restarted.get("/api/collector/consent")).json(),
    ).toEqual({ sources });
    expect(app.calls).toEqual([]);
    expect((await restarted.get("/api/collector/today")).status).toBe(
      sources.length ? 200 : 403,
    );
    expect(app.calls).toEqual(sources.length ? [sources] : []);
    expect(JSON.parse(await readFile(app.consentPath, "utf8"))).toEqual({
      version: 1,
      sources,
    });
  });
}

test("consent: persisted malformed or unsupported settings block collection", async () => {
  const app = await setup();
  await mkdir(join(app.consentPath, ".."), { recursive: true });
  await writeFile(app.consentPath, "{bad");
  expect((await app.get("/api/collector/today")).status).toBe(503);
  await writeFile(app.consentPath, '{"version":1,"sources":["unknown"]}');
  expect((await app.get("/api/collector/consent")).status).toBe(503);
  expect(app.calls).toEqual([]);
});

test("consent: a save failure blocks collection until a later explicit save succeeds", async () => {
  const app = await setup();
  await mkdir(app.consentPath, { recursive: true });
  expect((await app.get("/api/collector/today")).status).toBe(503);
  expect((await app.save(["codex"])).status).toBe(503);
  expect((await app.get("/api/collector/today")).status).toBe(503);
  await rm(app.consentPath, { recursive: true });
  expect(app.calls).toEqual([]);
  expect((await app.save(["codex"])).status).toBe(200);
  expect((await app.get("/api/collector/today")).status).toBe(200);
});

test("consent: malformed input and foreign origin/host cannot authorize reads", async () => {
  const app = await setup();
  for (const sources of [["unknown"], ["codex", "codex"], "codex", null]) {
    expect((await app.save(sources)).status).toBe(400);
  }
  for (const headers of [
    { origin: "https://unrelated.example", "content-type": "application/json" },
    { origin: app.url, "content-type": "text/plain" },
  ]) {
    expect(
      (
        await fetch(app.url + "/api/collector/consent", {
          method: "PUT",
          headers,
          body: '{"sources":["codex"]}',
        })
      ).status,
    ).toBe(403);
  }
  const foreignHostStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      const req = request(
        app.url + "/api/collector/consent",
        {
          method: "PUT",
          headers: {
            host: "unrelated.example",
            origin: app.url,
            "content-type": "application/json",
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      req.on("error", reject);
      req.end('{"sources":["codex"]}');
    },
  );
  expect(foreignHostStatus).toBe(403);
  expect(
    (
      await fetch(app.url + "/api/collector/consent", {
        method: "PUT",
        headers: { origin: app.url, "content-type": "application/json" },
        body: "{bad",
      })
    ).status,
  ).toBe(400);
  expect((await app.get("/api/collector/today")).status).toBe(403);
  expect(app.calls).toEqual([]);
});

test("consent: source scope stays locked until an in-flight collection finishes", async () => {
  let release!: () => void;
  let started!: () => void;
  const calls: LocalSource[][] = [];
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const app = await setup({
    async collect(date, sources = []) {
      calls.push([...sources]);
      started();
      await waiting;
      return { date, timeZone: "UTC", sources: [], sessions: [] };
    },
  });
  expect((await app.save(["codex"])).status).toBe(200);
  const pending = app.get("/api/collector/today");
  await reading;
  const scopeChange = await app.save(["claude-code"]);
  release();
  expect(scopeChange.status).toBe(409);
  expect((await pending).status).toBe(200);
  expect(calls).toEqual([["codex"]]);
  expect((await app.save(["claude-code"])).status).toBe(200);
  expect((await app.get("/api/collector/today")).status).toBe(200);
  expect(calls).toEqual([["codex"], ["claude-code"]]);
});

test("consent: a source change begun before collection is rejected if its body finishes during collection", async () => {
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const app = await setup({
    async collect(date) {
      started();
      await waiting;
      return { date, timeZone: "UTC", sources: [], sessions: [] };
    },
  });
  expect((await app.save(["codex"])).status).toBe(200);

  const parsingRequest = once(app.server, "request");
  let finishChange!: () => void;
  const changeStatus = new Promise<number | undefined>((resolve, reject) => {
    const change = request(
      app.url + "/api/collector/consent",
      {
        method: "PUT",
        headers: {
          origin: app.url,
          "content-type": "application/json",
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    change.on("error", reject);
    change.write('{"sources":["claude-code"');
    finishChange = () => change.end("]}");
  });
  await parsingRequest;

  const pendingStatus = new Promise<number | undefined>((resolve, reject) => {
    const collection = request(
      app.url + "/api/collector/today",
      { agent: false },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    collection.on("error", reject);
    collection.end();
  });
  await reading;
  finishChange();
  const status = await changeStatus;
  release();
  expect(await pendingStatus).toBe(200);
  expect(status).toBe(409);
});
