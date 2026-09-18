import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";
import type {
  ProviderLoginService,
  ProviderLoginStatus,
} from "../../src/summarizer/provider-login.js";
import type { SummaryProvider } from "../../src/storage/summary-permission.js";

const secret = "sk-SECRET-token raw terminal output";
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function fakeService() {
  const logins: SummaryProvider[] = [];
  const checks: SummaryProvider[] = [];
  const statusFor = (
    provider: SummaryProvider,
    state: ProviderLoginStatus["state"],
  ) =>
    ({
      provider,
      label: provider === "codex" ? "Codex" : "Claude Code",
      state,
      installUrl: "https://example.test/install",
      // Fields a leaky service might add; the server must drop them.
      stdout: secret,
      token: secret,
    }) as ProviderLoginStatus;
  const service: ProviderLoginService = {
    async list() {
      return [
        statusFor("codex", "sign-in-required"),
        statusFor("claude-code", "not-installed"),
      ];
    },
    async status(provider) {
      return statusFor(provider, "sign-in-required");
    },
    async startLogin(provider) {
      logins.push(provider);
      return statusFor(provider, "login-in-progress");
    },
    async checkReadiness(provider) {
      checks.push(provider);
      return {
        ...statusFor(provider, "probe-failed"),
        signedIn: true,
        reason: "The readiness check did not pass.",
        checkedAt: "2026-09-18T04:32:00.000Z",
        probeFailures: [
          { attempt: "lowest-cost-model", reason: "timed-out", detail: secret },
          { attempt: "summary-model", reason: "empty-reply" },
        ],
      } as ProviderLoginStatus;
    },
  };
  return { service, logins, checks };
}

async function setup(providerLoginService?: ProviderLoginService) {
  const root = await mkdtemp(join(tmpdir(), "provider-login-test-"));
  const touched: string[] = [];
  const server = createApp({
    reportStore: createReportStore(join(root, "reports")),
    providerLoginService,
    collector: {
      async collect() {
        touched.push("collector");
        throw new Error("collector must not run");
      },
    },
    summaryRunner: {
      async run() {
        touched.push("runner");
      },
    },
    summaryRequestFactory: {
      async create() {
        touched.push("request-factory");
        return {
          scheduled: false,
          payload: {
            date: "2026-09-18",
            timeZone: "Australia/Sydney",
            payloadJson: '{"date":"2026-09-18","conversations":[]}',
            manifest: [],
            coverage: [],
            byteLength: 41,
          },
        };
      },
    },
  } as Parameters<typeof createApp>[0]);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
    () => rm(root, { recursive: true, force: true }),
  );
  return {
    origin,
    touched,
    send: (
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
      }),
  };
}

test("providers: GET lists both providers with only safe status fields", async () => {
  const { service } = fakeService();
  const app = await setup(service);

  const response = await app.send("GET", "/api/summarizer/providers");

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({
    providers: [
      {
        provider: "codex",
        label: "Codex",
        state: "sign-in-required",
        installUrl: "https://example.test/install",
      },
      {
        provider: "claude-code",
        label: "Claude Code",
        state: "not-installed",
        installUrl: "https://example.test/install",
      },
    ],
  });
  expect(response.body).not.toContain("SECRET");
});

for (const provider of ["codex", "claude-code"] as const) {
  test(`providers: POST ${provider} login starts only that provider`, async () => {
    const { service, logins } = fakeService();
    const app = await setup(service);

    const response = await app.send(
      "POST",
      `/api/summarizer/providers/${provider}/login`,
      { origin: app.origin },
    );

    expect(response.status).toBe(202);
    expect(JSON.parse(response.body)).toMatchObject({
      provider: { provider, state: "login-in-progress" },
    });
    expect(response.body).not.toContain("SECRET");
    expect(logins).toEqual([provider]);
  });
}

test("providers: unknown IDs, bodies, foreign hosts, and cross-site requests cannot start login", async () => {
  const { service, logins } = fakeService();
  const app = await setup(service);
  const login = "/api/summarizer/providers/codex/login";

  const attempts = [
    app.send("POST", "/api/summarizer/providers/bash/login", {
      origin: app.origin,
    }),
    app.send("POST", "/api/summarizer/providers/__proto__/login", {
      origin: app.origin,
    }),
    app.send(
      "POST",
      login,
      { origin: app.origin, "content-type": "application/json" },
      JSON.stringify({ executable: "/bin/sh", args: ["-c", "id"] }),
    ),
    app.send("POST", login, {}),
    app.send("POST", login, { origin: "http://evil.test" }),
    app.send("POST", login, { origin: app.origin, host: "evil.test" }),
    app.send("POST", login, {
      origin: app.origin,
      "sec-fetch-site": "cross-site",
    }),
    app.send("GET", login, { origin: app.origin }),
  ];
  const statuses = (await Promise.all(attempts)).map((r) => r.status);

  expect(statuses).toEqual([404, 404, 400, 403, 403, 403, 403, 405]);
  expect(logins).toEqual([]);
  expect(
    (
      await app.send("GET", "/api/summarizer/providers", {
        origin: "http://evil.test",
      })
    ).status,
  ).toBe(403);
});

test("providers: absent service returns a safe 503", async () => {
  const app = await setup(undefined);

  const list = await app.send("GET", "/api/summarizer/providers");
  const login = await app.send(
    "POST",
    "/api/summarizer/providers/codex/login",
    { origin: app.origin },
  );

  expect(list.status).toBe(503);
  expect(login.status).toBe(503);
  expect(JSON.parse(list.body)).toEqual({
    error: {
      code: "provider_login_unavailable",
      message: "Provider sign-in is unavailable on this machine.",
    },
  });
});

test("providers: routes never collect sessions or invoke summarization", async () => {
  const { service } = fakeService();
  const app = await setup(service);

  await app.send("GET", "/api/summarizer/providers");
  await app.send("POST", "/api/summarizer/providers/codex/login", {
    origin: app.origin,
  });
  await app.send("POST", "/api/summarizer/providers/claude-code/login", {
    origin: app.origin,
  });

  expect(app.touched).toEqual([]);
});

test("PR-16: POST readiness runs only that provider's check and returns only safe fields", async () => {
  for (const provider of ["codex", "claude-code"] as const) {
    const { service, checks, logins } = fakeService();
    const app = await setup(service);

    const response = await app.send(
      "POST",
      `/api/summarizer/providers/${provider}/readiness`,
      { origin: app.origin },
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      provider: {
        provider,
        label: provider === "codex" ? "Codex" : "Claude Code",
        state: "probe-failed",
        installUrl: "https://example.test/install",
        signedIn: true,
        reason: "The readiness check did not pass.",
        checkedAt: "2026-09-18T04:32:00.000Z",
        probeFailures: [
          { attempt: "lowest-cost-model", reason: "timed-out" },
          { attempt: "summary-model", reason: "empty-reply" },
        ],
      },
    });
    expect(response.body).not.toContain("SECRET");
    expect(checks).toEqual([provider]);
    expect(logins).toEqual([]);
    expect(app.touched).toEqual([]);
  }
});

test("PR-16: readiness rejects unknown providers, bodies, non-local or cross-site requests, and other methods", async () => {
  const { service, checks } = fakeService();
  const app = await setup(service);
  const readiness = "/api/summarizer/providers/codex/readiness";

  const statuses = (
    await Promise.all([
      app.send("POST", "/api/summarizer/providers/bash/readiness", {
        origin: app.origin,
      }),
      app.send(
        "POST",
        readiness,
        { origin: app.origin, "content-type": "application/json" },
        JSON.stringify({ model: "--dangerously-bypass-approvals-and-sandbox" }),
      ),
      app.send("POST", readiness, {}),
      app.send("POST", readiness, { origin: "http://evil.test" }),
      app.send("POST", readiness, { origin: app.origin, host: "evil.test" }),
      app.send("POST", readiness, {
        origin: app.origin,
        "sec-fetch-site": "cross-site",
      }),
      app.send("GET", readiness, { origin: app.origin }),
      app.send("POST", "/api/summarizer/providers/codex/other", {
        origin: app.origin,
      }),
    ])
  ).map((response) => response.status);

  expect(statuses).toEqual([404, 400, 403, 403, 403, 403, 405, 404]);
  expect(checks).toEqual([]);

  const unavailable = await setup(undefined);
  expect(
    (
      await unavailable.send("POST", readiness, {
        origin: unavailable.origin,
      })
    ).status,
  ).toBe(503);
});

test("PR-18: the status endpoint returns readyVia only as a known attempt code", async () => {
  const ready = (readyVia: unknown) =>
    ({
      provider: "codex",
      label: "Codex",
      state: "ready",
      installUrl: "https://example.test/install",
      signedIn: true,
      checkedAt: "2026-09-18T04:32:00.000Z",
      readyVia,
    }) as ProviderLoginStatus;
  for (const [readyVia, expected] of [
    ["summary-model", "summary-model"],
    ["lowest-cost-model", "lowest-cost-model"],
    ["sk-SECRET-token", undefined],
  ] as const) {
    const { service } = fakeService();
    service.checkReadiness = async () => ready(readyVia);
    const app = await setup(service);
    const response = await app.send(
      "POST",
      "/api/summarizer/providers/codex/readiness",
      { origin: app.origin },
    );
    const body = JSON.parse(response.body) as {
      provider: Record<string, unknown>;
    };
    expect(body.provider.readyVia).toBe(expected);
    expect(response.body).not.toContain("SECRET");
  }
});
