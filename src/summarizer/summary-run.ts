// Real summarizer run: invokes the selected CLI on a server-built payload and
// assembles an AchievementReportV1. Design and open questions:
// docs/plans/2026-09-18-summary-run-design.md

import { join } from "node:path";

import {
  assembleReport,
  validateSummaryCandidate,
  type AchievementReportStore,
  type AchievementReportV1,
} from "../report/contract.js";
import {
  decideAfterAttempt,
  maxSummaryAttempts,
} from "../report/summary-retry.js";
import { buildSummaryRequestText } from "../report/summary-prompt.js";
import type { SummaryProvider } from "../storage/summary-permission.js";
import type { SummaryRequest, SummaryRunner } from "../server/app.js";
import {
  claudeArgs,
  codexArgs,
  type ProbeProcessRunner,
  type ProbeTempDirs,
  type ReplyFileReader,
  type ReplyFileResult,
  type ProbeRunResult,
} from "./readiness-probe.js";
import type { SummarizerModelsService } from "./model-settings.js";

// A real day's payload and reply are both far larger than the readiness
// probe's one-word exchange, and up to three attempts run in sequence.
// Provisional (design doc "Open for Josh" item 2): not yet measured against a
// real run.
export const summaryAttemptTimeoutMs = 10 * 60_000;
export const summaryMaxReplyBytes = 512 * 1024;

export type SummaryLocator = (
  provider: SummaryProvider,
) => Promise<string | undefined>;

/** Everything one attempt tried to say happened, before the report is built. */
type AttemptOutcome =
  { kind: "no-reply" } | { kind: "reply"; candidate: unknown };

export function createSummaryRunner({
  locate,
  models,
  runner,
  tempDirs,
  readReplyFile,
  reportStore,
}: {
  locate: SummaryLocator;
  models: SummarizerModelsService;
  runner: ProbeProcessRunner;
  tempDirs: ProbeTempDirs;
  readReplyFile: ReplyFileReader;
  reportStore: AchievementReportStore;
}): SummaryRunner {
  async function runAttempt(
    provider: SummaryProvider,
    executablePath: string,
    model: string | undefined,
    effort: string | undefined,
    promptText: string,
  ): Promise<AttemptOutcome> {
    let directory: string;
    try {
      directory = await tempDirs.create();
    } catch {
      return { kind: "no-reply" };
    }
    try {
      const replyFile = join(directory, "reply.txt");
      const args =
        provider === "claude-code"
          ? claudeArgs(model, effort, promptText)
          : codexArgs(model, effort, directory, replyFile, promptText);
      let result: ProbeRunResult;
      try {
        result = await runner({
          file: executablePath,
          args,
          cwd: directory,
          captureStdout: provider === "claude-code",
          timeoutMs: summaryAttemptTimeoutMs,
          maxStdoutBytes: summaryMaxReplyBytes,
        });
      } catch {
        return { kind: "no-reply" };
      }
      if (result.kind !== "exited" || result.exitCode !== 0)
        return { kind: "no-reply" };
      const reply =
        provider === "claude-code"
          ? claudeReplyText(result)
          : await codexReplyText(readReplyFile, replyFile);
      if (reply === undefined) return { kind: "no-reply" };
      return { kind: "reply", candidate: parseCandidateJson(reply) };
    } finally {
      await tempDirs.remove(directory).catch(() => {});
    }
  }

  return {
    async run(provider, request) {
      const executablePath = await locate(provider);
      if (!executablePath) {
        await save(request, { kind: "unavailable" });
        throw new Error(`${provider} is not available.`);
      }
      const settings = await models.effectiveSettings(provider);
      const promptText = buildSummaryRequestText(request.payload.payloadJson);

      for (let attempt = 1; attempt <= maxSummaryAttempts; attempt++) {
        const outcome = await runAttempt(
          provider,
          executablePath,
          settings.model,
          settings.effort,
          promptText,
        );
        if (outcome.kind === "no-reply") {
          if (attempt === maxSummaryAttempts) {
            await save(request, { kind: "unavailable" });
            throw new Error(`${provider} produced no usable reply.`);
          }
          continue;
        }
        const validation = validateSummaryCandidate(outcome.candidate, {
          manifest: request.payload.manifest,
          coverage: request.payload.coverage,
        });
        const decision = decideAfterAttempt({ attempt, validation });
        if (decision.action === "reanalyse") continue;
        await save(request, {
          kind: "candidate",
          candidate: outcome.candidate,
        });
        if (
          decision.action === "stop" &&
          decision.issue === "too-many-achievements"
        )
          throw new Error(
            `${provider} exceeded the achievement limit on every attempt.`,
          );
        return;
      }
    },
  };

  async function save(
    request: SummaryRequest,
    summary: Parameters<typeof assembleReport>[0]["summary"],
  ): Promise<AchievementReportV1> {
    const report = assembleReport({
      date: request.payload.date,
      // The payload builder records the collection's own timezone; nothing
      // here re-derives or overrides it.
      timezone: request.payload.timeZone,
      manifest: request.payload.manifest,
      coverage: request.payload.coverage,
      summary,
    });
    await reportStore.save(report);
    return report;
  }
}

function claudeReplyText(
  result: Extract<ProbeRunResult, { kind: "exited" }>,
): string | undefined {
  if (result.stdoutTooLarge) return undefined;
  let envelope: unknown;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
  if (
    typeof envelope !== "object" ||
    envelope === null ||
    Array.isArray(envelope)
  )
    return undefined;
  const { is_error: isError, result: reply } = envelope as Record<
    string,
    unknown
  >;
  if (isError === true) return undefined;
  return typeof reply === "string" && reply.trim() ? reply : undefined;
}

async function codexReplyText(
  readReplyFile: ReplyFileReader,
  replyFile: string,
): Promise<string | undefined> {
  let reply: ReplyFileResult;
  try {
    reply = await readReplyFile(replyFile, summaryMaxReplyBytes);
  } catch {
    return undefined;
  }
  return reply.kind === "text" && reply.text.trim() ? reply.text : undefined;
}

/**
 * A summarizer reply is asked to be strict JSON; a Markdown code fence around
 * it is tolerated. Anything else that fails to parse becomes a placeholder
 * object with no `achievements` key, which `validateSummaryCandidate` already
 * rejects as `invalid-shape` — no separate "unparseable" path is needed.
 */
export function parseCandidateJson(reply: string): unknown {
  const stripped = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(stripped);
  } catch {
    return { __unparseable: true };
  }
}
