// Shared provider fallback order: try the preferred CLI first, then whatever
// else is available, in the order it was declared available.  Used by both a
// summary-generation request and a language-pack build request (Task L2,
// assumption 1: a pack build uses the same fallback rule as a summary run).

import type { SummaryProvider } from "../storage/summary-permission.js";

export function orderedProviders(
  available: SummaryProvider[],
  preferredCli: SummaryProvider | undefined,
): SummaryProvider[] {
  const unique = [...new Set(available)];
  const preferred = preferredCli ?? "codex";
  return [
    preferred,
    ...unique.filter((provider) => provider !== preferred),
  ].filter(
    (provider, index, providers) =>
      unique.includes(provider) && providers.indexOf(provider) === index,
  );
}

export function providerName(provider: SummaryProvider): string {
  if (provider === "codex") return "Codex";
  if (provider === "claude-code") return "Claude Code";
  if (provider === "agy") return "Gemini (agy)";
  return provider;
}
