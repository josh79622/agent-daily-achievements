import { expect, test } from "vitest";

import type { EvidenceManifest } from "../../src/report/contract.js";
import type { ReportDayPayload } from "../../src/report/report-day-payload.js";
import {
  chunkReportDayPayload,
  summaryChunkMaxPayloadBytes,
} from "../../src/report/summary-chunking.js";

type Conversation = {
  source: "codex";
  recordId: string;
  messages: Array<{ id: string; role: "user"; time: string; text: string }>;
};

function payload(conversations: Conversation[]): ReportDayPayload {
  const payloadJson = JSON.stringify({ date: "2026-09-23", conversations });
  const manifest: EvidenceManifest = conversations.map((conversation) => ({
    source: conversation.source,
    recordId: conversation.recordId,
    messageIds: conversation.messages.map((message) => message.id),
  }));
  return {
    date: "2026-09-23",
    timeZone: "UTC",
    payloadJson,
    manifest,
    coverage: [{ source: "codex", state: "included" }],
    byteLength: Buffer.byteLength(payloadJson),
  };
}

function session(id: string, messages: Conversation["messages"]): Conversation {
  return { source: "codex", recordId: id, messages };
}

function message(id: string, text: string): Conversation["messages"][number] {
  return { id, role: "user", time: "09:00", text };
}

function chunksOf(result: ReturnType<typeof chunkReportDayPayload>) {
  expect(result.kind).not.toBe("message-too-large");
  if (result.kind === "message-too-large") throw new Error("unreachable");
  return result.chunks;
}

test("CH-1: a safe payload is one unchanged summary chunk", () => {
  const day = payload([
    session("session-a", [message("m-1", "made progress")]),
  ]);

  const result = chunkReportDayPayload(day);

  expect(result.kind).toBe("single");
  expect(chunksOf(result)).toEqual([
    {
      index: 0,
      payloadJson: day.payloadJson,
      manifest: day.manifest,
      sessionIds: ["session-a"],
    },
  ]);
});

test("CH-1a: prompt and reply room is reserved below the total request budget", () => {
  const day = payload([
    session("session-a", [
      message("m-1", "x".repeat(summaryChunkMaxPayloadBytes - 1_000)),
    ]),
  ]);

  expect(chunkReportDayPayload(day)).toEqual({
    kind: "message-too-large",
    source: "codex",
    recordId: "session-a",
    messageId: "m-1",
  });
});

test("CH-2: complete sessions pack chronologically without splitting", () => {
  const body = "x".repeat(70_000);
  const day = payload([
    session("session-a", [message("m-1", body)]),
    session("session-b", [message("m-2", body)]),
    session("session-c", [message("m-3", body)]),
  ]);

  const chunks = chunksOf(chunkReportDayPayload(day));

  expect(chunks).toHaveLength(3);
  expect(chunks.map((chunk) => chunk.sessionIds)).toEqual([
    ["session-a"],
    ["session-b"],
    ["session-c"],
  ]);
  expect(
    chunks.every(
      (chunk) =>
        Buffer.byteLength(chunk.payloadJson) <= summaryChunkMaxPayloadBytes,
    ),
  ).toBe(true);
  expect(
    chunks.flatMap((chunk) =>
      chunk.manifest.flatMap((entry) => entry.messageIds),
    ),
  ).toEqual(["m-1", "m-2", "m-3"]);
});

test("CH-3: an oversized session splits only between messages", () => {
  const body = "x".repeat(50_000);
  const day = payload([
    session("session-a", [
      message("m-1", body),
      message("m-2", body),
      message("m-3", body),
    ]),
  ]);

  const chunks = chunksOf(chunkReportDayPayload(day));

  expect(chunks).toHaveLength(2);
  expect(chunks.map((chunk) => chunk.sessionIds)).toEqual([
    ["session-a"],
    ["session-a"],
  ]);
  expect(
    chunks.every(
      (chunk) =>
        Buffer.byteLength(chunk.payloadJson) <= summaryChunkMaxPayloadBytes,
    ),
  ).toBe(true);
  expect(
    chunks.flatMap((chunk) =>
      chunk.manifest.flatMap((entry) => entry.messageIds),
    ),
  ).toEqual(["m-1", "m-2", "m-3"]);
  expect(
    chunks.flatMap((chunk) =>
      JSON.parse(chunk.payloadJson).conversations[0].messages.map(
        (entry: { id: string }) => entry.id,
      ),
    ),
  ).toEqual(["m-1", "m-2", "m-3"]);
});

test("CH-3a: a split session's final fragment packs with the following session", () => {
  const day = payload([
    session("session-a", [
      message("m-1", "x".repeat(80_000)),
      message("m-2", "x".repeat(55_000)),
    ]),
    session("session-b", [message("m-3", "x".repeat(50_000))]),
  ]);

  const chunks = chunksOf(chunkReportDayPayload(day));

  expect(chunks.map((chunk) => chunk.sessionIds)).toEqual([
    ["session-a"],
    ["session-a", "session-b"],
  ]);
  expect(
    chunks.flatMap((chunk) =>
      chunk.manifest.flatMap((entry) => entry.messageIds),
    ),
  ).toEqual(["m-1", "m-2", "m-3"]);
});

test("CH-4: an indivisible oversized message is reported without truncation", () => {
  const day = payload([
    session("session-a", [
      message("m-1", "x".repeat(summaryChunkMaxPayloadBytes)),
    ]),
  ]);

  expect(chunkReportDayPayload(day)).toEqual({
    kind: "message-too-large",
    source: "codex",
    recordId: "session-a",
    messageId: "m-1",
  });
});
