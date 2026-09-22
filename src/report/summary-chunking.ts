import type { EvidenceManifest, ReportSource } from "./contract.js";
import type { ReportDayPayload } from "./report-day-payload.js";

/** Conservative serialized-record budget under the shared ~64k-token limit. */
export const summaryChunkMaxPayloadBytes = 128 * 1024;

/** Room for the prompt, request wrappers, and a bounded structured reply. */
const summaryChunkReservedRequestBytes = 8 * 1024;
const summaryChunkRecordBudgetBytes =
  summaryChunkMaxPayloadBytes - summaryChunkReservedRequestBytes;

export type SummaryChunk = {
  index: number;
  payloadJson: string;
  manifest: EvidenceManifest;
  sessionIds: readonly string[];
};

export type ChunkingResult =
  | { kind: "single"; chunks: readonly [SummaryChunk] }
  | { kind: "chunked"; chunks: readonly SummaryChunk[] }
  | {
      kind: "message-too-large";
      source: ReportSource;
      recordId: string;
      messageId: string;
    };

type PayloadConversation = {
  source: ReportSource;
  recordId: string;
  messages: PayloadMessage[];
};

type PayloadMessage = { id: string };

type ParsedPayload = { date: string; conversations: PayloadConversation[] };

/**
 * Splits only records that cannot fit together. The input is already the
 * consent-gated, server-built payload; this module only repackages it.
 */
export function chunkReportDayPayload(
  payload: ReportDayPayload,
): ChunkingResult {
  const parsed = JSON.parse(payload.payloadJson) as ParsedPayload;
  const wholeChunk = makeChunk(
    0,
    parsed.date,
    parsed.conversations,
    payload.manifest,
  );

  if (byteLength(wholeChunk.payloadJson) <= summaryChunkRecordBudgetBytes)
    return { kind: "single", chunks: [wholeChunk] };

  const chunks: SummaryChunk[] = [];
  let current: PayloadConversation[] = [];

  for (const conversation of parsed.conversations) {
    if (fits(parsed.date, [...current, conversation])) {
      current.push(conversation);
      continue;
    }

    if (current.length > 0) {
      chunks.push(
        makeChunk(chunks.length, parsed.date, current, payload.manifest),
      );
      current = [];
    }

    if (fits(parsed.date, [conversation])) {
      current.push(conversation);
      continue;
    }

    for (const message of conversation.messages) {
      const splitConversation = { ...conversation, messages: [message] };
      if (!fits(parsed.date, [splitConversation])) {
        return {
          kind: "message-too-large",
          source: conversation.source,
          recordId: conversation.recordId,
          messageId: message.id,
        };
      }
      const candidate = appendMessage(current, splitConversation);
      if (fits(parsed.date, candidate)) {
        current = candidate;
      } else {
        if (current.length > 0)
          chunks.push(
            makeChunk(chunks.length, parsed.date, current, payload.manifest),
          );
        current = [splitConversation];
      }
    }
  }

  if (current.length > 0)
    chunks.push(
      makeChunk(chunks.length, parsed.date, current, payload.manifest),
    );

  return { kind: "chunked", chunks };
}

function appendMessage(
  conversations: PayloadConversation[],
  next: PayloadConversation,
): PayloadConversation[] {
  const last = conversations.at(-1);
  if (!last || last.source !== next.source || last.recordId !== next.recordId)
    return [...conversations, next];
  return [
    ...conversations.slice(0, -1),
    { ...last, messages: [...last.messages, ...next.messages] },
  ];
}

function fits(date: string, conversations: PayloadConversation[]): boolean {
  return (
    byteLength(JSON.stringify({ date, conversations })) <=
    summaryChunkRecordBudgetBytes
  );
}

function makeChunk(
  index: number,
  date: string,
  conversations: PayloadConversation[],
  manifest: EvidenceManifest,
): SummaryChunk {
  const payloadJson = JSON.stringify({ date, conversations });
  const allowedMessages = new Map(
    conversations.map((conversation) => [
      key(conversation.source, conversation.recordId),
      new Set(conversation.messages.map((message) => message.id)),
    ]),
  );
  const chunkManifest = manifest.flatMap((entry) => {
    const messageIds = allowedMessages.get(key(entry.source, entry.recordId));
    if (!messageIds) return [];
    return [
      {
        source: entry.source,
        recordId: entry.recordId,
        messageIds: entry.messageIds.filter((id) => messageIds.has(id)),
      },
    ];
  });
  return {
    index,
    payloadJson,
    manifest: chunkManifest,
    sessionIds: conversations.map((conversation) => conversation.recordId),
  };
}

function key(source: ReportSource, recordId: string): string {
  return `${source}\u0000${recordId}`;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value);
}
