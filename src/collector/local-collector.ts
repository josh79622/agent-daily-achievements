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

export interface CollectionSummary {
  date: string;
  sources: Array<{ source: LocalSource; sessions: number; issues: number }>;
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
      const sources: CollectionSummary["sources"] = [];
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
        sources.push({
          source,
          sessions: result.sessions.length,
          issues: result.issues,
        });
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
): Promise<{ sessions: CollectedSession[]; issues: number }> {
  const files = (await Promise.all(paths.map(jsonlFilesAt))).flat();
  let issues = 0;
  const sessions: CollectedSession[] = [];
  for (const file of files) {
    const parsed = await parseFile(source, file, date, timeZone);
    issues += parsed.issues;
    if (parsed.session) sessions.push(parsed.session);
  }
  return { sessions, issues };
}

async function jsonlFilesAt(path: string): Promise<string[]> {
  try {
    const info = await stat(path);
    if (info.isFile()) return path.endsWith(".jsonl") ? [path] : [];
    const entries = await readdir(path, { recursive: true });
    return entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => join(path, entry));
  } catch {
    return [];
  }
}

async function parseFile(
  source: LocalSource,
  file: string,
  date: string,
  timeZone: string,
): Promise<{ session?: CollectedSession; issues: number }> {
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    return { issues: 1 };
  }
  const messages: CollectedMessage[] = [];
  let sessionId = basename(file, ".jsonl");
  let issues = 0;
  for (const [index, line] of contents.split("\n").entries()) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      issues += 1;
      continue;
    }
    sessionId = sessionIdFrom(source, record) ?? sessionId;
    const message = messageFrom(
      source,
      record,
      `${basename(file)}:${index + 1}`,
    );
    if (message && localDate(message.timestamp, timeZone) === date)
      messages.push(message);
  }
  if (messages.length === 0) return { issues };
  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const firstMessage = messages[0];
  if (!firstMessage) return { issues };
  return {
    issues,
    session: {
      id: sessionId,
      source,
      file,
      startedAt: firstMessage.timestamp,
      endedAt: messages.at(-1)?.timestamp ?? firstMessage.timestamp,
      messageCount: messages.length,
      issueCount: issues,
      messages,
    },
  };
}

function sessionIdFrom(
  source: LocalSource,
  record: Record<string, unknown>,
): string | undefined {
  if (source === "claude-code") return stringAt(record.sessionId);
  const payload = objectAt(record.payload);
  return stringAt(payload?.id);
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
