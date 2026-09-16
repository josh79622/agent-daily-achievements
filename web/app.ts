import type { DailyReport, EvidenceSource } from "../src/domain/report.js";

interface ReportResponse {
  report: DailyReport;
}

interface ErrorResponse {
  error?: { message?: string };
}

const generateButton = requiredElement<HTMLButtonElement>("generate-button");
const emptyState = requiredElement<HTMLElement>("empty-state");
const reportView = requiredElement<HTMLElement>("report-view");
const errorBanner = requiredElement<HTMLElement>("error-banner");
const errorMessage = requiredElement<HTMLElement>("error-message");
const reportDate = requiredElement<HTMLElement>("report-date");
const reportTitle = requiredElement<HTMLElement>("report-title");
const reportOverview = requiredElement<HTMLElement>("report-overview");
const reportStatus = requiredElement<HTMLElement>("report-status");
const reportSections = requiredElement<HTMLElement>("report-sections");
const reportSources = requiredElement<HTMLElement>("report-sources");

generateButton.addEventListener("click", () => void generateReport());
void loadLatestReport();

async function loadLatestReport(): Promise<void> {
  try {
    const response = await fetch("/api/reports/latest");
    if (response.status === 404) return;
    if (!response.ok) throw await responseError(response);
    const body = (await response.json()) as ReportResponse;
    renderReport(body.report);
  } catch (error) {
    showError(error);
  }
}

async function generateReport(): Promise<void> {
  setGenerating(true);
  errorBanner.hidden = true;

  try {
    const response = await fetch("/api/reports/sample", { method: "POST" });
    if (!response.ok) throw await responseError(response);
    const body = (await response.json()) as ReportResponse;
    renderReport(body.report);
    reportView.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error);
  } finally {
    setGenerating(false);
  }
}

function renderReport(report: DailyReport): void {
  reportDate.textContent = formatDate(report.date);
  reportTitle.textContent = report.title;
  reportOverview.textContent = report.overview;
  reportStatus.textContent = report.status;
  reportSections.replaceChildren();
  reportSources.replaceChildren();

  report.sections.forEach((section, index) => {
    const sectionElement = document.createElement("article");
    sectionElement.className = "report-section";

    const number = document.createElement("div");
    number.className = "report-section-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const heading = document.createElement("h3");
    heading.textContent = section.heading;

    sectionElement.append(number, heading);
    section.items.forEach((item) => {
      const itemElement = document.createElement("div");
      itemElement.className = "report-item";

      const title = document.createElement("h4");
      title.textContent = item.title;
      const detail = document.createElement("p");
      detail.textContent = item.detail;

      itemElement.append(title, detail);
      item.sourceIds.forEach((sourceId) => {
        const chip = document.createElement("span");
        chip.className = "source-chip";
        chip.textContent = sourceId;
        itemElement.append(chip);
      });
      sectionElement.append(itemElement);
    });
    reportSections.append(sectionElement);
  });

  report.sources.forEach((source) => {
    const sourceElement = document.createElement("span");
    sourceElement.textContent = `${sourceName(source.source)} · ${source.id}`;
    reportSources.append(sourceElement);
  });

  emptyState.hidden = true;
  reportView.hidden = false;
}

function setGenerating(isGenerating: boolean): void {
  generateButton.disabled = isGenerating;
  const label = generateButton.querySelector("span");
  if (label)
    label.textContent = isGenerating ? "Generating…" : "Generate sample report";
}

function showError(error: unknown): void {
  errorMessage.textContent =
    error instanceof Error ? error.message : "Please try again.";
  errorBanner.hidden = false;
}

async function responseError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as ErrorResponse;
  return new Error(
    body.error?.message ?? `Request failed (${response.status}).`,
  );
}

function sourceName(source: EvidenceSource): string {
  const names: Record<EvidenceSource, string> = {
    "claude-code": "Claude Code",
    codex: "Codex",
    "chatgpt-web": "Web add-on",
  };
  return names[source];
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing page element: ${id}`);
  return element as T;
}
