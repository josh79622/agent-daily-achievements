// Per-provider summary model settings (decisions S2, I2/M2, V, F3). Design:
// docs/plans/2026-09-17-readiness-probe-design.md

import {
  readSummarizerModels,
  writeSummarizerModels,
  type SavedModels,
} from "../storage/summarizer-models.js";
import type { SummaryProvider } from "../storage/summary-permission.js";
import {
  isSafeModelValue,
  type ModelCatalog,
  type ProviderCatalog,
} from "./model-catalog.js";

export type ModelWarning =
  "settings-unreadable" | "saved-model-unavailable" | "model-list-unavailable";

export interface ProviderModelView {
  provider: SummaryProvider;
  source: ProviderCatalog["source"];
  options: Array<{ value: string; label: string }>;
  /** `default` or the selected model value. */
  selected: string;
  /** The model actually passed to the CLI; null means the CLI default. */
  effective: string | null;
  warnings: ModelWarning[];
}

export function resolveProviderModel({
  provider,
  catalog,
  saved,
  unreadable,
}: {
  provider: SummaryProvider;
  catalog: ProviderCatalog;
  saved?: string;
  unreadable: boolean;
}): ProviderModelView {
  const warnings: ModelWarning[] = [];
  if (unreadable) warnings.push("settings-unreadable");
  if (catalog.source === "built-in") warnings.push("model-list-unavailable");
  const options = catalog.options.map(({ value, label }) => ({ value, label }));
  const view = (selected: string | undefined): ProviderModelView => ({
    provider,
    source: catalog.source,
    options,
    selected: selected ?? "default",
    effective: selected ?? null,
    warnings,
  });

  if (saved === undefined) return view(undefined);
  if (options.some((option) => option.value === saved)) return view(saved);
  // A fetched list is authoritative; a stale built-in list is not (F3 edge case).
  if (catalog.source === "built-in" && isSafeModelValue(saved)) {
    options.push({ value: saved, label: saved });
    return view(saved);
  }
  warnings.push("saved-model-unavailable");
  return view(undefined);
}

export interface SummarizerModelsService {
  view(): Promise<ProviderModelView[]>;
  effectiveModel(provider: SummaryProvider): Promise<string | undefined>;
  /** Returns undefined when the model is not `default` or a current option. */
  save(
    provider: SummaryProvider,
    model: string,
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
        unreadable: saved.unreadable,
      }),
    );
  }

  return {
    view: resolveAll,
    async effectiveModel(provider) {
      const view = (await resolveAll()).find(
        (entry) => entry.provider === provider,
      );
      return view?.effective ?? undefined;
    },
    async save(provider, model) {
      const lists = await catalog();
      if (
        model !== "default" &&
        !lists[provider].options.some((option) => option.value === model)
      )
        return undefined;
      const write = writes.then(async () => {
        const current = await readSummarizerModels(settingsPath);
        const next: SavedModels = current.unreadable
          ? {}
          : { ...current.models };
        if (model === "default") delete next[provider];
        else next[provider] = model;
        await writeSummarizerModels(settingsPath, next);
      });
      writes = write.catch(() => {});
      await write;
      return (await resolveAll()).find((entry) => entry.provider === provider);
    },
  };
}
