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

interface AppOptions {
  consentPath?: string;
  reportStore: ReportStore;
  collector?: LocalCollector;
  collectorDate?: () => string;
  reportDate?: () => string;
  staticDirectory?: string;
}

export function createApp({
  reportStore,
  consentPath,
  collector,
  collectorDate = currentLocalDate,
  reportDate = currentLocalDate,
  staticDirectory,
}: AppOptions): Server {
  let generation = 0;
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
          const result = await collector.collect(collectorDate(), sources);
          let latest;
          try {
            latest = await readConsent(consentPath);
          } catch {
            settingsError(response);
            return;
          }
          if (
            generation !== revision ||
            saving ||
            saveFailed ||
            JSON.stringify(latest) !== JSON.stringify(sources)
          ) {
            consentRequired(response);
            return;
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
            sessions: sessions.map(
              ({ messages: _messages, ...metadata }) => metadata,
            ),
          });
          return;
        }
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
