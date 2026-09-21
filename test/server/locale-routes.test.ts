import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";
import type { LanguagePackBuilder } from "../../src/summarizer/language-pack-run.js";
import type { Translations } from "../../web/i18n.js";
import { en } from "../../web/i18n.js";

// HTTP wiring for /api/locales/*; the build/validate/cache logic itself is
// covered directly against createLanguagePackBuilder in
// test/summarizer/language-pack-run.test.ts. Cases: L2-9, L2-10, L2-12,
// L2-14, L2-15, L3-16 (replaces L2-16).

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function fakeBuilder(overrides: Partial<LanguagePackBuilder> = {}) {
  const store = new Map<string, Translations>();
  const calls: string[] = [];
  const builder: LanguagePackBuilder = {
    async get(code) {
      return store.get(code);
    },
    async build(code) {
      calls.push(code);
      if (code === "xx-not-real") {
        return {
          kind: "refused",
          reason: "That language is not in the catalog.",
        };
      }
      if (code === "en") {
        return {
          kind: "refused",
          reason: "A built-in language is never generated.",
        };
      }
      if (code === "broken") {
        return { kind: "failed", reason: "Missing key: header.title" };
      }
      store.set(code, en);
      return { kind: "built", pack: en };
    },
    ...overrides,
  };
  return { builder, calls, store };
}

async function startTestApp(builder: LanguagePackBuilder) {
  const directory = "/tmp/does-not-matter-for-these-routes";
  const server = createApp({
    reportStore: createReportStore(directory),
    languagePackBuilder: builder,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.close();
    await once(server, "close");
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test("L2-9: GET for a code with no cached pack reports it absent", async () => {
  const { builder } = fakeBuilder();
  const baseUrl = await startTestApp(builder);

  const response = await fetch(`${baseUrl}/api/locales/ja`, {
    headers: { origin: baseUrl },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ pack: null });
});

test("L2-10: a successful build then serves the pack from GET", async () => {
  const { builder } = fakeBuilder();
  const baseUrl = await startTestApp(builder);

  const build = await fetch(`${baseUrl}/api/locales/ja/build`, {
    method: "POST",
    headers: { origin: baseUrl },
  });
  expect(build.status).toBe(200);
  expect((await build.json()).pack).toEqual(en);

  const get = await fetch(`${baseUrl}/api/locales/ja`, {
    headers: { origin: baseUrl },
  });
  expect((await get.json()).pack).toEqual(en);
});

test("L2-12: a rejected pack responds with the reason", async () => {
  const { builder } = fakeBuilder();
  const baseUrl = await startTestApp(builder);

  const response = await fetch(`${baseUrl}/api/locales/broken/build`, {
    method: "POST",
    headers: { origin: baseUrl },
  });

  expect(response.status).toBe(502);
  const body = await response.json();
  expect(body.error.message).toContain("header.title");
});

test("L2-14: a code outside the catalog is refused", async () => {
  const { builder } = fakeBuilder();
  const baseUrl = await startTestApp(builder);

  const response = await fetch(`${baseUrl}/api/locales/xx-not-real/build`, {
    method: "POST",
    headers: { origin: baseUrl },
  });

  expect(response.status).toBe(400);
});

test("L2-15: a built-in code is refused", async () => {
  const { builder } = fakeBuilder();
  const baseUrl = await startTestApp(builder);

  const response = await fetch(`${baseUrl}/api/locales/en/build`, {
    method: "POST",
    headers: { origin: baseUrl },
  });

  expect(response.status).toBe(400);
});

// Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md): replaces
// the old L2-16 "a right-to-left code is refused" case.
test("L3-16: a build request for a right-to-left code (ar) is no longer refused", async () => {
  const { builder, calls } = fakeBuilder();
  const baseUrl = await startTestApp(builder);

  const response = await fetch(`${baseUrl}/api/locales/ar/build`, {
    method: "POST",
    headers: { origin: baseUrl },
  });

  expect(response.status).toBe(200);
  expect((await response.json()).pack).toBeDefined();
  expect(calls).toEqual(["ar"]);
});

test("a request from another origin is refused before the builder is called", async () => {
  const { builder, calls } = fakeBuilder();
  const baseUrl = await startTestApp(builder);

  const response = await fetch(`${baseUrl}/api/locales/ja/build`, {
    method: "POST",
    headers: { origin: "http://evil.example" },
  });

  expect(response.status).toBe(403);
  expect(calls).toHaveLength(0);
});
