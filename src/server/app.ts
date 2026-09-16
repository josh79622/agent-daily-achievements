import { createServer, type Server, type ServerResponse } from "node:http";

import { generateSampleReport } from "../domain/generate-sample-report.js";
import { sampleRecords } from "../domain/sample-records.js";
import type { ReportStore } from "../storage/report-store.js";

interface AppOptions {
  reportStore: ReportStore;
  reportDate?: () => string;
}

export function createApp({
  reportStore,
  reportDate = currentLocalDate,
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
        sendJson(response, 201, { report });
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
