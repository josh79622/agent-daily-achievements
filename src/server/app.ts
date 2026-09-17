import { readFile } from "node:fs/promises";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";

import type { LocalCollector } from "../collector/local-collector.js";
import { generateSampleReport } from "../domain/generate-sample-report.js";
import { sampleRecords } from "../domain/sample-records.js";
import type { ReportStore } from "../storage/report-store.js";

import {
  readConsent,
  writeConsent,
  validSources,
} from "../storage/local-consent.js";
import {
  readSummaryPermission,
  validSummaryPermissionInput,
  writeSummaryPermission,
  type SummaryProvider,
} from "../storage/summary-permission.js";
import type { SummarizerModelsService } from "../summarizer/model-settings.js";
import {
  isSummaryProvider,
  type ProviderLoginService,
  type ProviderLoginStatus,
} from "../summarizer/provider-login.js";

export interface SummaryRequest {
  conversations: Array<{ id: string; source: SummaryProvider; text: string }>;
  scheduled: boolean;
}

export interface SummaryRunner {
  run(provider: SummaryProvider, request: SummaryRequest): Promise<void>;
}

export interface SummaryRequestFactory {
  create(input: {
    scheduled: boolean;
    sourceScope: SummaryProvider[];
  }): Promise<SummaryRequest>;
}

interface AppOptions {
  consentPath?: string;
  reportStore: ReportStore;
  collector?: LocalCollector;
  collectorDate?: () => string;
  reportDate?: () => string;
  staticDirectory?: string;
  summaryPermissionPath?: string;
  summaryRunner?: SummaryRunner;
  summaryRequestFactory?: SummaryRequestFactory;
  availableSummaryProviders?: SummaryProvider[];
  providerLoginService?: ProviderLoginService;
  summarizerModels?: SummarizerModelsService;
}

export function createApp({
  reportStore,
  consentPath,
  collector,
  collectorDate = currentLocalDate,
  reportDate = currentLocalDate,
  staticDirectory,
  summaryPermissionPath,
  summaryRunner,
  summaryRequestFactory,
  availableSummaryProviders = [],
  providerLoginService,
  summarizerModels,
}: AppOptions): Server {
  let generation = 0;
  let activeCollections = 0;
  let saving = 0;
  let saveFailed = false;
  let writes = Promise.resolve();
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

      if (pathname.startsWith("/api/collector/")) {
        const origin = localOrigin(request);
        if (
          !origin ||
          (request.headers.origin && request.headers.origin !== origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          sendJson(response, 403, {
            error: {
              message: "Use the local app to access collection settings.",
            },
          });
          return;
        }
        if (pathname === "/api/collector/consent") {
          if (request.method === "PUT") {
            if (
              request.headers.origin !== origin ||
              request.headers["content-type"]?.split(";")[0] !==
                "application/json"
            ) {
              sendJson(response, 403, {
                error: { message: "Save settings from the local app." },
              });
              return;
            }
            if (activeCollections > 0) {
              sendJson(response, 409, {
                error: {
                  code: "collection_in_progress",
                  message:
                    "Local collection is in progress. Change sources after it finishes.",
                },
              });
              return;
            }
            let sources: import("../collector/local-collector.js").LocalSource[];
            try {
              let body = "";
              for await (const chunk of request) {
                body += String(chunk);
                if (body.length > 1024) throw new Error("Too large");
              }
              const value = JSON.parse(body) as { sources?: unknown };
              if (
                !value ||
                !validSources(value.sources) ||
                Object.keys(value).length !== 1
              )
                throw new Error("Invalid sources");
              sources = value.sources;
            } catch {
              sendJson(response, 400, {
                error: { message: "Choose valid local sources." },
              });
              return;
            }
            if (activeCollections > 0) {
              sendJson(response, 409, {
                error: {
                  code: "collection_in_progress",
                  message:
                    "Local collection is in progress. Change sources after it finishes.",
                },
              });
              return;
            }
            generation += 1;
            saving += 1;
            const write = writes.then(() => writeConsent(consentPath, sources));
            writes = write.catch(() => {});
            try {
              await write;
              saveFailed = false;
            } catch {
              saveFailed = true;
            } finally {
              saving -= 1;
              generation += 1;
            }
            if (saveFailed) {
              settingsError(response);
              return;
            }
            sendJson(response, 200, { sources });
            return;
          }
          if (request.method !== "GET") {
            sendJson(response, 405, {
              error: { message: "Method not allowed." },
            });
            return;
          }
        }
        let sources: import("../collector/local-collector.js").LocalSource[];
        const revision = generation;
        try {
          if (saving || saveFailed) throw new Error("Settings unavailable");
          sources = await readConsent(consentPath);
          if (revision !== generation || saving)
            throw new Error("Settings changed");
        } catch {
          settingsError(response);
          return;
        }
        if (pathname === "/api/collector/consent") {
          sendJson(response, 200, { sources });
          return;
        }
        const previewMatch = pathname.match(
          /^\/api\/collector\/sessions\/([^/]+)$/,
        );
        if (
          (pathname === "/api/collector/today" || previewMatch) &&
          request.method === "GET"
        ) {
          if (!sources.length) {
            consentRequired(response);
            return;
          }
          if (!collector) {
            sendJson(response, 503, {
              error: { message: "Local collector is unavailable." },
            });
            return;
          }
          activeCollections += 1;
          let result;
          try {
            result = await collector.collect(collectorDate(), sources);
          } finally {
            activeCollections -= 1;
          }
          const sessions = result.sessions.filter((session) =>
            sources.includes(session.source),
          );
          if (previewMatch) {
            const sessionId = decodeURIComponent(previewMatch[1] ?? "");
            const session = sessions.find(
              (session) =>
                session.id === sessionId &&
                (!new URL(request.url ?? "/", origin).searchParams.has(
                  "source",
                ) ||
                  session.source ===
                    new URL(request.url ?? "/", origin).searchParams.get(
                      "source",
                    )),
            );
            if (!session) {
              sendJson(response, 404, {
                error: {
                  message: "Local session not found in authorized sources.",
                },
              });
              return;
            }
            sendJson(response, 200, { session });
            return;
          }
          sendJson(response, 200, {
            date: result.date,
            sources: result.sources.filter((source) =>
              sources.includes(source.source),
            ),
            sessions: sessions.map((session) => ({
              id: session.id,
              source: session.source,
              file: session.file,
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              messageCount: session.messageCount,
              issueCount: session.issueCount,
            })),
          });
          return;
        }
      }

      if (
        pathname === "/api/summarizer/models" ||
        pathname.startsWith("/api/summarizer/models/")
      ) {
        const origin = localOrigin(request);
        if (
          !origin ||
          (request.headers.origin && request.headers.origin !== origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          sendJson(response, 403, {
            error: { message: "Use the local app to manage summary models." },
          });
          return;
        }
        if (pathname === "/api/summarizer/models") {
          if (request.method !== "GET") {
            sendJson(response, 405, {
              error: { message: "Method not allowed." },
            });
            return;
          }
          if (!summarizerModels) {
            summaryModelsUnavailable(response);
            return;
          }
          sendJson(response, 200, { providers: await summarizerModels.view() });
          return;
        }
        const provider = pathname.match(
          /^\/api\/summarizer\/models\/([^/]+)$/,
        )?.[1];
        if (!isSummaryProvider(provider)) {
          sendJson(response, 404, {
            error: { code: "not_found", message: "Unknown provider." },
          });
          return;
        }
        if (request.method !== "PUT") {
          sendJson(response, 405, {
            error: { message: "Method not allowed." },
          });
          return;
        }
        if (
          request.headers.origin !== origin ||
          request.headers["content-type"]?.split(";")[0] !== "application/json"
        ) {
          sendJson(response, 403, {
            error: { message: "Save summary models from the local app." },
          });
          return;
        }
        if (!summarizerModels) {
          summaryModelsUnavailable(response);
          return;
        }
        let change: { model: string } | { effort: string } | undefined;
        try {
          const body = await parseJsonBody(request);
          if (
            body &&
            typeof body === "object" &&
            !Array.isArray(body) &&
            Object.keys(body).length === 1
          ) {
            const { model, effort } = body as {
              model?: unknown;
              effort?: unknown;
            };
            if (typeof model === "string") change = { model };
            else if (typeof effort === "string") change = { effort };
          }
        } catch {
          change = undefined;
        }
        // Only `default` or a value in this provider's current list is saved.
        const view = !change
          ? undefined
          : "model" in change
            ? await summarizerModels.save(provider, change.model)
            : await summarizerModels.saveEffort(provider, change.effort);
        if (!view) {
          sendJson(response, 400, {
            error: { message: "Choose a model or effort from the list." },
          });
          return;
        }
        sendJson(response, 200, { provider: view });
        return;
      }

      if (
        pathname === "/api/summarizer/providers" ||
        pathname.startsWith("/api/summarizer/providers/")
      ) {
        const origin = localOrigin(request);
        if (
          !origin ||
          (request.headers.origin && request.headers.origin !== origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          sendJson(response, 403, {
            error: { message: "Use the local app to manage sign-in." },
          });
          return;
        }
        if (pathname === "/api/summarizer/providers") {
          if (request.method !== "GET") {
            sendJson(response, 405, {
              error: { message: "Method not allowed." },
            });
            return;
          }
          if (!providerLoginService) {
            providerLoginUnavailable(response);
            return;
          }
          const providers = await providerLoginService.list();
          sendJson(response, 200, { providers: providers.map(safeStatus) });
          return;
        }
        const actionMatch = pathname.match(
          /^\/api\/summarizer\/providers\/([^/]+)\/(login|readiness)$/,
        );
        const provider = actionMatch?.[1];
        const action = actionMatch?.[2];
        if (!isSummaryProvider(provider)) {
          sendJson(response, 404, {
            error: { code: "not_found", message: "Unknown provider." },
          });
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, {
            error: { message: "Method not allowed." },
          });
          return;
        }
        if (request.headers.origin !== origin) {
          sendJson(response, 403, {
            error: { message: "Start sign-in from the local app." },
          });
          return;
        }
        if (
          request.headers["transfer-encoding"] ||
          Number(request.headers["content-length"] ?? 0) !== 0
        ) {
          sendJson(response, 400, {
            error: { message: "Sign-in requests take no body." },
          });
          return;
        }
        if (!providerLoginService) {
          providerLoginUnavailable(response);
          return;
        }
        if (action === "readiness") {
          // Decision C1: runs only on this explicit request.
          const status = await providerLoginService.checkReadiness(provider);
          sendJson(response, 200, { provider: safeStatus(status) });
          return;
        }
        const status = await providerLoginService.startLogin(provider);
        sendJson(response, 202, { provider: safeStatus(status) });
        return;
      }

      if (
        pathname === "/api/summarizer/permission" ||
        pathname === "/api/reports/generate"
      ) {
        const origin = localOrigin(request);
        if (
          !origin ||
          (request.headers.origin && request.headers.origin !== origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          sendJson(response, 403, {
            error: { message: "Use the local app to manage summarization." },
          });
          return;
        }
        if (pathname === "/api/summarizer/permission") {
          if (request.method === "GET") {
            const permission = await readSummaryPermission(
              summaryPermissionPath,
            );
            sendJson(response, 200, {
              permission: permission ?? null,
              disclosure: summaryDisclosure(),
            });
            return;
          }
          if (
            request.method !== "PUT" ||
            request.headers.origin !== origin ||
            request.headers["content-type"]?.split(";")[0] !==
              "application/json"
          ) {
            sendJson(response, 403, {
              error: { message: "Save settings from the local app." },
            });
            return;
          }
          const permissionInput = await parseJsonBody(request);
          if (!validSummaryPermissionInput(permissionInput)) {
            sendJson(response, 400, {
              error: { message: "Choose a valid summary permission." },
            });
            return;
          }
          const permission = {
            ...permissionInput,
            recipients: ["codex", "claude-code"] as const,
          };
          await writeSummaryPermission(summaryPermissionPath, permission);
          sendJson(response, 200, {
            permission,
            disclosure: summaryDisclosure(),
          });
          return;
        }
        if (
          request.method !== "POST" ||
          request.headers.origin !== origin ||
          request.headers["content-type"]?.split(";")[0] !== "application/json"
        ) {
          sendJson(response, 403, {
            error: { message: "Generate reports from the local app." },
          });
          return;
        }
        const permission = await readSummaryPermission(summaryPermissionPath);
        if (!permission?.sourceScope.length) {
          sendJson(response, 403, {
            error: { message: "Save external summarization permission first." },
          });
          return;
        }
        const generationRequest = await parseGenerationRequest(request);
        if (!generationRequest) {
          sendJson(response, 400, {
            error: { message: "Provide valid report-day conversations." },
          });
          return;
        }
        if (!summaryRequestFactory) {
          sendJson(response, 503, {
            report: {
              status: "incomplete",
              reason:
                "No server-side report-day conversation builder is available.",
            },
          });
          return;
        }
        const summaryRequest = await summaryRequestFactory.create({
          scheduled: generationRequest.scheduled,
          sourceScope: permission.sourceScope,
        });
        if (
          summaryRequest.conversations.some(
            (conversation) =>
              !permission.sourceScope.includes(conversation.source),
          )
        ) {
          sendJson(response, 403, {
            error: {
              message: "Conversation source is outside the saved permission.",
            },
          });
          return;
        }
        const providers = orderedProviders(
          availableSummaryProviders,
          permission.preferredCli,
        );
        if (!summaryRunner || !providers.length) {
          sendJson(response, 503, {
            report: {
              status: "incomplete",
              reason: "No approved summarizer CLI is available.",
            },
          });
          return;
        }
        const failures: string[] = [];
        for (const provider of providers) {
          try {
            await summaryRunner.run(provider, summaryRequest);
            sendJson(response, 201, { provider });
            return;
          } catch (error) {
            failures.push(
              `${providerName(provider)} failed: ${errorMessage(error)}.`,
            );
          }
        }
        sendJson(response, 503, {
          report: { status: "incomplete", reason: failures.join(" ") },
        });
        return;
      }

      if (pathname === "/api/reports/sample") {
        if (request.method !== "POST") {
          sendJson(response, 405, {
            error: {
              code: "method_not_allowed",
              message: "Method not allowed.",
            },
          });
          return;
        }

        const report = generateSampleReport(sampleRecords, reportDate());
        await reportStore.save(report);
        const storedReport = await reportStore.readLatest();
        if (!storedReport.found) {
          throw new Error("Saved report could not be read back.");
        }
        sendJson(response, 201, { report: storedReport.report });
        return;
      }

      if (pathname === "/api/reports/latest") {
        if (request.method !== "GET") {
          sendJson(response, 405, {
            error: {
              code: "method_not_allowed",
              message: "Method not allowed.",
            },
          });
          return;
        }

        const result = await reportStore.readLatest();
        if (!result.found) {
          sendJson(response, 404, {
            error: {
              code: "report_not_found",
              message: "No report has been generated yet.",
            },
          });
          return;
        }

        sendJson(response, 200, { report: result.report });
        return;
      }

      const staticAsset = staticAssetFor(pathname);
      if (request.method === "GET" && staticDirectory && staticAsset) {
        const contents = await readFile(
          join(staticDirectory, staticAsset.file),
        );
        response.writeHead(200, {
          "content-type": staticAsset.contentType,
          "cache-control": "no-store",
        });
        response.end(contents);
        return;
      }

      sendJson(response, 404, {
        error: { code: "not_found", message: "Route not found." },
      });
    } catch {
      sendJson(response, 500, {
        error: {
          code: "internal_error",
          message: "The local report service could not complete the request.",
        },
      });
    }
  });
}

function safeStatus(status: ProviderLoginStatus): ProviderLoginStatus {
  const { provider, label, state, installUrl } = status;
  const safe: ProviderLoginStatus = { provider, label, state, installUrl };
  if (status.signedIn === true) safe.signedIn = true;
  if (typeof status.reason === "string") safe.reason = status.reason;
  if (typeof status.checkedAt === "string") safe.checkedAt = status.checkedAt;
  if (Array.isArray(status.probeFailures))
    safe.probeFailures = status.probeFailures.map(({ attempt, reason }) => ({
      attempt,
      reason,
    }));
  if (status.checking === true) safe.checking = true;
  return safe;
}

function summaryModelsUnavailable(response: ServerResponse): void {
  sendJson(response, 503, {
    error: {
      code: "summary_models_unavailable",
      message: "Summary model settings are unavailable on this machine.",
    },
  });
}

function providerLoginUnavailable(response: ServerResponse): void {
  sendJson(response, 503, {
    error: {
      code: "provider_login_unavailable",
      message: "Provider sign-in is unavailable on this machine.",
    },
  });
}

function summaryDisclosure() {
  return {
    sourceScope: ["claude-code", "codex"],
    conversationScope:
      "Complete conversations with report-day activity, including context through the end of that day.",
    possibleRecipients: ["codex", "claude-code"],
  };
}

function orderedProviders(
  available: SummaryProvider[],
  preferredCli: SummaryProvider | undefined,
): SummaryProvider[] {
  const unique = [...new Set(available)];
  const preferred = preferredCli ?? "codex";
  return [
    preferred,
    ...unique.filter((provider) => provider !== preferred),
  ].filter(
    (provider, index, providers) =>
      unique.includes(provider) && providers.indexOf(provider) === index,
  );
}

function providerName(provider: SummaryProvider): string {
  return provider === "codex" ? "Codex" : "Claude Code";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown failure";
}

async function parseJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 1_000_000) throw new Error("Too large");
  }
  return JSON.parse(body);
}

async function parseGenerationRequest(
  request: IncomingMessage,
): Promise<{ scheduled: boolean } | undefined> {
  try {
    const value = await parseJsonBody(request);
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as { scheduled?: unknown };
    if (
      typeof candidate.scheduled !== "boolean" ||
      Object.keys(candidate).length !== 1
    )
      return undefined;
    return { scheduled: candidate.scheduled };
  } catch {
    return undefined;
  }
}

function staticAssetFor(
  pathname: string,
): { contentType: string; file: string } | undefined {
  const assets: Record<string, { contentType: string; file: string }> = {
    "/": { contentType: "text/html; charset=utf-8", file: "index.html" },
    "/app.js": {
      contentType: "text/javascript; charset=utf-8",
      file: "app.js",
    },
    "/styles.css": {
      contentType: "text/css; charset=utf-8",
      file: "styles.css",
    },
  };
  return assets[pathname];
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localOrigin(request: IncomingMessage): string | undefined {
  const port = request.socket.localPort;
  const host = request.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
    return undefined;
  return `http://${host}`;
}
function consentRequired(response: ServerResponse): void {
  sendJson(response, 403, {
    error: {
      code: "consent_required",
      message: "Save your local source choice before reading activity.",
    },
  });
}
function settingsError(response: ServerResponse): void {
  sendJson(response, 503, {
    error: {
      code: "consent_unavailable",
      message:
        "Source settings could not be read or saved. Collection is blocked. Save your choice to retry.",
    },
  });
}
