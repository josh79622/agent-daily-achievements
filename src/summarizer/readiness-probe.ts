// Zero-conversation readiness (liveness) probe. Design and approvals:
// docs/plans/2026-09-17-readiness-probe-design.md

import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SummaryProvider } from "../storage/summary-permission.js";

export const probePrompt =
  "Connectivity check. Reply with the single word: ready";
export const probeTimeoutMs = 60_000;
export const maxReplyBytes = 64 * 1024;

// Lowest-cost models per the Claude Code model-config and Codex models docs,
// read 2026-09-17. `gpt-5.6-luna` is a fixed ID and must be updated on
// retirement.
export const lowestCostModels: Record<SummaryProvider, string> = {
  "claude-code": "haiku",
  codex: "gpt-5.6-luna",
};

const disabledCodexFeatures = [
  "shell_tool",
  "unified_exec",
  "browser_use",
  "computer_use",
  "apps",
  "plugins",
  "image_generation",
  "view_image",
];

export type ProbeFailureReason =
  | "could-not-start"
  | "timed-out"
  | "exited-with-error"
  | "empty-reply"
  | "unreadable-reply"
  | "reply-too-large";

export type ProbeAttempt = "lowest-cost-model" | "summary-model";

export interface ProbeAttemptFailure {
  attempt: ProbeAttempt;
  reason: ProbeFailureReason;
}

export type ProbeOutcome =
  { ok: true } | { ok: false; failures: ProbeAttemptFailure[] };

export type ReadinessProbe = (input: {
  provider: SummaryProvider;
  executablePath: string;
  /** Undefined means the CLI's default model. */
  summaryModel?: string;
}) => Promise<ProbeOutcome>;

export interface ProbeRunRequest {
  file: string;
  args: readonly string[];
  cwd: string;
  captureStdout: boolean;
  timeoutMs: number;
  maxStdoutBytes: number;
}

export type ProbeRunResult =
  | { kind: "could-not-start" }
  | { kind: "timed-out" }
  | {
      kind: "exited";
      exitCode: number | null;
      stdout: string;
      stdoutTooLarge: boolean;
    };

export type ProbeProcessRunner = (
  request: ProbeRunRequest,
) => Promise<ProbeRunResult>;

export interface ProbeTempDirs {
  create(): Promise<string>;
  remove(directory: string): Promise<void>;
}

export type ReplyFileResult =
  | { kind: "text"; text: string }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "too-large" };

export type ReplyFileReader = (
  path: string,
  maxBytes: number,
) => Promise<ReplyFileResult>;

export function createReadinessProbe({
  runner,
  tempDirs,
  readReplyFile,
}: {
  runner: ProbeProcessRunner;
  tempDirs: ProbeTempDirs;
  readReplyFile: ReplyFileReader;
}): ReadinessProbe {
  async function attempt(
    provider: SummaryProvider,
    executablePath: string,
    model: string | undefined,
  ): Promise<ProbeFailureReason | undefined> {
    let directory: string;
    try {
      directory = await tempDirs.create();
    } catch {
      return "could-not-start";
    }
    try {
      const replyFile = join(directory, "reply.txt");
      const args =
        provider === "claude-code"
          ? claudeArgs(model)
          : codexArgs(model, directory, replyFile);
      let result: ProbeRunResult;
      try {
        result = await runner({
          file: executablePath,
          args,
          cwd: directory,
          captureStdout: provider === "claude-code",
          timeoutMs: probeTimeoutMs,
          maxStdoutBytes: maxReplyBytes,
        });
      } catch {
        return "could-not-start";
      }
      if (result.kind !== "exited") return result.kind;
      if (result.exitCode !== 0) return "exited-with-error";
      return provider === "claude-code"
        ? claudeReply(result)
        : await codexReply(replyFile);
    } finally {
      await tempDirs.remove(directory).catch(() => {});
    }
  }

  async function codexReply(
    replyFile: string,
  ): Promise<ProbeFailureReason | undefined> {
    let reply: ReplyFileResult;
    try {
      reply = await readReplyFile(replyFile, maxReplyBytes);
    } catch {
      return "unreadable-reply";
    }
    if (reply.kind === "missing") return "empty-reply";
    if (reply.kind === "unreadable") return "unreadable-reply";
    if (reply.kind === "too-large") return "reply-too-large";
    return reply.text.trim() ? undefined : "empty-reply";
  }

  return async ({ provider, executablePath, summaryModel }) => {
    const lowest = lowestCostModels[provider];
    const attempts: Array<[ProbeAttempt, string | undefined]> = [
      ["lowest-cost-model", lowest],
    ];
    if (summaryModel !== lowest) attempts.push(["summary-model", summaryModel]);

    const failures: ProbeAttemptFailure[] = [];
    for (const [name, model] of attempts) {
      const reason = await attempt(provider, executablePath, model);
      if (!reason) return { ok: true };
      failures.push({ attempt: name, reason });
    }
    return { ok: false, failures };
  };
}

function claudeArgs(model: string | undefined): string[] {
  return [
    "-p",
    "--tools",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--output-format",
    "json",
    ...(model === undefined ? [] : ["--model", model]),
    probePrompt,
  ];
}

function codexArgs(
  model: string | undefined,
  directory: string,
  replyFile: string,
): string[] {
  return [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "-o",
    replyFile,
    ...(model === undefined ? [] : ["-m", model]),
    "-C",
    directory,
    ...disabledCodexFeatures.flatMap((feature) => ["--disable", feature]),
    probePrompt,
  ];
}

// Claude Code's `--output-format json` envelope. The reply field name is
// unverified until the first real run; anything unexpected fails closed.
function claudeReply(
  result: Extract<ProbeRunResult, { kind: "exited" }>,
): ProbeFailureReason | undefined {
  if (result.stdoutTooLarge) return "reply-too-large";
  let envelope: unknown;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    return "unreadable-reply";
  }
  if (
    typeof envelope !== "object" ||
    envelope === null ||
    Array.isArray(envelope)
  )
    return "unreadable-reply";
  const { is_error: isError, result: reply } = envelope as Record<
    string,
    unknown
  >;
  if (isError === true) return "exited-with-error";
  return typeof reply === "string" && reply.trim() ? undefined : "empty-reply";
}

interface ChildLike extends EventEmitter {
  stdout: EventEmitter | null;
  kill(signal: NodeJS.Signals): boolean;
}

export type ProbeSpawn = (
  file: string,
  args: readonly string[],
  options: {
    cwd: string;
    shell: false;
    stdio: ["ignore", "pipe" | "ignore", "ignore"];
  },
) => ChildLike;

const defaultSpawn: ProbeSpawn = (file, args, options) =>
  nodeSpawn(file, [...args], options);

/** Runs one attempt: no shell, stderr ignored, stdout capped, hard time limit. */
export function createProcessRunner({
  spawn = defaultSpawn,
  graceMs = 5_000,
}: { spawn?: ProbeSpawn; graceMs?: number } = {}): ProbeProcessRunner {
  return (request) =>
    new Promise((resolve) => {
      let child: ChildLike;
      try {
        child = spawn(request.file, request.args, {
          cwd: request.cwd,
          shell: false,
          stdio: [
            "ignore",
            request.captureStdout ? "pipe" : "ignore",
            "ignore",
          ],
        });
      } catch {
        resolve({ kind: "could-not-start" });
        return;
      }

      let settled = false;
      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;

      const finish = (result: ProbeRunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(killTimer);
        resolve(result);
      };

      child.stdout?.on("data", (chunk: unknown) => {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(String(chunk));
        const room = request.maxStdoutBytes - size;
        if (buffer.length > room) {
          tooLarge = true;
          if (room > 0) chunks.push(buffer.subarray(0, room));
          size = request.maxStdoutBytes;
          return;
        }
        chunks.push(buffer);
        size += buffer.length;
      });
      child.on("error", () =>
        finish(timedOut ? { kind: "timed-out" } : { kind: "could-not-start" }),
      );
      child.on("close", (exitCode: number | null) =>
        finish(
          timedOut
            ? { kind: "timed-out" }
            : {
                kind: "exited",
                exitCode,
                stdout: Buffer.concat(chunks).toString("utf8"),
                stdoutTooLarge: tooLarge,
              },
        ),
      );

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          child.kill("SIGKILL");
          finish({ kind: "timed-out" });
        }, graceMs);
      }, request.timeoutMs);
    });
}

export const osProbeTempDirs: ProbeTempDirs = {
  create: () => mkdtemp(join(tmpdir(), "daily-achievements-probe-")),
  remove: (directory) => rm(directory, { recursive: true, force: true }),
};

export const readReplyFileFromDisk: ReplyFileReader = async (
  path,
  maxBytes,
) => {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "missing" }
      : { kind: "unreadable" };
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return { kind: "unreadable" };
    if (stats.size > maxBytes) return { kind: "too-large" };
    return { kind: "text", text: await handle.readFile("utf8") };
  } catch {
    return { kind: "unreadable" };
  } finally {
    await handle.close();
  }
};
