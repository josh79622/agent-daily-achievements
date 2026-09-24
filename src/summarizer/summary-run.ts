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
  type ReportSource,
  type ValidationIssue,
} from "../report/contract.js";
import {
  decideAfterAttempt,
  maxSummaryAttempts,
} from "../report/summary-retry.js";
import {
  chunkReportDayPayload,
  summaryChunkMaxPayloadBytes,
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
/**
 * Provider output needs a safety limit independent of the conservative
 * 64k-token prompt-input budget. Evidence-heavy valid JSON can exceed the
 * chunk prompt's 8 KiB reply reservation.
 */
export const summaryTransportMaxReplyBytes = 512 * 1024;

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

export function sanitizeCandidateEvidence(
  candidate: unknown,
  manifest: EvidenceManifest,
): unknown {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return candidate;
  }
  const candidateObj = candidate as Record<string, unknown>;
  if (!Array.isArray(candidateObj.achievements)) {
    return candidate;
  }
  for (const achievement of candidateObj.achievements) {
    if (
      typeof achievement === "object" &&
      achievement !== null &&
      Array.isArray((achievement as Record<string, unknown>).evidence)
    ) {
      const evidence = (achievement as Record<string, unknown>)
        .evidence as unknown[];
      for (const ref of evidence) {
        if (
          typeof ref === "object" &&
          ref !== null &&
          typeof (ref as Record<string, unknown>).source === "string" &&
          typeof (ref as Record<string, unknown>).recordId === "string"
        ) {
          const refObj = ref as Record<string, unknown>;
          const match = manifest.find(
            (m) => m.source === refObj.source && m.recordId === refObj.recordId,
          );
          if (
            match &&
            Array.isArray(match.messageIds) &&
            match.messageIds.length > 0
          ) {
            if (Array.isArray(refObj.messageIds)) {
              const valid = refObj.messageIds.filter(
                (id): id is string =>
                  typeof id === "string" && match.messageIds.includes(id),
              );
              if (valid.length > 0) {
                refObj.messageIds = valid;
              } else {
                refObj.messageIds = [match.messageIds.at(-1)!];
              }
            } else {
              refObj.messageIds = [match.messageIds.at(-1)!];
            }
          }
        }
      }
    }
  }
  return candidate;
}

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
          maxStdoutBytes: summaryTransportMaxReplyBytes,
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
      const settings = await models.effectiveSettings(provider);
      const summaryModel =
        settings.model ??
        (provider === "codex"
          ? "gpt-6-luna"
          : provider === "claude-code"
            ? "opus"
            : "gemini-3.8-flash-medium");
      const meta = { summaryModel, summaryProvider: provider };

      if (!executablePath) {
        await save(request, { kind: "unavailable" }, meta);
        throw new Error(`${provider} is not available.`);
      }
      const executable = executablePath;
      const options = request.language
        ? { language: request.language }
        : undefined;
      const chunking = chunkReportDayPayload(request.payload);
      if (chunking.kind === "message-too-large") {
        await save(request, chunking, meta);
        return;
      }

      if (chunking.kind === "single") {
        const result = await runValidated(
          buildSummaryRequestText(chunking.chunks[0].payloadJson, options),
          request.payload.manifest,
        );
        if (result.kind === "valid") {
          await save(
            request,
            {
              kind: "candidate",
              candidate: { achievements: result.achievements },
            },
            meta,
          );
          return;
        }
        await save(
          request,
          result.kind === "unavailable"
            ? { kind: "unavailable" }
            : { kind: "invalid", issue: result.issue },
          meta,
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
        await save(
          request,
          {
            kind: "chunk-failed",
            chunkIndex: chunk.index,
            sessions: chunk.manifest.map(({ source, recordId }) => ({
              source,
              recordId,
            })),
            ...(result.kind === "invalid" ? { issue: result.issue } : {}),
          },
          meta,
        );
        throw new Error(`${provider} failed chunk ${chunk.index}.`);
      }

      const mergeCandidates = compactCandidates(candidates, options);
      if (mergeCandidates === undefined) {
        await save(request, { kind: "merge-too-large" }, meta);
        return;
      }
      if (mergeCandidates.length === 0) {
        await save(
          request,
          {
            kind: "candidate",
            candidate: { achievements: [] },
          },
          meta,
        );
        return;
      }
      const merged = await runValidated(
        buildMergeSummaryRequestText(mergeCandidates, options),
        mergeEvidenceManifest(mergeCandidates),
        { rejectEmpty: true },
      );
      if (merged.kind === "valid") {
        await save(
          request,
          {
            kind: "candidate",
            candidate: { achievements: merged.achievements },
          },
          meta,
        );
        return;
      }
      await save(
        request,
        merged.kind === "unavailable"
          ? { kind: "merge-unavailable" }
          : { kind: "merge-invalid", issue: merged.issue },
        meta,
      );
      throw new Error(`${provider} produced no valid merged summary.`);

      async function runValidated(
        promptText: string,
        manifest: EvidenceManifest,
        options?: { rejectEmpty?: boolean },
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
          const candidateToValidate = sanitizeCandidateEvidence(
            outcome.candidate,
            manifest,
          );
          let validation: CandidateValidation = validateSummaryCandidate(
            candidateToValidate,
            {
              manifest,
              coverage: request.payload.coverage,
            },
          );
          if (
            options?.rejectEmpty &&
            validation.ok &&
            validation.achievements.length === 0
          ) {
            validation = {
              ok: false,
              issue: "empty-merge-result",
              retryable: false,
            };
          }
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
    meta?: { summaryModel?: string; summaryProvider?: ReportSource },
  ): Promise<AchievementReportV1> {
    const report = assembleReport({
      date: request.payload.date,
      // The payload builder records the collection's own timezone; nothing
      // here re-derives or overrides it.
      timezone: request.payload.timeZone,
      manifest: request.payload.manifest,
      coverage: request.payload.coverage,
      summary,
      summaryModel: meta?.summaryModel,
      summaryProvider: meta?.summaryProvider,
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
  maxReplyBytes = summaryTransportMaxReplyBytes,
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
    ...(achievement.project === undefined
      ? {}
      : { project: achievement.project }),
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
    Buffer.byteLength(buildMergeSummaryRequestText(candidates, options)) <=
    summaryChunkMaxPayloadBytes
  );
}

/**
 * The final model sees only compact candidate evidence, so its validation
 * manifest must be constructed from exactly those references—not the full
 * day's records. Session-level references deliberately contribute no message
 * IDs, preventing a merge reply from introducing IDs that were compacted out.
 */
function mergeEvidenceManifest(
  candidates: readonly IntermediateCandidate[],
): EvidenceManifest {
  const entries = new Map<string, EvidenceManifest[number]>();
  for (const candidate of candidates) {
    for (const evidence of candidate.evidence) {
      const key = `${evidence.source}\u0000${evidence.recordId}`;
      const existing = entries.get(key);
      const messageIds = new Set(existing?.messageIds ?? []);
      for (const messageId of evidence.messageIds ?? [])
        messageIds.add(messageId);
      entries.set(key, {
        source: evidence.source,
        recordId: evidence.recordId,
        ...(existing?.project === undefined && candidate.project === undefined
          ? {}
          : { project: existing?.project ?? candidate.project }),
        messageIds: [...messageIds],
      });
    }
  }
  return [...entries.values()];
}
