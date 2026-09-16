import assert from "node:assert/strict";
import test from "node:test";

import { generateSampleReport } from "../../src/domain/generate-sample-report.js";
import { sampleRecords } from "../../src/domain/sample-records.js";

test("generates the approved sample day with traceable report sections", () => {
  const report = generateSampleReport(sampleRecords, "2026-09-16");

  assert.equal(report.date, "2026-09-16");
  assert.equal(report.status, "complete");
  assert.deepEqual(
    report.sections.map((section) => section.id),
    ["progress", "decisions", "learning"],
  );
  assert.ok(report.sections.every((section) => section.items.length > 0));

  const reportSourceIds = new Set(
    report.sections.flatMap((section) =>
      section.items.flatMap((item) => item.sourceIds),
    ),
  );
  assert.deepEqual(
    reportSourceIds,
    new Set(sampleRecords.map((record) => record.id)),
  );
  assert.deepEqual(
    report.sources.map((source) => source.id),
    sampleRecords.map((record) => record.id),
  );
});
