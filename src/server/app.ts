import { readFile } from "node:fs/promises";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

import type {
  LocalCollector,
  LocalSource,
} from "../collector/local-collector.js";
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
import {
  buildReportDayPayload,
  type ReportDayPayload,
} from "../report/report-day-payload.js";
import { isValidAchievementEdit } from "../report/contract.js";
import { isSupportedSummaryLanguage } from "../report/languages.js";
import type { SummarizerModelsService } from "../summarizer/model-settings.js";
import {
  type ProviderLoginService,
  type ProviderLoginStatus,
  isSummaryProvider,
} from "../summarizer/provider-login.js";
import {
  orderedProviders,
  providerName,
} from "../summarizer/provider-order.js";
import type { LanguagePackBuilder } from "../summarizer/language-pack-run.js";

export interface SummaryRequest {
  scheduled: boolean;
  payload: ReportDayPayload;
  language?: string;
}

export interface SummaryRunner {
  run(provider: SummaryProvider, request: SummaryRequest): Promise<void>;
}

export interface SummaryRequestFactory {
  create(input: {
    scheduled: boolean;
    sourceScope: LocalSource[];
    language?: string;
    date?: string;
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
  languagePackBuilder?: LanguagePackBuilder;
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
  summaryRequestFactory = collector
    ? {
        async create({ scheduled, sourceScope, language, date }) {
          return {
            scheduled,
            language,
            payload: await buildReportDayPayload({
              collector,
              date: date ?? reportDate(),
              sourceScope,
            }),
          };
        },
      }
    : undefined,
  availableSummaryProviders = [],
  providerLoginService,
  summarizerModels,
  languagePackBuilder,
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
          // A trace-back request names the saved report's own date, so a
          // past day's session is collected as it was that day rather than
          // as of today; the live "Local activity" panel omits it and gets
          // today, unchanged.
          const requestedDate = new URL(
            request.url ?? "/",
            origin,
          ).searchParams.get("date");
          if (
            requestedDate !== null &&
            !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
          ) {
            sendJson(response, 400, {
              error: { message: "Provide date as YYYY-MM-DD." },
            });
            return;
          }
          activeCollections += 1;
          let result;
          try {
            result = await collector.collect(
              requestedDate ?? collectorDate(),
              sources,
            );
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
            recipients: ["codex", "claude-code", "agy"] as const,
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
        const language =
          generationRequest.language ?? permission.summaryLanguage;
        const summaryRequest = await summaryRequestFactory.create({
          scheduled: generationRequest.scheduled,
          sourceScope: permission.sourceScope,
          language,
          date: generationRequest.date,
        });
        if (
          summaryRequest.payload.manifest.some(
            (record) =>
              !permission.sourceScope.includes(record.source as LocalSource),
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

      if (pathname === "/api/reports") {
        if (request.method !== "GET") {
          sendJson(response, 405, {
            error: {
              code: "method_not_allowed",
              message: "Method not allowed.",
            },
          });
          return;
        }
        const dates = await reportStore.listDates();
        sendJson(response, 200, { dates });
        return;
      }

      const reportDateMatch = pathname.match(
        /^\/api\/reports\/(\d{4}-\d{2}-\d{2})$/,
      );
      if (reportDateMatch) {
        if (request.method !== "GET") {
          sendJson(response, 405, {
            error: {
              code: "method_not_allowed",
              message: "Method not allowed.",
            },
          });
          return;
        }

        const date = reportDateMatch[1]!;
        const result = await reportStore.read(date);
        if (!result.found) {
          sendJson(response, 404, {
            error: {
              code: "report_not_found",
              message: `No report found for ${date}.`,
            },
          });
          return;
        }

        sendJson(response, 200, { report: result.report });
        return;
      }

      // Josh's own correction to an already-saved report (BRIEF.md: an
      // incorrect item must be correctable or removable). This never
      // touches the summarizer, the payload, or evidence — only title/detail
      // text (PATCH) or removing the whole item (DELETE).
      const achievementMatch = pathname.match(
        /^\/api\/reports\/(\d{4}-\d{2}-\d{2})\/achievements\/([^/]+)$/,
      );
      if (achievementMatch) {
        const origin = localOrigin(request);
        if (
          !origin ||
          (request.headers.origin && request.headers.origin !== origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          sendJson(response, 403, {
            error: { message: "Edit reports from the local app." },
          });
          return;
        }
        if (request.method !== "PATCH" && request.method !== "DELETE") {
          sendJson(response, 405, {
            error: {
              code: "method_not_allowed",
              message: "Method not allowed.",
            },
          });
          return;
        }
        if (
          request.headers.origin !== origin ||
          (request.method === "PATCH" &&
            request.headers["content-type"]?.split(";")[0] !==
              "application/json")
        ) {
          sendJson(response, 403, {
            error: { message: "Edit reports from the local app." },
          });
          return;
        }
        const [, date, rawId] = achievementMatch;
        const achievementId = decodeURIComponent(rawId ?? "");
        const existing = await reportStore.read(date ?? "");
        if (!existing.found) {
          sendJson(response, 404, {
            error: { message: "No report was saved for that date." },
          });
          return;
        }
        const index = existing.report.achievements.findIndex(
          (achievement) => achievement.id === achievementId,
        );
        if (index === -1) {
          sendJson(response, 404, {
            error: { message: "That achievement was not found." },
          });
          return;
        }
        let achievements = existing.report.achievements;
        if (request.method === "DELETE") {
          achievements = achievements.filter(
            (achievement) => achievement.id !== achievementId,
          );
        } else {
          const edit = await parseJsonBody(request).catch(() => undefined);
          if (!isValidAchievementEdit(edit)) {
            sendJson(response, 400, {
              error: { message: "Provide a valid title and/or detail." },
            });
            return;
          }
          achievements = achievements.map((achievement, position) => {
            if (position === index) {
              return { ...achievement, ...edit };
            }
            if (edit.isPrimary === true) {
              return { ...achievement, isPrimary: false };
            }
            return achievement;
          });
        }
        const updated = { ...existing.report, achievements };
        await reportStore.save(updated);
        sendJson(response, 200, { report: updated });
        return;
      }

      if (pathname.startsWith("/api/locales/")) {
        const origin = localOrigin(request);
        if (
          !origin ||
          (request.headers.origin && request.headers.origin !== origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          sendJson(response, 403, {
            error: { message: "Use the local app to manage language packs." },
          });
          return;
        }
        if (!languagePackBuilder) {
          sendJson(response, 503, {
            error: {
              code: "language_packs_unavailable",
              message: "Language packs are unavailable on this machine.",
            },
          });
          return;
        }
        const buildMatch = pathname.match(/^\/api\/locales\/([^/]+)\/build$/);
        if (buildMatch) {
          if (request.method !== "POST") {
            sendJson(response, 405, {
              error: { message: "Method not allowed." },
            });
            return;
          }
          if (request.headers.origin !== origin) {
            sendJson(response, 403, {
              error: { message: "Build language packs from the local app." },
            });
            return;
          }
          const code = decodeURIComponent(buildMatch[1] ?? "");
          const permission = await readSummaryPermission(summaryPermissionPath);
          const result = await languagePackBuilder.build(code, {
            preferredCli: permission?.preferredCli,
          });
          if (result.kind === "refused") {
            sendJson(response, 400, {
              error: { code: "language_not_addable", message: result.reason },
            });
            return;
          }
          if (result.kind === "failed") {
            sendJson(response, 502, {
              error: {
                code: "language_pack_build_failed",
                message: result.reason,
              },
            });
            return;
          }
          sendJson(response, 200, { pack: result.pack });
          return;
        }
        const getMatch = pathname.match(/^\/api\/locales\/([^/]+)$/);
        if (getMatch) {
          if (request.method !== "GET") {
            sendJson(response, 405, {
              error: { message: "Method not allowed." },
            });
            return;
          }
          const code = decodeURIComponent(getMatch[1] ?? "");
          const pack = await languagePackBuilder.get(code);
          sendJson(response, 200, { pack: pack ?? null });
          return;
        }
        sendJson(response, 404, {
          error: { code: "not_found", message: "Route not found." },
        });
        return;
      }

      if (request.method === "GET" && staticDirectory) {
        const staticFile = resolveStaticFile(staticDirectory, pathname);
        if (staticFile) {
          try {
            const contents = await readFile(staticFile.path);
            response.writeHead(200, {
              "content-type": staticFile.contentType,
              "cache-control": "no-store",
            });
            response.end(contents);
            return;
          } catch (error) {
            if (!isMissingFile(error)) throw error;
          }
        }
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
  if (
    status.readyVia === "lowest-cost-model" ||
    status.readyVia === "summary-model"
  )
    safe.readyVia = status.readyVia;
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
    sourceScope: ["claude-code", "codex", "antigravity"],
    conversationScope:
      "Complete conversations with report-day activity, including context through the end of that day.",
    possibleRecipients: ["codex", "claude-code", "agy"],
  };
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
): Promise<
  { scheduled: boolean; language?: string; date?: string } | undefined
> {
  try {
    const value = await parseJsonBody(request);
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as {
      scheduled?: unknown;
      language?: unknown;
      date?: unknown;
    };
    if (typeof candidate.scheduled !== "boolean") return undefined;
    if (
      candidate.language !== undefined &&
      !isSupportedSummaryLanguage(candidate.language)
    )
      return undefined;
    if (
      candidate.date !== undefined &&
      (typeof candidate.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date))
    )
      return undefined;
    const validKeys = new Set(["scheduled", "language", "date"]);
    if (Object.keys(candidate).some((key) => !validKeys.has(key)))
      return undefined;
    return {
      scheduled: candidate.scheduled,
      language: candidate.language,
      date: candidate.date,
    };
  } catch {
    return undefined;
  }
}

const staticContentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Resolves a request path to a file inside `staticDirectory`, refusing
 * anything that would escape it (e.g. `..`). The built web app (Vite) picks
 * its own file names and hashes, so this serves whatever exists there
 * rather than a fixed map of known files.
 */
function resolveStaticFile(
  staticDirectory: string,
  pathname: string,
): { path: string; contentType: string } | undefined {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const root = resolve(staticDirectory);
  const target = resolve(root, normalize(relative));
  if (target !== root && !target.startsWith(root + sep)) return undefined;
  return {
    path: target,
    contentType:
      staticContentTypes[extname(target)] ?? "application/octet-stream",
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
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
