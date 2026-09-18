// Builds the report-day payload and its evidence manifest server-side. Design:
// docs/plans/2026-09-18-report-day-payload-design.md.
//
// The payload and the manifest come from one pass over the same sessions, so the
// manifest always equals what would be sent. Nothing here transmits or stores
// anything.

import type {
  CollectedMessage,
  CollectionSummary,
  LocalCollector,
  LocalSource,
  MessagePart,
  SourceCoverage,
} from "../collector/local-collector.js";
import type {
  EvidenceManifest,
  ReportCoverage,
  ReportSource,
} from "./contract.js";

/**
 * Head and tail kept from one tool part. Bulk tool traffic is capped before it
 * leaves the machine: content-blind, uniform, and disclosed. Decision:
 * docs/decisions/2026-09-18-tool-result-truncation.md.
 */
export const toolPartCap = 500;

/**
 * Both tool kinds are capped. `tool_use` was measured at 24.6% of a real day's
 * content, averaging 1,134 bytes, because an `Edit` or `Write` carries whole
 * file contents rather than just a path.
 */
const cappedKinds: readonly MessagePart["kind"][] = ["tool_result", "tool_use"];

export interface ReportDayPayload {
  date: string;
  /** Exactly what would be sent to the summarizer. */
  payloadJson: string;
  manifest: EvidenceManifest;
  /** Local facts only; deliberately absent from `payloadJson`. */
  coverage: ReportCoverage[];
  byteLength: number;
}

export async function buildReportDayPayload({
  collector,
  date,
  sourceScope,
}: {
  collector: LocalCollector;
  date: string;
  sourceScope: readonly LocalSource[];
}): Promise<ReportDayPayload> {
  const collected = await collector.collect(date, sourceScope);
  const scope = new Set(sourceScope);
  const time = messageTime(collected.timeZone);

  const conversations: unknown[] = [];
  const manifest: Array<{
    source: ReportSource;
    recordId: string;
    messageIds: string[];
  }> = [];

  for (const session of collected.sessions) {
    if (!scope.has(session.source)) continue;
    const messages = session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      time: time(message.timestamp),
      text: sentText(message),
    }));
    conversations.push({
      source: session.source,
      recordId: session.id,
      messages,
    });
    manifest.push({
      source: session.source,
      recordId: session.id,
      messageIds: messages.map((message) => message.id),
    });
  }

  const payloadJson = JSON.stringify({ date, conversations });
  return {
    date,
    payloadJson,
    manifest,
    coverage: collected.sources
      .filter((source) => scope.has(source.source))
      .map(reportCoverage),
    byteLength: Buffer.byteLength(payloadJson),
  };
}

/** Message text as sent: only tool results are capped. */
function sentText(message: CollectedMessage): string {
  return message.parts.map(partText).join("\n");
}

function partText(part: MessagePart): string {
  if (!cappedKinds.includes(part.kind) || part.text.length <= toolPartCap * 2)
    return part.text;
  const omitted = part.text.length - toolPartCap * 2;
  return [
    part.text.slice(0, toolPartCap),
    `[… ${omitted} characters omitted]`,
    part.text.slice(part.text.length - toolPartCap),
  ].join("\n");
}

function messageTime(timeZone: string): (timestamp: string) => string {
  const format = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  });
  return (timestamp) => format.format(new Date(timestamp));
}

function reportCoverage(source: SourceCoverage): ReportCoverage {
  if (source.state === "available")
    return { source: source.source, state: "included" };
  if (source.state === "incomplete")
    return {
      source: source.source,
      state: "incomplete",
      ...(source.reason ? { reason: source.reason } : {}),
    };
  return { source: source.source, state: source.state };
}

export type { CollectionSummary };
