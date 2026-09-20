import { format, type Translations } from "./i18n.js";
import { sourceLabel } from "./report-view.js";

export type LocalSource = "claude-code" | "codex" | "antigravity";

export interface CollectorSourceStatus {
  source: LocalSource;
  sessions: number;
  issues: number;
  state:
    | "available"
    | "incomplete"
    | "no-activity"
    | "not-installed"
    | "not-authorized";
  reason?: string;
}

export interface CollectorSessionItem {
  id: string;
  source: LocalSource;
  file: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  issueCount: number;
}

export const KNOWN_SOURCES: readonly LocalSource[] = [
  "claude-code",
  "codex",
  "antigravity",
];

/**
 * Computes a complete list of known local sources, marking unconsented
 * sources as not-authorized and merging in reported coverage metadata.
 */
export function computeSourceCoverageList(
  savedSources: readonly string[],
  reportedSources: readonly CollectorSourceStatus[],
): CollectorSourceStatus[] {
  return KNOWN_SOURCES.map((source) => {
    if (!savedSources.includes(source)) {
      return {
        source,
        sessions: 0,
        issues: 0,
        state: "not-authorized",
      };
    }
    const found = reportedSources.find((r) => r.source === source);
    if (found) return found;
    return {
      source,
      sessions: 0,
      issues: 0,
      state: "no-activity",
    };
  });
}

/**
 * Formats source coverage text according to localized conventions.
 */
export function formatSourceCoverageText(
  status: CollectorSourceStatus,
  t: Translations,
): string {
  const name = sourceLabel(status.source);
  switch (status.state) {
    case "not-authorized":
      return `${name} · ${t.activity.statusNotAuthorized}`;
    case "not-installed":
      return `${name} · ${t.activity.statusNotInstalled}`;
    case "no-activity":
      return `${name} · ${t.activity.statusNoActivity}`;
    case "incomplete":
      return `${name} · ${format(t.activity.statusIncomplete, {
        reason: status.reason ?? "unknown",
        sessions: status.sessions,
        issues: status.issues,
      })}`;
    case "available":
      return `${name} · ${format(t.activity.sessionsCount, { n: status.sessions })} · ${t.activity.statusAvailable}`;
  }
}

/**
 * Formats start and end timestamps into a clean local time range string.
 */
export function formatSessionTimeRange(
  startedAt: string,
  endedAt: string,
): string {
  if (!startedAt && !endedAt) return "—";
  try {
    const s = startedAt ? new Date(startedAt) : null;
    const e = endedAt ? new Date(endedAt) : null;
    const sStr =
      s && !isNaN(s.getTime())
        ? s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
    const eStr =
      e && !isNaN(e.getTime())
        ? e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
    if (sStr && eStr && sStr !== eStr) return `${sStr} – ${eStr}`;
    return sStr || eStr || "—";
  } catch {
    return "—";
  }
}
