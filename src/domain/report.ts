export type ReportStatus = "complete" | "incomplete";
export type ReportSectionId = "progress" | "decisions" | "learning";
export type EvidenceSource = "claude-code" | "codex" | "chatgpt-web";

export interface EvidenceRecord {
  id: string;
  source: EvidenceSource;
  kind: ReportSectionId;
  title: string;
  detail: string;
}

export interface ReportItem {
  id: string;
  title: string;
  detail: string;
  sourceIds: string[];
}

export interface ReportSection {
  id: ReportSectionId;
  heading: string;
  items: ReportItem[];
}

export interface SourceReference {
  id: string;
  source: EvidenceSource;
  label: string;
}

export interface DailyReport {
  date: string;
  title: string;
  status: ReportStatus;
  overview: string;
  generatedAt: string;
  sections: ReportSection[];
  sources: SourceReference[];
}
