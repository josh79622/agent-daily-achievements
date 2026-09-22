import { expect, test } from "vitest";

import type { EvidenceManifest } from "../../src/report/contract.js";
import type { SummaryChunk } from "../../src/report/summary-chunking.js";
import {
  buildChunkSummaryRequestText,
  buildMergeSummaryRequestText,
} from "../../src/report/summary-prompt.js";

const chunk: SummaryChunk = {
  index: 2,
  payloadJson: JSON.stringify({
    date: "2026-09-23",
    conversations: [
      {
        source: "codex",
        recordId: "session-in-chunk",
        messages: [{ id: "message-in-chunk", text: "implemented it" }],
      },
    ],
  }),
  manifest: [
    {
      source: "codex",
      recordId: "session-in-chunk",
      messageIds: ["message-in-chunk"],
    },
  ],
  sessionIds: ["session-in-chunk"],
};

const fullManifest: EvidenceManifest = [
  ...chunk.manifest,
  {
    source: "claude-code",
    recordId: "session-outside-chunk",
    messageIds: ["message-outside-chunk"],
  },
];

test("CP-1: a chunk prompt considers qualifying activities and limits citations to its evidence", () => {
  const prompt = buildChunkSummaryRequestText(chunk, { language: "es" });

  expect(prompt).toContain("qualifying activities");
  expect(prompt).toContain("only the evidence IDs in this chunk");
  expect(prompt).toContain("session-in-chunk");
  expect(prompt).toContain("message-in-chunk");
  expect(prompt).not.toContain("session-outside-chunk");
  expect(prompt).toContain("strictly in Spanish (Español).");
});

test("CP-2: a merge prompt deduplicates chunk candidates against original evidence", () => {
  const candidates = [
    {
      chunkIndex: 2,
      achievements: [
        {
          id: "implemented",
          category: "progress",
          title: "Implemented it",
          detail: "The work ran.",
          isPrimary: true,
          evidence: [
            {
              source: "codex",
              recordId: "session-in-chunk",
              messageIds: ["message-in-chunk"],
            },
          ],
        },
      ],
    },
  ];

  const prompt = buildMergeSummaryRequestText(candidates, fullManifest, {
    language: "zh-TW",
  });

  expect(prompt).toContain("0 to 5 deduplicated final achievements");
  expect(prompt).toContain(
    "only original evidence IDs from the supplied manifest",
  );
  expect(prompt).toContain("Never cite chunk IDs or invented IDs");
  expect(prompt).toContain(JSON.stringify(candidates));
  expect(prompt).toContain(JSON.stringify(fullManifest));
  expect(prompt).toContain("strictly in Traditional Chinese (繁體中文).");
});
