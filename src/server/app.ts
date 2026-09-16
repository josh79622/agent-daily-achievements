import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";

import { generateSampleReport } from "../domain/generate-sample-report.js";
import { sampleRecords } from "../domain/sample-records.js";
import type { ReportStore } from "../storage/report-store.js";

interface AppOptions {
  reportStore: ReportStore;
  reportDate?: () => string;
  staticDirectory?: string;
}

export function createApp({
  reportStore,
  reportDate = currentLocalDate,
  staticDirectory,
}: AppOptions): Server {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

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
