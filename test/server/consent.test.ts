import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";
import type {
  LocalCollector,
  LocalSource,
} from "../../src/collector/local-collector.js";

async function setup(t: test.TestContext, collector?: LocalCollector) {
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
          return { date, sources: [], sessions: [] };
        },
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
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
  t.after(() => rm(root, { recursive: true, force: true }));
  return { ...(await start()), root, consentPath, calls, start };
}

test("consent: direct summary and preview cannot read before explicit choice", async (t) => {
  const app = await setup(t);
  assert.equal((await app.get("/api/collector/today")).status, 403);
  assert.equal((await app.get("/api/collector/sessions/known")).status, 403);
  assert.deepEqual(await (await app.get("/api/collector/consent")).json(), {
    sources: [],
  });
  assert.deepEqual(app.calls, []);
});

for (const sources of [
  [],
  ["claude-code"],
  ["codex"],
  ["claude-code", "codex"],
]) {
  test(`consent: persists and enforces ${JSON.stringify(sources)} across restart`, async (t) => {
    const app = await setup(t);
    assert.equal((await app.save(sources)).status, 200);
    const restarted = await app.start();
    assert.deepEqual(
      await (await restarted.get("/api/collector/consent")).json(),
      { sources },
    );
    assert.deepEqual(app.calls, []);
    assert.equal(
      (await restarted.get("/api/collector/today")).status,
      sources.length ? 200 : 403,
    );
    assert.deepEqual(app.calls, sources.length ? [sources] : []);
    assert.deepEqual(JSON.parse(await readFile(app.consentPath, "utf8")), {
      version: 1,
      sources,
    });
  });
}

test("consent: invalid settings and save failures block collection until repaired", async (t) => {
  const app = await setup(t);
  await mkdir(app.consentPath, { recursive: true });
  assert.equal((await app.get("/api/collector/today")).status, 503);
  assert.equal((await app.save(["codex"])).status, 503);
  assert.equal((await app.get("/api/collector/today")).status, 503);
  await rm(app.consentPath, { recursive: true });
  await writeFile(app.consentPath, '{"version":1,"sources":["unknown"]}');
  assert.equal((await app.get("/api/collector/today")).status, 503);
  await writeFile(app.consentPath, "{bad");
  assert.equal((await app.get("/api/collector/consent")).status, 503);
  assert.deepEqual(app.calls, []);
  assert.equal((await app.save(["codex"])).status, 200);
  assert.equal((await app.get("/api/collector/today")).status, 200);
});

test("consent: malformed input and foreign origin/host cannot authorize reads", async (t) => {
  const app = await setup(t);
  for (const sources of [["unknown"], ["codex", "codex"], "codex", null]) {
    assert.equal((await app.save(sources)).status, 400);
  }
  for (const headers of [
    { origin: "https://unrelated.example", "content-type": "application/json" },
    { origin: app.url, "content-type": "text/plain" },
    {
      origin: app.url,
      host: "unrelated.example",
      "content-type": "application/json",
    },
  ]) {
    assert.equal(
      (
        await fetch(app.url + "/api/collector/consent", {
          method: "PUT",
          headers,
          body: '{"sources":["codex"]}',
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await fetch(app.url + "/api/collector/consent", {
        method: "PUT",
        headers: { origin: app.url, "content-type": "application/json" },
        body: "{bad",
      })
    ).status,
    400,
  );
  assert.equal((await app.get("/api/collector/today")).status, 403);
  assert.deepEqual(app.calls, []);
});

test("consent: withdrawal discards an in-flight response and blocks later preview", async (t) => {
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const app = await setup(t, {
    async collect(date) {
      started();
      await waiting;
      return { date, sources: [], sessions: [] };
    },
  });
  assert.equal((await app.save(["codex"])).status, 200);
  const pending = app.get("/api/collector/today");
  await reading;
  assert.equal((await app.save([])).status, 200);
  release();
  assert.equal((await pending).status, 403);
  assert.equal((await app.get("/api/collector/sessions/known")).status, 403);
});
