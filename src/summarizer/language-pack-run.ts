// Builds one on-demand language pack (Task L2) by asking the already-chosen
// summarizer provider to translate the English UI pack, then validating and
// caching the result. Design and test cases:
// docs/plans/2026-09-21-task-l2-on-demand-language-packs-test-cases.md

import { join } from "node:path";

import { isBuiltInLanguage, type Translations } from "../../web/i18n.js";
import { validateLanguagePack } from "../report/language-pack.js";
import { buildLanguagePackPrompt } from "../report/language-pack-prompt.js";
import { findLanguage } from "../report/languages.js";
import type { SummaryProvider } from "../storage/summary-permission.js";
import type { LanguagePackStore } from "../storage/language-pack-store.js";
import {
  agyArgs,
  claudeArgs,
  codexArgs,
  type ProbeProcessRunner,
  type ProbeTempDirs,
  type ReplyFileReader,
  type ProbeRunResult,
} from "./readiness-probe.js";
import {
  agyReplyText,
  claudeReplyText,
  codexReplyText,
  parseCandidateJson,
  summaryAttemptTimeoutMs,
  summaryMaxReplyBytes,
  type SummaryLocator,
} from "./summary-run.js";
import type { SummarizerModelsService } from "./model-settings.js";
import { orderedProviders } from "./provider-order.js";

export type LanguagePackBuildResult =
  | { kind: "refused"; reason: string }
  | { kind: "cached"; pack: Translations }
  | { kind: "built"; pack: Translations }
  | { kind: "failed"; reason: string };

export interface LanguagePackBuilder {
  /** The cached pack for a code, or undefined when none has been built. */
  get(code: string): Promise<Translations | undefined>;
  /**
   * Builds (or reuses) the pack for a code. Concurrent calls for the same
   * code share one provider run (test L2-17).
   */
  build(
    code: string,
    options?: { preferredCli?: SummaryProvider },
  ): Promise<LanguagePackBuildResult>;
}

function refusalReason(code: string): string | undefined {
  if (!findLanguage(code)) return "That language is not in the catalog.";
  if (isBuiltInLanguage(code)) return "A built-in language is never generated.";
  // Task L3: right-to-left codes are no longer refused here; they reach the
  // provider like any other addable language (test L3-16).
  return undefined;
}

type AttemptOutcome =
  { kind: "no-reply" } | { kind: "reply"; candidate: unknown };

export function createLanguagePackBuilder({
  locate,
  models,
  runner,
  tempDirs,
  readReplyFile,
  store,
  availableSummaryProviders,
}: {
  locate: SummaryLocator;
  models: SummarizerModelsService;
  runner: ProbeProcessRunner;
  tempDirs: ProbeTempDirs;
  readReplyFile: ReplyFileReader;
  store: LanguagePackStore;
  availableSummaryProviders: SummaryProvider[];
}): LanguagePackBuilder {
  const pending = new Map<string, Promise<LanguagePackBuildResult>>();

  async function runOnce(
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
            ? agyArgs(model, effort, promptText)
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

  async function performBuild(
    code: string,
    preferredCli: SummaryProvider | undefined,
  ): Promise<LanguagePackBuildResult> {
    const promptText = buildLanguagePackPrompt(code);
    const providers = orderedProviders(availableSummaryProviders, preferredCli);
    if (providers.length === 0) {
      return {
        kind: "failed",
        reason: "No approved summarizer CLI is available.",
      };
    }
    const failures: string[] = [];
    for (const provider of providers) {
      const executablePath = await locate(provider);
      if (!executablePath) {
        failures.push(`${provider} is not available.`);
        continue;
      }
      const settings = await models.effectiveSettings(provider);
      const outcome = await runOnce(
        provider,
        executablePath,
        settings.model,
        settings.effort,
        promptText,
      );
      if (outcome.kind === "no-reply") {
        failures.push(`${provider} produced no usable reply.`);
        continue;
      }
      const validation = validateLanguagePack(outcome.candidate);
      if (!validation.ok) {
        // A rejected pack is the provider's final answer for this attempt;
        // it is not retried against another provider (test L2-12).
        return { kind: "failed", reason: validation.reason };
      }
      await store.write(code, validation.pack);
      return { kind: "built", pack: validation.pack };
    }
    return {
      kind: "failed",
      reason: failures.join(" ") || "No approved summarizer CLI is available.",
    };
  }

  return {
    async get(code) {
      return store.read(code);
    },
    build(code, options) {
      const refusal = refusalReason(code);
      if (refusal) {
        return Promise.resolve({ kind: "refused", reason: refusal });
      }
      const inFlight = pending.get(code);
      if (inFlight) return inFlight;
      const promise = (async (): Promise<LanguagePackBuildResult> => {
        const cached = await store.read(code);
        if (cached) return { kind: "cached", pack: cached };
        return performBuild(code, options?.preferredCli);
      })();
      pending.set(code, promise);
      void promise.finally(() => {
        pending.delete(code);
      });
      return promise;
    },
  };
}
