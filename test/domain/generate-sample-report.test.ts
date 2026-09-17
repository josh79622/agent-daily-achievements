import { expect, test } from "vitest";

import { generateSampleReport } from "../../src/domain/generate-sample-report.js";
import { sampleRecords } from "../../src/domain/sample-records.js";

test("generates the approved sample day with traceable report sections", () => {
  const report = generateSampleReport(sampleRecords, "2026-09-16");

  expect(report.date).toBe("2026-09-16");
  expect(report.status).toBe("complete");
  expect(report.sections.map((section) => section.id)).toEqual([
    "progress",
    "decisions",
    "learning",
  ]);
  expect(report.sections.every((section) => section.items.length > 0)).toBe(
    true,
  );

  const reportSourceIds = new Set(
    report.sections.flatMap((section) =>
      section.items.flatMap((item) => item.sourceIds),
    ),
  );
  expect(reportSourceIds).toEqual(
    new Set(sampleRecords.map((record) => record.id)),
  );
  expect(report.sources.map((source) => source.id)).toEqual(
    sampleRecords.map((record) => record.id),
  );
});
