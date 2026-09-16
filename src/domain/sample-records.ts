import type { EvidenceRecord } from "./report.js";

export const sampleRecords: EvidenceRecord[] = [
  {
    id: "codex:sample-fix-01",
    source: "codex",
    kind: "progress",
    title: "Made the report generator reliable",
    detail:
      "Fixed the date-boundary bug and confirmed the focused regression test passed.",
  },
  {
    id: "claude-code:sample-decision-01",
    source: "claude-code",
    kind: "decisions",
    title: "Kept the first release local",
    detail:
      "Chose a local-first workflow so private activity records remain under the user's control.",
  },
  {
    id: "chatgpt-web:sample-learning-01",
    source: "chatgpt-web",
    kind: "learning",
    title: "Clarified what verification means",
    detail:
      "Explained that a commit records a change while a passing check provides evidence that it behaves as intended.",
  },
];
