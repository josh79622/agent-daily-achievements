import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export type LocalSource = "claude-code" | "codex";

export interface CollectedMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface CollectedSession {
  id: string;
  source: LocalSource;
  file: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  issueCount: number;
  messages: CollectedMessage[];
}

export type SourceCoverageState =
  "available" | "incomplete" | "no-activity" | "not-installed";

export type SourceCoverageReason =
  | "duplicate-session"
  | "malformed-record"
  | "partial-write"
  | "unreadable"
  | "unsupported-format";

export interface SourceCoverage {
  source: LocalSource;
  sessions: number;
  issues: number;
  state: SourceCoverageState;
  reason?: SourceCoverageReason;
}

export interface CollectionSummary {
  date: string;
  sources: SourceCoverage[];
  sessions: CollectedSession[];
}

export interface LocalCollector {
  collect(
    date: string,
    sources: readonly LocalSource[],
  ): Promise<CollectionSummary>;
}

interface LocalCollectorOptions {
  claudeDirectories: string[];
  codexDirectories: string[];
  timeZone?: string;
}

export function createLocalCollector(
  options: LocalCollectorOptions,
): LocalCollector {
  return {
    async collect(date, allowedSources) {
      const timeZone = localTimeZone(options.timeZone);
      const sources: SourceCoverage[] = [];
      const sessions: CollectedSession[] = [];
      for (const source of allowedSources) {
        const result = await collectSource(
          source,
          source === "claude-code"
            ? options.claudeDirectories
            : options.codexDirectories,
          date,
          timeZone,
        );
        sources.push(sourceCoverage(source, result));
        sessions.push(...result.sessions);
      }
      return { date, sources, sessions };
    },
  };
}

async function collectSource(
  source: LocalSource,
  paths: string[],
  date: string,
  timeZone: string,
): Promise<{
  filesFound: number;
  issues: number;
  missingPaths: number;
  reason?: SourceCoverageReason;
  sessions: CollectedSession[];
  supported: boolean;
  unreadablePaths: number;
}> {
  const locations = await Promise.all(paths.map(jsonlFilesAt));
  const files = locations.flatMap((location) => location.files);
  let issues = 0;
  const sessions: CollectedSession[] = [];
  let reason: SourceCoverageReason | undefined;
  let supported = false;
  for (const file of files) {
    const parsed = await parseFile(source, file, date, timeZone);
    issues += parsed.issues;
    supported ||= parsed.supported;
    reason ??= parsed.reason;
    if (parsed.session) sessions.push(parsed.session);
  }
  const missingPaths = locations.reduce(
    (total, location) => total + location.missingPaths,
    0,
  );
  const unreadablePaths = locations.reduce(
    (total, location) => total + location.unreadablePaths,
    0,
  );
  if (unreadablePaths > 0) {
    issues += unreadablePaths;
    reason = "unreadable";
  }
  if (source === "codex") {
    const counts = new Map<string, number>();
    for (const session of sessions)
      counts.set(session.id, (counts.get(session.id) ?? 0) + 1);
    const duplicateIds = new Set(
      [...counts].flatMap(([id, count]) => (count > 1 ? [id] : [])),
    );
    if (duplicateIds.size > 0) {
      return {
        filesFound: files.length,
        missingPaths,
        reason: "duplicate-session",
        sessions: sessions.filter((session) => !duplicateIds.has(session.id)),
        issues: issues + duplicateIds.size,
        supported,
        unreadablePaths,
      };
    }
  }
  return {
    filesFound: files.length,
    issues,
    missingPaths,
    reason,
    sessions,
    supported,
    unreadablePaths,
  };
}

function sourceCoverage(
  source: LocalSource,
  result: Awaited<ReturnType<typeof collectSource>>,
): SourceCoverage {
  if (result.unreadablePaths > 0 || result.reason === "unreadable")
    return {
      source,
      sessions: result.sessions.length,
      issues: result.issues,
      state: "incomplete",
      reason: "unreadable",
    };
  if (result.filesFound === 0 && result.missingPaths > 0)
    return { source, sessions: 0, issues: 0, state: "not-installed" };
  if (result.filesFound > 0 && !result.supported)
    return {
      source,
      sessions: result.sessions.length,
      issues: result.issues,
      state: "incomplete",
      reason: "unsupported-format",
    };
  if (result.issues > 0)
    return {
      source,
      sessions: result.sessions.length,
      issues: result.issues,
      state: "incomplete",
      reason: result.reason ?? "malformed-record",
    };
  if (result.sessions.length === 0)
    return { source, sessions: 0, issues: 0, state: "no-activity" };
  return {
    source,
    sessions: result.sessions.length,
    issues: 0,
    state: "available",
  };
}

async function jsonlFilesAt(path: string): Promise<{
  files: string[];
  missingPaths: number;
  unreadablePaths: number;
}> {
  try {
    const info = await stat(path);
    if (info.isFile())
      return {
        files: path.endsWith(".jsonl") ? [path] : [],
        missingPaths: 0,
        unreadablePaths: 0,
      };
    try {
      const entries = await readdir(path, { recursive: true });
      return {
        files: entries
          .filter((entry) => entry.endsWith(".jsonl"))
          .map((entry) => join(path, entry)),
        missingPaths: 0,
        unreadablePaths: 0,
      };
    } catch {
      return { files: [], missingPaths: 0, unreadablePaths: 1 };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { files: [], missingPaths: 1, unreadablePaths: 0 };
    return { files: [], missingPaths: 0, unreadablePaths: 1 };
  }
}

async function parseFile(
  source: LocalSource,
  file: string,
  date: string,
  timeZone: string,
): Promise<{
  issues: number;
  reason?: SourceCoverageReason;
  session?: CollectedSession;
  supported: boolean;
}> {
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    return { issues: 1, reason: "unreadable", supported: false };
  }
  let sessionId = basename(file, ".jsonl");
  let issues = 0;
  const messages: CollectedMessage[] = [];
  const lines = contents.replace(/^\uFEFF/, "").split("\n");
  let supported = false;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      issues += 1;
      continue;
    }
    supported ||= supportedRecord(source, record);
    if (isExcludedClaudeSidechain(source, record)) continue;
    sessionId = sessionIdFrom(source, record) ?? sessionId;
    if (
      hasConversationRole(source, record) &&
      !validTimestamp(record.timestamp)
    ) {
      issues += 1;
      continue;
    }
    const message = messageFrom(
      source,
      record,
      `${basename(file)}:${index + 1}`,
    );
    if (message) messages.push(message);
  }
  const reportDayMessages = messages.filter(
    (message) => localDate(message.timestamp, timeZone) === date,
  );
  const partialWrite =
    lastNonBlankLine(lines) === undefined
      ? false
      : !validJson(lastNonBlankLine(lines));
  const reason = partialWrite
    ? "partial-write"
    : issues > 0
      ? "malformed-record"
      : undefined;
  if (reportDayMessages.length === 0) return { issues, reason, supported };
  const reportMessages = messages.filter(
    (message) => localDate(message.timestamp, timeZone) <= date,
  );
  reportMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const firstMessage = reportMessages[0];
  if (!firstMessage) return { issues, reason, supported };
  return {
    issues,
    reason,
    session: {
      id: sessionId,
      source,
      file,
      startedAt: firstMessage.timestamp,
      endedAt: reportMessages.at(-1)?.timestamp ?? firstMessage.timestamp,
      messageCount: reportMessages.length,
      issueCount: issues,
      messages: reportMessages,
    },
    supported,
  };
}

function lastNonBlankLine(lines: string[]): string | undefined {
  return lines.findLast((line) => Boolean(line.trim()));
}

function validJson(line: string | undefined): boolean {
  if (!line) return true;
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

function supportedRecord(
  source: LocalSource,
  record: Record<string, unknown>,
): boolean {
  if (source === "claude-code")
    return Boolean(
      stringAt(record.sessionId) || hasConversationRole(source, record),
    );
  const payload = objectAt(record.payload);
  return Boolean(stringAt(payload?.id) || hasConversationRole(source, record));
}

function sessionIdFrom(
  source: LocalSource,
  record: Record<string, unknown>,
): string | undefined {
  if (source === "claude-code") return stringAt(record.sessionId);
  const payload = objectAt(record.payload);
  return stringAt(payload?.id);
}

function isExcludedClaudeSidechain(
  source: LocalSource,
  record: Record<string, unknown>,
): boolean {
  return (
    source === "claude-code" &&
    !stringAt(record.sessionId) &&
    Boolean(stringAt(record.parentSessionId))
  );
}

function messageFrom(
  source: LocalSource,
  record: Record<string, unknown>,
  fallbackId: string,
): CollectedMessage | undefined {
  const timestamp = stringAt(record.timestamp);
  if (!timestamp) return undefined;
  if (source === "claude-code") {
    const message = objectAt(record.message);
    const role = message && roleAt(message.role);
    const text = message && textFrom(message.content);
    if (!role || !text) return undefined;
    return { id: stringAt(record.uuid) ?? fallbackId, role, text, timestamp };
  }
  const payload = objectAt(record.payload);
  const role = payload && roleAt(payload.role);
  const text = payload && textFrom(payload.content);
  if (!role || !text) return undefined;
  return { id: fallbackId, role, text, timestamp };
}

function hasConversationRole(
  source: LocalSource,
  record: Record<string, unknown>,
): boolean {
  if (source === "claude-code")
    return Boolean(roleAt(objectAt(record.message)?.role));
  return Boolean(roleAt(objectAt(record.payload)?.role));
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function objectAt(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringAt(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function roleAt(value: unknown): "user" | "assistant" | undefined {
  return value === "user" || value === "assistant" ? value : undefined;
}

function textFrom(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const texts = content
    .map(objectAt)
    .map((part) => stringAt(part?.text))
    .filter((text): text is string => Boolean(text));
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function localTimeZone(configuredTimeZone: string | undefined): string {
  const timeZone =
    configuredTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!timeZone) throw new Error("Local timezone is unavailable.");
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return timeZone;
  } catch {
    throw new Error(`Invalid local timezone: ${timeZone}`);
  }
}

function localDate(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
