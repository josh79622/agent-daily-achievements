import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export type LocalSource = "claude-code" | "codex";

/**
 * Non-text conversation content becomes a visible placeholder part rather than
 * being dropped. Design: docs/plans/2026-09-18-report-day-payload-design.md.
 */
export type MessagePartKind =
  "text" | "image" | "tool_use" | "tool_result" | "other";

export interface MessagePart {
  kind: MessagePartKind;
  text: string;
}

export interface CollectedMessage {
  id: string;
  role: "user" | "assistant";
  /** The joined parts, kept so existing readers need no change. */
  text: string;
  timestamp: string;
  parts: MessagePart[];
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
  | "duplicate-conflict"
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
  /** The zone the day boundaries were computed in. */
  timeZone: string;
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
      return { date, timeZone, sources, sessions };
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
  const fragments: ParsedFile[] = [];
  let reason: SourceCoverageReason | undefined;
  let supported = false;
  for (const file of files) {
    const parsed = await parseFile(source, file);
    issues += parsed.issues;
    supported ||= parsed.supported;
    reason ??= parsed.reason;
    if (parsed.messages.length > 0) fragments.push(parsed);
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
  const merged = mergeSessions(source, fragments, date, timeZone);
  return {
    filesFound: files.length,
    missingPaths,
    reason: merged.conflicts > 0 ? "duplicate-conflict" : reason,
    sessions: merged.sessions,
    supported,
    unreadablePaths,
    issues: issues + merged.conflicts,
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
): Promise<ParsedFile> {
  const fallbackSessionId = basename(file, ".jsonl");
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    return {
      file,
      issues: 1,
      messages: [],
      reason: "unreadable",
      sessionId: fallbackSessionId,
      supported: false,
    };
  }
  let sessionId = fallbackSessionId;
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
    else if (unexplainedEmptyMessage(source, record)) issues += 1;
  }
  const partialWrite = !validJson(lastNonBlankLine(lines));
  return {
    file,
    issues,
    messages,
    reason: partialWrite
      ? "partial-write"
      : issues > 0
        ? "malformed-record"
        : undefined,
    sessionId,
    supported,
  };
}

interface ParsedFile {
  file: string;
  issues: number;
  messages: CollectedMessage[];
  reason?: SourceCoverageReason;
  sessionId: string;
  supported: boolean;
}

function mergeSessions(
  source: LocalSource,
  fragments: ParsedFile[],
  date: string,
  timeZone: string,
): { conflicts: number; sessions: CollectedSession[] } {
  const groups = new Map<string, ParsedFile[]>();
  for (const fragment of fragments) {
    const group = groups.get(fragment.sessionId) ?? [];
    group.push(fragment);
    groups.set(fragment.sessionId, group);
  }
  let conflicts = 0;
  const sessions: CollectedSession[] = [];
  for (const [id, group] of groups) {
    const records = new Map<string, CollectedMessage>();
    let conflict = false;
    for (const fragment of group) {
      for (const message of fragment.messages) {
        const existing = records.get(message.id);
        if (
          existing &&
          (existing.timestamp !== message.timestamp ||
            existing.role !== message.role ||
            existing.text !== message.text)
        ) {
          conflict = true;
        } else records.set(message.id, message);
      }
    }
    if (conflict) {
      conflicts += 1;
      continue;
    }
    const messages = [...records.values()]
      .filter((message) => localDate(message.timestamp, timeZone) <= date)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (
      !messages.some(
        (message) => localDate(message.timestamp, timeZone) === date,
      )
    )
      continue;
    const first = messages[0];
    if (!first) continue;
    sessions.push({
      id,
      source,
      file: group[0]?.file ?? "",
      startedAt: first.timestamp,
      endedAt: messages.at(-1)?.timestamp ?? first.timestamp,
      messageCount: messages.length,
      issueCount: group.reduce((total, fragment) => total + fragment.issues, 0),
      messages,
    });
  }
  return { conflicts, sessions };
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
  const holder = objectAt(
    source === "claude-code" ? record.message : record.payload,
  );
  const role = holder && roleAt(holder.role);
  if (!role) return undefined;
  const { parts } = extractParts(holder.content);
  if (parts.length === 0) return undefined;
  const id =
    source === "claude-code"
      ? (stringAt(record.uuid) ?? fallbackId)
      : fallbackId;
  return { id, role, text: joinParts(parts), timestamp, parts };
}

/**
 * True when a conversation record yielded no message for a reason we cannot
 * explain, so the source must be reported incomplete rather than losing content
 * silently. Content that is only excluded deliberation is explained, not lost.
 */
function unexplainedEmptyMessage(
  source: LocalSource,
  record: Record<string, unknown>,
): boolean {
  if (!hasConversationRole(source, record)) return false;
  const holder = objectAt(
    source === "claude-code" ? record.message : record.payload,
  );
  return !extractParts(holder?.content).excludedOnly;
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

function joinParts(parts: readonly MessagePart[]): string {
  return parts.map((part) => part.text).join("\n");
}

/** Claude Code writes `text`; Codex writes `input_text` and `output_text`. */
const textKinds = ["text", "input_text", "output_text"];

/**
 * Internal deliberation, excluded by decision D1: it is not observable
 * progress. A message holding nothing else is dropped without counting as an
 * issue, because the exclusion explains where it went.
 */
const deliberationKinds = ["thinking", "reasoning"];

/**
 * Normalizes conversation content into parts. Every kind that is not excluded
 * deliberation keeps a placeholder, so nothing disappears without a trace.
 * Image bytes are never retained. `excludedOnly` reports that the content held
 * blocks and all of them were excluded deliberation.
 */
function extractParts(content: unknown): {
  parts: MessagePart[];
  excludedOnly: boolean;
} {
  if (typeof content === "string")
    return {
      parts: content.trim() ? [{ kind: "text", text: content }] : [],
      excludedOnly: false,
    };
  if (!Array.isArray(content)) return { parts: [], excludedOnly: false };
  const parts: MessagePart[] = [];
  let excluded = 0;
  for (const entry of content) {
    const block = objectAt(entry);
    if (!block) continue;
    const kind = stringAt(block.type);
    if (kind !== undefined && deliberationKinds.includes(kind)) {
      excluded += 1;
      continue;
    }
    if (kind === undefined || textKinds.includes(kind)) {
      const text = stringAt(block.text);
      if (text?.trim()) parts.push({ kind: "text", text });
      continue;
    }
    if (kind === "image") {
      parts.push({ kind: "image", text: imagePlaceholder(block) });
      continue;
    }
    if (kind === "tool_use") {
      parts.push({ kind: "tool_use", text: toolUsePlaceholder(block) });
      continue;
    }
    if (kind === "tool_result") {
      parts.push({ kind: "tool_result", text: toolResultPlaceholder(block) });
      continue;
    }
    parts.push({ kind: "other", text: `[${kind}]` });
  }
  return {
    parts,
    excludedOnly: parts.length === 0 && excluded > 0,
  };
}

function imagePlaceholder(block: Record<string, unknown>): string {
  const mediaType =
    stringAt(objectAt(block.source)?.media_type) ?? stringAt(block.media_type);
  return mediaType ? `[image ${mediaType}]` : "[image]";
}

function toolUsePlaceholder(block: Record<string, unknown>): string {
  const name = stringAt(block.name) ?? "tool";
  const input = objectAt(block.input);
  return input
    ? `[tool_use ${name} ${JSON.stringify(input)}]`
    : `[tool_use ${name}]`;
}

function toolResultPlaceholder(block: Record<string, unknown>): string {
  const outcome = block.is_error === true ? "error" : "ok";
  const content = resultText(block.content);
  return content
    ? `[tool_result ${outcome}]\n${content}`
    : `[tool_result ${outcome}]`;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((entry) => stringAt(objectAt(entry)?.text))
    .filter((text): text is string => Boolean(text))
    .join("\n");
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
