import type {
  DailyReport,
  EvidenceRecord,
  ReportSection,
  ReportSectionId,
} from "./report.js";

const sectionHeadings: Record<ReportSectionId, string> = {
  progress: "Progress made",
  decisions: "Decisions clarified",
  learning: "What you learned",
};

const sectionOrder: ReportSectionId[] = ["progress", "decisions", "learning"];

export function generateSampleReport(
  records: EvidenceRecord[],
  date: string,
): DailyReport {
  const sections: ReportSection[] = sectionOrder.map((id) => ({
    id,
    heading: sectionHeadings[id],
    items: records
      .filter((record) => record.kind === id)
      .map((record) => ({
        id: `item:${record.id}`,
        title: record.title,
        detail: record.detail,
        sourceIds: [record.id],
      })),
  }));

  return {
    date,
    title: "Your day, made visible",
    status: "complete",
    overview: `This fictional demo found ${records.length} evidence-backed moments worth remembering.`,
    generatedAt: new Date().toISOString(),
    sections,
    sources: records.map((record) => ({
      id: record.id,
      source: record.source,
      label: record.id,
    })),
  };
}
