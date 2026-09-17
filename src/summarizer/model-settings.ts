// Per-provider summary model and effort settings (decisions S2, I2/M2, V, F3,
// R1, D2, G2). Design: docs/plans/2026-09-17-readiness-probe-design.md

import {
  readSummarizerModels,
  writeSummarizerModels,
} from "../storage/summarizer-models.js";
import type { SummaryProvider } from "../storage/summary-permission.js";
import {
  isSafeEffortLevel,
  isSafeModelValue,
  type ModelCatalog,
  type ProviderCatalog,
} from "./model-catalog.js";

export type ModelWarning =
  | "settings-unreadable"
  | "saved-model-unavailable"
  | "saved-effort-unavailable"
  | "model-list-unavailable";

export interface ProviderModelView {
  provider: SummaryProvider;
  source: ProviderCatalog["source"];
  options: Array<{ value: string; label: string }>;
  /** `default` or the selected model value. */
  selected: string;
  /** The model actually passed to the CLI; null means the CLI default. */
  effective: string | null;
  effortOptions: string[];
  /** `default` or the selected effort level. */
  selectedEffort: string;
  /** The effort actually passed to the CLI; null means the CLI default. */
  effectiveEffort: string | null;
  warnings: ModelWarning[];
}

export function resolveProviderModel({
  provider,
  catalog,
  saved,
  savedEffort,
  unreadable,
}: {
  provider: SummaryProvider;
  catalog: ProviderCatalog;
  saved?: string;
  savedEffort?: string;
  unreadable: boolean;
}): ProviderModelView {
  const warnings: ModelWarning[] = [];
  if (unreadable) warnings.push("settings-unreadable");
  if (catalog.source === "built-in") warnings.push("model-list-unavailable");
  const options = catalog.options.map(({ value, label }) => ({ value, label }));

  let effective: string | undefined;
  if (saved !== undefined) {
    if (options.some((option) => option.value === saved)) effective = saved;
    // A fetched list is authoritative; a stale built-in list is not.
    else if (catalog.source === "built-in" && isSafeModelValue(saved)) {
      options.push({ value: saved, label: saved });
      effective = saved;
    } else warnings.push("saved-model-unavailable");
  }

  const effortOptions = [...effortLevelsFor(catalog, effective)];
  let effort: string | undefined;
  if (savedEffort !== undefined) {
    if (effortOptions.includes(savedEffort)) effort = savedEffort;
    else if (catalog.source === "built-in" && isSafeEffortLevel(savedEffort)) {
      effortOptions.push(savedEffort);
      effort = savedEffort;
    } else warnings.push("saved-effort-unavailable");
  }

  return {
    provider,
    source: catalog.source,
    options,
    selected: effective ?? "default",
    effective: effective ?? null,
    effortOptions,
    selectedEffort: effort ?? "default",
    effectiveEffort: effort ?? null,
    warnings,
  };
}

/** Levels for a model; undefined means the CLI default model (D2). */
function effortLevelsFor(
  catalog: ProviderCatalog,
  model: string | undefined,
): string[] {
  if (model === undefined) return catalog.defaultEffortLevels;
  return (
    catalog.options.find((option) => option.value === model)?.effortLevels ?? []
  );
}

export interface SummarizerModelsService {
  view(): Promise<ProviderModelView[]>;
  effectiveSettings(
    provider: SummaryProvider,
  ): Promise<{ model?: string; effort?: string }>;
  /** Saves `default` or a listed model; returns undefined when invalid. */
  save(
    provider: SummaryProvider,
    model: string,
  ): Promise<ProviderModelView | undefined>;
  /** Saves `default` or a current effort option; undefined when invalid. */
  saveEffort(
    provider: SummaryProvider,
    effort: string,
  ): Promise<ProviderModelView | undefined>;
}

const providers: readonly SummaryProvider[] = ["codex", "claude-code"];

export function createSummarizerModelsService({
  catalog,
  settingsPath,
}: {
  catalog: () => Promise<ModelCatalog>;
  settingsPath: string;
}): SummarizerModelsService {
  let writes = Promise.resolve();

  async function resolveAll(): Promise<ProviderModelView[]> {
    const [lists, saved] = await Promise.all([
      catalog(),
      readSummarizerModels(settingsPath),
    ]);
    return providers.map((provider) =>
      resolveProviderModel({
        provider,
        catalog: lists[provider],
        saved: saved.models[provider],
        savedEffort: saved.efforts[provider],
        unreadable: saved.unreadable,
      }),
    );
  }

  async function viewFor(provider: SummaryProvider) {
    return (await resolveAll()).find((entry) => entry.provider === provider);
  }

  async function update(
    change: (settings: {
      models: Partial<Record<SummaryProvider, string>>;
      efforts: Partial<Record<SummaryProvider, string>>;
    }) => Promise<boolean>,
  ): Promise<boolean> {
    let applied = false;
    const write = writes.then(async () => {
      const current = await readSummarizerModels(settingsPath);
      const next = current.unreadable
        ? { models: {}, efforts: {} }
        : { models: { ...current.models }, efforts: { ...current.efforts } };
      applied = await change(next);
      if (applied) await writeSummarizerModels(settingsPath, next);
    });
    writes = write.catch(() => {});
    await write;
    return applied;
  }

  return {
    view: resolveAll,
    async effectiveSettings(provider) {
      const view = await viewFor(provider);
      return {
        model: view?.effective ?? undefined,
        effort: view?.effectiveEffort ?? undefined,
      };
    },
    async save(provider, model) {
      const lists = await catalog();
      const list = lists[provider];
      if (
        model !== "default" &&
        !list.options.some((option) => option.value === model)
      )
        return undefined;
      await update(async (settings) => {
        if (model === "default") delete settings.models[provider];
        else settings.models[provider] = model;
        // G2: a user's model change keeps a supported effort, else resets it.
        const effort = settings.efforts[provider];
        const levels = effortLevelsFor(
          list,
          model === "default" ? undefined : model,
        );
        if (effort !== undefined && !levels.includes(effort))
          delete settings.efforts[provider];
        return true;
      });
      return viewFor(provider);
    },
    async saveEffort(provider, effort) {
      const applied = await update(async (settings) => {
        const lists = await catalog();
        const view = resolveProviderModel({
          provider,
          catalog: lists[provider],
          saved: settings.models[provider],
          unreadable: false,
        });
        if (effort !== "default" && !view.effortOptions.includes(effort))
          return false;
        if (effort === "default") delete settings.efforts[provider];
        else settings.efforts[provider] = effort;
        return true;
      });
      return applied ? viewFor(provider) : undefined;
    },
  };
}
