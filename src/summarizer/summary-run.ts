// Real summarizer run: invokes the selected CLI on a server-built payload and
// assembles an AchievementReportV1. Design and open questions:
// docs/plans/2026-09-18-summary-run-design.md

import { join } from "node:path";

import {
  assembleReport,
  validateSummaryCandidate,
  type Achievement,
  type AchievementReportStore,
  type AchievementReportV1,
  type CandidateValidation,
  type EvidenceManifest,
  type ValidationIssue,
} from "../report/contract.js";
import {
  decideAfterAttempt,
  maxSummaryAttempts,
} from "../report/summary-retry.js";
import {
  chunkReportDayPayload,
  summaryChunkMaxPayloadBytes,
  summaryChunkMaxReplyBytes,
} from "../report/summary-chunking.js";
import {
  buildChunkSummaryRequestText,
  buildMergeSummaryRequestText,
  buildSummaryRequestText,
  type IntermediateCandidate,
} from "../report/summary-prompt.js";
import type { SummaryProvider } from "../storage/summary-permission.js";
import type { SummaryRequest, SummaryRunner } from "../server/app.js";
import {
  agyArgs,
  claudeArgs,
  codexArgs,
  type ProbeProcessRunner,
  type ProbeTempDirs,
  type ReplyFileReader,
  type ReplyFileResult,
  type ProbeRunResult,
} from "./readiness-probe.js";
import type { SummarizerModelsService } from "./model-settings.js";

// A real day's prompt and reply are larger than the readiness probe's one-word
// exchange, and up to three attempts run in sequence.
export const summaryAttemptTimeoutMs = 10 * 60_000;
export const summaryMaxReplyBytes = summaryChunkMaxReplyBytes;

export type SummaryLocator = (
  provider: SummaryProvider,
) => Promise<string | undefined>;

/** Everything one attempt tried to say happened, before the report is built. */
type AttemptOutcome =
  { kind: "no-reply" } | { kind: "reply"; candidate: unknown };

type ValidatedAttempts =
  | { kind: "valid"; achievements: Achievement[] }
  | { kind: "unavailable" }
  | { kind: "invalid"; issue: ValidationIssue };

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
          : provider === "agy"
            ? agyArgs(model, effort)
            : codexArgs(model, effort, directory, replyFile, promptText);
      let result: ProbeRunResult;
      try {
        result = await runner({
          file: executablePath,
          args,
          cwd: directory,
          captureStdout: provider === "claude-code" || provider === "agy",
          timeoutMs: summaryAttemptTimeoutMs,
          maxStdoutBytes: summaryMaxReplyBytes,
          stdin: provider === "agy" ? promptText : undefined,
        });
      } catch {
        return { kind: "no-reply" };
      }
      if (result.kind !== "exited" || result.exitCode !== 0)
        return { kind: "no-reply" };
      const reply =
        provider === "claude-code"
          ? claudeReplyText(result)
          : provider === "agy"
            ? agyReplyText(result)
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
      const executable = executablePath;
      const settings = await models.effectiveSettings(provider);
      const options = request.language
        ? { language: request.language }
        : undefined;
      const chunking = chunkReportDayPayload(request.payload);
      if (chunking.kind === "message-too-large") {
        await save(request, chunking);
        return;
      }

      if (chunking.kind === "single") {
        const result = await runValidated(
          buildSummaryRequestText(chunking.chunks[0].payloadJson, options),
          request.payload.manifest,
        );
        if (result.kind === "valid") {
          await save(request, {
            kind: "candidate",
            candidate: { achievements: result.achievements },
          });
          return;
        }
        await save(
          request,
          result.kind === "unavailable"
            ? { kind: "unavailable" }
            : { kind: "invalid", issue: result.issue },
        );
        throw new Error(`${provider} produced no valid summary.`);
      }

      const candidates: Achievement[] = [];
      for (const chunk of chunking.chunks) {
        const result = await runValidated(
          buildChunkSummaryRequestText(chunk, options),
          chunk.manifest,
        );
        if (result.kind === "valid") {
          candidates.push(...result.achievements);
          continue;
        }
        await save(request, {
          kind: "chunk-failed",
          chunkIndex: chunk.index,
          sessions: chunk.manifest.map(({ source, recordId }) => ({
            source,
            recordId,
          })),
          ...(result.kind === "invalid" ? { issue: result.issue } : {}),
        });
        throw new Error(`${provider} failed chunk ${chunk.index}.`);
      }

      const mergeCandidates = compactCandidates(candidates, options);
      if (mergeCandidates === undefined) {
        await save(request, { kind: "merge-too-large" });
        return;
      }
      const merged = await runValidated(
        buildMergeSummaryRequestText(mergeCandidates, options),
        request.payload.manifest,
      );
      if (merged.kind === "valid") {
        await save(request, {
          kind: "candidate",
          candidate: { achievements: merged.achievements },
        });
        return;
      }
      await save(
        request,
        merged.kind === "unavailable"
          ? { kind: "merge-unavailable" }
          : { kind: "merge-invalid", issue: merged.issue },
      );
      throw new Error(`${provider} produced no valid merged summary.`);

      async function runValidated(
        promptText: string,
        manifest: EvidenceManifest,
      ): Promise<ValidatedAttempts> {
        for (let attempt = 1; attempt <= maxSummaryAttempts; attempt++) {
          const outcome = await runAttempt(
            provider,
            executable,
            settings.model,
            settings.effort,
            promptText,
          );
          if (outcome.kind === "no-reply") {
            if (attempt === maxSummaryAttempts) return { kind: "unavailable" };
            continue;
          }
          const validation: CandidateValidation = validateSummaryCandidate(
            outcome.candidate,
            {
              manifest,
              coverage: request.payload.coverage,
            },
          );
          const decision = decideAfterAttempt({ attempt, validation });
          if (decision.action === "accept")
            return { kind: "valid", achievements: decision.achievements };
          if (decision.action === "reanalyse") continue;
          return { kind: "invalid", issue: decision.issue };
        }
        return { kind: "unavailable" };
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

export function claudeReplyText(
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

export function agyReplyText(
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
  const { status, response: reply } = envelope as Record<string, unknown>;
  if (status !== "SUCCESS") return undefined;
  return typeof reply === "string" && reply.trim() ? reply : undefined;
}

export async function codexReplyText(
  readReplyFile: ReplyFileReader,
  replyFile: string,
  maxReplyBytes = summaryMaxReplyBytes,
): Promise<string | undefined> {
  let reply: ReplyFileResult;
  try {
    reply = await readReplyFile(replyFile, maxReplyBytes);
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

/**
 * Keep only the model's structured candidate fields before the final merge.
 * If the exact final prompt would exceed the shared input budget, remove
 * message-level identifiers one reference at a time, retaining session-level
 * source/recordId evidence. Nothing is truncated and no raw record text is
 * ever carried into the merge request.
 */
function compactCandidates(
  achievements: readonly Achievement[],
  options: { language?: string } | undefined,
): IntermediateCandidate[] | undefined {
  let candidates: IntermediateCandidate[] = achievements.map((achievement) => ({
    id: achievement.id,
    category: achievement.category,
    title: achievement.title,
    detail: achievement.detail,
    isPrimary: achievement.isPrimary === true,
    evidence: achievement.evidence.map((ref) => ({
      source: ref.source,
      recordId: ref.recordId,
      ...(ref.messageIds === undefined
        ? {}
        : { messageIds: [...ref.messageIds] }),
    })),
  }));
  if (mergeFits(candidates, options)) return candidates;

  for (
    let candidateIndex = 0;
    candidateIndex < candidates.length;
    candidateIndex++
  ) {
    const candidate = candidates[candidateIndex]!;
    for (let index = 0; index < candidate.evidence.length; index++) {
      const evidence = candidate.evidence[index]!;
      if (evidence.messageIds === undefined) continue;
      candidates = candidates.map((entry, entryIndex) =>
        entryIndex !== candidateIndex
          ? entry
          : {
              ...entry,
              evidence: entry.evidence.map((ref, evidenceIndex) =>
                evidenceIndex === index
                  ? { source: ref.source, recordId: ref.recordId }
                  : ref,
              ),
            },
      );
      if (mergeFits(candidates, options)) return candidates;
    }
  }
  return undefined;
}

function mergeFits(
  candidates: readonly IntermediateCandidate[],
  options: { language?: string } | undefined,
): boolean {
  return (
    Buffer.byteLength(buildMergeSummaryRequestText(candidates, options)) +
      summaryMaxReplyBytes <=
    summaryChunkMaxPayloadBytes
  );
}
