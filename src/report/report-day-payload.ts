// Builds the report-day payload and its evidence manifest server-side. Design:
// docs/plans/2026-09-18-report-day-payload-design.md.
//
// The payload and the manifest come from one pass over the same sessions, so the
// manifest always equals what would be sent. Nothing here transmits or stores
// anything.

import type {
  CollectedMessage,
  CollectedSession,
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
export const toolPartCap = 250;

/**
 * Both tool kinds are capped; `tool_use` was measured at 24.6% of a real day's
 * content, averaging 1,134 bytes, because an `Edit` or `Write` carries whole
 * file contents rather than just a path.
 *
 * The marker is always kept, then one window of body text: the head for a
 * `tool_use`, where the tool name and the file or command it acted on sit, and
 * the tail for a `tool_result`, where a run's verdict sits. Keeping one window
 * instead of two sends a third less; keeping the marker means a truncated part
 * never loses which tool ran or whether it succeeded.
 */
const capped: Partial<
  Record<MessagePart["kind"], { marker: RegExp; side: "head" | "tail" }>
> = {
  tool_use: { marker: /^\[tool_use \S+ ?/, side: "head" },
  tool_result: { marker: /^\[tool_result (?:ok|error)\]\n?/, side: "tail" },
};

export interface ReportDayPayload {
  date: string;
  /** The timezone the collector used for this day's boundaries, so the saved
   * report is never labelled in a different zone than it was collected in. */
  timeZone: string;
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
  const time = messageTime(collected.timeZone, date);

  const conversations: unknown[] = [];
  const manifest: Array<{
    source: ReportSource;
    recordId: string;
    project?: string;
    messageIds: string[];
  }> = [];

  const scopedSessions = collected.sessions.filter((session) =>
    scope.has(session.source),
  );

  const projectGroups = new Map<string, CollectedSession[]>();
  for (const session of scopedSessions) {
    const projectKey = session.project ?? "unassigned";
    const group = projectGroups.get(projectKey);
    if (group) {
      group.push(session);
    } else {
      projectGroups.set(projectKey, [session]);
    }
  }

  for (const group of projectGroups.values()) {
    group.sort((a, b) => {
      const timeA = Date.parse(a.startedAt);
      const timeB = Date.parse(b.startedAt);
      if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
        return a.startedAt.localeCompare(b.startedAt);
      }
      return timeA - timeB;
    });
  }

  const interleavedSessions: CollectedSession[] = [];
  const groups = Array.from(projectGroups.values());
  let maxLen = 0;
  for (const group of groups) {
    if (group.length > maxLen) maxLen = group.length;
  }
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (i < group.length) {
        interleavedSessions.push(group[i]!);
      }
    }
  }

  for (const session of interleavedSessions) {
    const messages = session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      time: time(message.timestamp),
      text: sentText(message),
    }));
    conversations.push({
      source: session.source,
      recordId: session.id,
      ...(session.project !== undefined ? { project: session.project } : {}),
      messages,
    });
    manifest.push({
      source: session.source,
      recordId: session.id,
      ...(session.project !== undefined ? { project: session.project } : {}),
      messageIds: messages.map((message) => message.id),
    });
  }

  const payloadJson = JSON.stringify({ date, conversations });
  return {
    date,
    timeZone: collected.timeZone,
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
  const rule = capped[part.kind];
  if (!rule || part.text.length <= toolPartCap * 2) return part.text;
  const marker = rule.marker.exec(part.text)?.[0] ?? "";
  const body = part.text.slice(marker.length);
  if (body.length <= toolPartCap) return part.text;
  const omitted = `[… ${body.length - toolPartCap} characters omitted]`;
  return rule.side === "head"
    ? `${marker}${body.slice(0, toolPartCap)}\n${omitted}`
    : `${marker}${omitted}\n${body.slice(body.length - toolPartCap)}`;
}

export function messageTime(
  timeZone: string,
  reportDate?: string,
): (timestamp: string) => string {
  const timeFormat = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  });
  const dateFormat = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  return (timestamp) => {
    const d = new Date(timestamp);
    const day = dateFormat.format(d);
    const time = timeFormat.format(d);
    if (reportDate && day !== reportDate) {
      return `${day} ${time}`;
    }
    return time;
  };
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
