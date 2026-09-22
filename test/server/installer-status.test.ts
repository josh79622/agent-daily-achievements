import { once } from "node:events";
import { rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../../src/server/app.js";
import { createReportStore } from "../../src/storage/report-store.js";
import type {
  ProviderLoginService,
  ProviderLoginStatus,
} from "../../src/summarizer/provider-login.js";

const secret = "raw command output and SECRET_ENV_VALUE";
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

test("completed installation with no installed providers is successful but not connected", async () => {
  const root = await mkdtemp(join(tmpdir(), "installer-status-test-"));
  const service: ProviderLoginService = {
    async list() {
      return ["agy", "claude-code", "codex"].map(
        (provider) =>
          ({
            provider,
            label: provider,
            state: "not-installed",
            installUrl: "https://example.test/install",
            stdout: secret,
            environment: secret,
            reason: secret,
          }) as ProviderLoginStatus,
      );
    },
    async status() {
      throw new Error("status must not be called");
    },
    async startLogin() {
      throw new Error("login must not start");
    },
    async checkReadiness() {
      throw new Error("readiness must not run");
    },
  };
  const server = createApp({
    reportStore: createReportStore(join(root, "reports")),
    providerLoginService: service,
    installationComplete: true,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
    () => rm(root, { recursive: true, force: true }),
  );

  const response = await send(port, "GET", "/api/installer/status");

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({
    installation: { status: "complete" },
    providerConnection: { state: "not-connected" },
  });
  expect(response.body).not.toContain("SECRET");
  expect(response.body).not.toContain("raw command output");
});

function send(port: number, method: string, path: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method, path },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
