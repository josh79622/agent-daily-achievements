import { existsSync, readdirSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export type LocalSource = "claude-code" | "codex" | "antigravity";

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
  project?: string;
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
  antigravityDirectories?: string[];
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
        const paths = pathsForSource(source, options);
        const result = await collectSource(source, paths, date, timeZone);
        sources.push(sourceCoverage(source, result));
        sessions.push(...result.sessions);
      }
      return { date, timeZone, sources, sessions };
    },
  };
}

function pathsForSource(
  source: LocalSource,
  options: LocalCollectorOptions,
): string[] {
  if (source === "claude-code") return options.claudeDirectories;
  if (source === "codex") return options.codexDirectories;
  return (
    options.antigravityDirectories ?? [
      join(homedir(), ".gemini/antigravity/brain"),
    ]
  );
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
  const locations = await Promise.all(
    paths.map((path) => jsonlFilesAt(path, source)),
  );
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

async function jsonlFilesAt(
  path: string,
  source?: LocalSource,
): Promise<{
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
          .filter((entry) => {
            if (!entry.endsWith(".jsonl")) return false;
            if (source === "antigravity") {
              if (entry.includes("/chunks/") || entry.startsWith("chunks/"))
                return false;
              if (entry.endsWith("transcript_full.jsonl")) return false;
              if (entry.includes(".system_generated")) {
                return basename(entry) === "transcript.jsonl";
              }
            }
            return true;
          })
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

function sessionIdFromFile(source: LocalSource, file: string): string {
  if (source === "antigravity") {
    const match =
      file.match(/\/brain\/([^/]+)\//) ??
      file.match(/\/([^/]+)\/\.system_generated\//);
    if (match?.[1]) return match[1];
  }
  return basename(file, ".jsonl");
}

async function parseFile(
  source: LocalSource,
  file: string,
): Promise<ParsedFile> {
  const fallbackSessionId = sessionIdFromFile(source, file);
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
  let project: string | undefined;
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
    if (isExcludedRecord(source, record)) continue;
    sessionId = sessionIdFrom(source, record) ?? sessionId;
    if (!project) {
      project = extractProjectFromRecord(source, record);
    }
    if (
      hasConversationRole(source, record) &&
      !validTimestamp(recordTimestamp(source, record))
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
  if (!project) {
    project = extractProjectFromPath(source, file);
  }
  const partialWrite = !validJson(lastNonBlankLine(lines));
  return {
    file,
    issues,
    messages,
    ...(project ? { project } : {}),
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
  project?: string;
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
      .filter((message) => reportDateFor(message.timestamp, timeZone) <= date)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (
      !messages.some(
        (message) => reportDateFor(message.timestamp, timeZone) === date,
      )
    )
      continue;
    const first = messages[0];
    if (!first) continue;
    const project = group.find((f) => f.project)?.project;
    sessions.push({
      id,
      source,
      file: group[0]?.file ?? "",
      startedAt: first.timestamp,
      endedAt: messages.at(-1)?.timestamp ?? first.timestamp,
      messageCount: messages.length,
      issueCount: group.reduce((total, fragment) => total + fragment.issues, 0),
      messages,
      ...(project ? { project } : {}),
    });
  }
  return { conflicts, sessions };
}

function cleanProjectName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const unquoted = name
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  const base = basename(unquoted);
  const cleaned = base.replace(/^["']|["']$/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "/") return undefined;
  return cleaned;
}

const GENERIC_SCRATCHPAD_NAMES = new Set([
  ".tmp",
  "cache",
  "scratch",
  "scratchpad",
  "temp",
  "tmp",
  "xreview",
]);

function findDirectoryFromSlug(slug: string): string | undefined {
  if (!slug.startsWith("-")) return undefined;
  let current = "/";
  let remaining = slug.slice(1);

  while (remaining.length > 0) {
    const directPath = join(current, ...remaining.split("-"));
    try {
      if (existsSync(directPath) && statSync(directPath).isDirectory()) {
        return directPath;
      }
    } catch {
      // Ignore filesystem access errors
    }

    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      break;
    }

    const dirNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => b.length - a.length);

    let foundNext = false;
    for (const dirName of dirNames) {
      const dirSlug = dirName.replace(/[^a-zA-Z0-9]/g, "-");
      if (remaining.toLowerCase() === dirSlug.toLowerCase()) {
        return join(current, dirName);
      }
      if (remaining.toLowerCase().startsWith(dirSlug.toLowerCase() + "-")) {
        current = join(current, dirName);
        remaining = remaining.slice(dirSlug.length + 1);
        foundNext = true;
        break;
      }
    }

    if (!foundNext) {
      const nextHyphen = remaining.indexOf("-");
      const token =
        nextHyphen === -1 ? remaining : remaining.slice(0, nextHyphen);
      if (token) {
        const nextPath = join(current, token);
        try {
          if (existsSync(nextPath) && statSync(nextPath).isDirectory()) {
            current = nextPath;
            remaining =
              nextHyphen === -1 ? "" : remaining.slice(nextHyphen + 1);
            foundNext = true;
          }
        } catch {
          // Ignore filesystem access errors
        }
      }
    }

    if (!foundNext) break;
  }

  return undefined;
}

export function projectFromCwd(cwd: string | undefined): string | undefined {
  if (!cwd?.trim()) return undefined;
  const trimmed = cwd.trim();

  const claudeTmpMatch = trimmed.match(
    /(?:\/private)?\/tmp\/claude-\d+\/(-[^/]+)/,
  );
  if (claudeTmpMatch?.[1]) {
    const slug = claudeTmpMatch[1];
    const candidate = findDirectoryFromSlug(slug);
    if (candidate) {
      const candidateBase = basename(candidate);
      if (!GENERIC_SCRATCHPAD_NAMES.has(candidateBase.toLowerCase())) {
        return cleanProjectName(candidateBase);
      }
      const parent = dirname(candidate);
      if (parent && parent !== candidate && parent !== "/" && parent !== ".") {
        return cleanProjectName(basename(parent));
      }
    }
    const parts = slug.split("-").filter(Boolean);
    const nonGenericParts = parts.filter(
      (part) => !GENERIC_SCRATCHPAD_NAMES.has(part.toLowerCase()),
    );
    const lastPart = nonGenericParts.at(-1);
    if (!lastPart) return undefined;
    return cleanProjectName(lastPart);
  }

  let current = trimmed;
  while (current) {
    const base = basename(current);
    if (!base || base === "/" || base === ".") {
      return undefined;
    }
    if (
      GENERIC_SCRATCHPAD_NAMES.has(base.toLowerCase()) ||
      (base.toLowerCase() === "private" && dirname(current) === "/")
    ) {
      const parent = dirname(current);
      if (
        !parent ||
        parent === current ||
        parent === "/" ||
        parent === "." ||
        parent === "/private"
      ) {
        return undefined;
      }
      current = parent;
      continue;
    }
    return cleanProjectName(base);
  }

  return undefined;
}

function extractProjectFromRecord(
  source: LocalSource,
  record: Record<string, unknown>,
): string | undefined {
  if (source === "claude-code") {
    const cwd = stringAt(record.cwd);
    const cwdProject = projectFromCwd(cwd);
    if (cwdProject) return cwdProject;
    const attachment = objectAt(record.attachment);
    const snapshot = objectAt(attachment?.snapshot);
    const workingDirectory = stringAt(snapshot?.workingDirectory);
    const workDirProject = projectFromCwd(workingDirectory);
    if (workDirProject) return workDirProject;
    return undefined;
  }
  if (source === "codex") {
    const payload = objectAt(record.payload);
    const cwd = stringAt(payload?.cwd);
    const cwdProject = projectFromCwd(cwd);
    if (cwdProject) return cwdProject;
    const git = objectAt(payload?.git);
    const repoUrl =
      stringAt(git?.repository_url) ?? stringAt(payload?.repository_url);
    if (repoUrl?.trim()) {
      return cleanProjectName(basename(repoUrl.trim().replace(/\.git$/, "")));
    }
    return undefined;
  }
  if (source === "antigravity") {
    if (Array.isArray(record.tool_calls)) {
      for (const call of record.tool_calls) {
        const callObj = objectAt(call);
        const args = objectAt(callObj?.args);
        if (args) {
          const cwd = stringAt(args.Cwd) ?? stringAt(args.cwd);
          const cwdProject = projectFromCwd(cwd);
          if (cwdProject) return cwdProject;
          if (
            Array.isArray(args.workspaceUris) &&
            args.workspaceUris.length > 0
          ) {
            const uri = stringAt(args.workspaceUris[0]);
            const uriProject = projectFromCwd(uri);
            if (uriProject) return uriProject;
          }
        }
      }
    }
    if (
      Array.isArray(record.workspaceUris) &&
      record.workspaceUris.length > 0
    ) {
      const uri = stringAt(record.workspaceUris[0]);
      const uriProject = projectFromCwd(uri);
      if (uriProject) return uriProject;
    }
    if (
      typeof record.workspaceUris === "string" &&
      record.workspaceUris.trim()
    ) {
      const uriProject = projectFromCwd(record.workspaceUris.trim());
      if (uriProject) return uriProject;
    }
    if (
      Array.isArray(record.workspace_uris) &&
      record.workspace_uris.length > 0
    ) {
      const uri = stringAt(record.workspace_uris[0]);
      const uriProject = projectFromCwd(uri);
      if (uriProject) return uriProject;
    }
    return undefined;
  }
  return undefined;
}

function extractProjectFromPath(
  source: LocalSource,
  file: string,
): string | undefined {
  if (source === "claude-code") {
    const match = file.match(/\.claude\/projects\/([^/]+)/);
    if (match?.[1]) {
      const dirName = match[1];
      if (dirName.startsWith("-")) {
        const parts = dirName.split("-").filter(Boolean);
        const last = parts.at(-1);
        if (last?.trim()) return cleanProjectName(last.trim());
      }
      return cleanProjectName(dirName);
    }
  }
  return undefined;
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
  if (source === "antigravity") {
    return Boolean(
      (stringAt(record.created_at) || typeof record.step_index === "number") &&
      (record.source === "MODEL" ||
        record.source === "USER_EXPLICIT" ||
        record.source === "USER" ||
        record.type === "USER_INPUT" ||
        record.type === "PLANNER_RESPONSE" ||
        record.type === "GENERIC"),
    );
  }
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
  if (source === "antigravity") return undefined;
  if (source === "claude-code") return stringAt(record.sessionId);
  const payload = objectAt(record.payload);
  return stringAt(payload?.id);
}

function recordTimestamp(
  source: LocalSource,
  record: Record<string, unknown>,
): string | undefined {
  if (source === "antigravity") return stringAt(record.created_at);
  return stringAt(record.timestamp);
}

function isExcludedRecord(
  source: LocalSource,
  record: Record<string, unknown>,
): boolean {
  if (source === "claude-code") {
    return (
      !stringAt(record.sessionId) && Boolean(stringAt(record.parentSessionId))
    );
  }
  if (source === "antigravity") {
    return (
      record.source === "SYSTEM" ||
      record.type === "CHECKPOINT" ||
      record.type === "SYSTEM_MESSAGE"
    );
  }
  return false;
}

function messageFrom(
  source: LocalSource,
  record: Record<string, unknown>,
  fallbackId: string,
): CollectedMessage | undefined {
  if (source === "antigravity") {
    return messageFromAntigravity(record, fallbackId);
  }
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

function messageFromAntigravity(
  record: Record<string, unknown>,
  fallbackId: string,
): CollectedMessage | undefined {
  const timestamp = stringAt(record.created_at);
  if (!timestamp) return undefined;

  const id =
    typeof record.step_index === "number"
      ? `step-${record.step_index}`
      : fallbackId;

  const source = stringAt(record.source);
  const type = stringAt(record.type);

  if (
    source === "USER_EXPLICIT" ||
    source === "USER" ||
    type === "USER_INPUT"
  ) {
    let rawText = stringAt(record.content) ?? "";
    const match = rawText.match(
      /^<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>$/,
    );
    if (match?.[1]) rawText = match[1];
    if (!rawText.trim()) return undefined;
    return {
      id,
      role: "user",
      text: rawText,
      timestamp,
      parts: [{ kind: "text", text: rawText }],
    };
  }

  if (source === "MODEL") {
    if (type === "PLANNER_RESPONSE") {
      const parts: MessagePart[] = [];
      if (Array.isArray(record.tool_calls)) {
        for (const call of record.tool_calls) {
          const callObj = objectAt(call);
          if (!callObj) continue;
          const name = stringAt(callObj.name) ?? "tool";
          const input = objectAt(callObj.args);
          parts.push({
            kind: "tool_use",
            text: input
              ? `[tool_use ${name} ${JSON.stringify(input)}]`
              : `[tool_use ${name}]`,
          });
        }
      }
      const content = stringAt(record.content);
      if (content?.trim()) {
        parts.push({ kind: "text", text: content });
      }
      if (parts.length === 0) return undefined;
      return {
        id,
        role: "assistant",
        text: joinParts(parts),
        timestamp,
        parts,
      };
    }

    if (type === "GENERIC") {
      const content = stringAt(record.content);
      const status = stringAt(record.status);
      const outcome = status === "ERROR" ? "error" : "ok";
      const text = content?.trim()
        ? `[tool_result ${outcome}]\n${content}`
        : `[tool_result ${outcome}]`;
      return {
        id,
        role: "assistant",
        text,
        timestamp,
        parts: [{ kind: "tool_result", text }],
      };
    }
  }

  return undefined;
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
  if (source === "antigravity") {
    if (
      record.source === "SYSTEM" ||
      record.type === "CHECKPOINT" ||
      record.type === "SYSTEM_MESSAGE"
    ) {
      return false;
    }
    if (
      record.type === "PLANNER_RESPONSE" &&
      stringAt(record.thinking) &&
      !record.content &&
      (!Array.isArray(record.tool_calls) || record.tool_calls.length === 0)
    ) {
      return false;
    }
    return Boolean(
      record.source === "MODEL" ||
      record.source === "USER_EXPLICIT" ||
      record.source === "USER" ||
      record.type === "USER_INPUT",
    );
  }
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
  if (source === "antigravity") {
    return (
      record.source === "USER_EXPLICIT" ||
      record.source === "USER" ||
      record.type === "USER_INPUT" ||
      record.source === "MODEL"
    );
  }
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

/**
 * The single place that decides what report day a record belongs to
 * (decision: docs/decisions/2026-09-21-seven-am-report-window.md). A report
 * covers `[D 07:00, D+1 07:00)` in `timeZone`, filed under `D`: shift the
 * timestamp back seven wall-clock hours in that zone, then take the
 * resulting calendar date.
 *
 * The subtraction happens on the zone's wall-clock components, not on the
 * UTC instant, so a daylight-saving change never skips or doubles a day
 * (S1-6): the window always starts at local 07:00 regardless of how many
 * real hours elapsed since midnight that day.
 */
export function reportDateFor(timestamp: string, timeZone: string): string {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime()))
    throw new Error(`Invalid timestamp: ${timestamp}`);
  const wallClock = zonedWallClockAsUtc(instant, timeZone);
  const shifted = new Date(wallClock - sevenHoursMs);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const sevenHoursMs = 7 * 60 * 60 * 1000;

/**
 * The instant's wall-clock date and time in `timeZone`, re-expressed as a
 * UTC instant carrying the same numbers. Arithmetic on the result is pure
 * calendar/clock arithmetic, unaffected by the zone's real UTC offset or any
 * daylight-saving change on the day in question.
 */
function zonedWallClockAsUtc(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Some locales format local midnight as hour "24" rather than "00".
  const hour = get("hour") % 24;
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
}
