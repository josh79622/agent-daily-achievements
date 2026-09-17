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
      return statusFor(provider, "sign-in-required");
    },
  };
  return { service, logins };
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
        return { conversations: [], scheduled: false };
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
