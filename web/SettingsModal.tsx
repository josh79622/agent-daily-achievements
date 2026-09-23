import { useEffect, useState, useTransition } from "react";
import type { Language, Translations } from "./i18n.js";
import { DateSelector } from "./DateSelector.js";
import { directionFor } from "../src/report/languages.js";

export type SummaryProvider = "claude-code" | "codex" | "agy";

interface ProviderModelView {
  provider: SummaryProvider;
  source: "fetched" | "built-in";
  options: Array<{ value: string; label: string }>;
  selected: string;
  effective: string | null;
  effortOptions: string[];
  selectedEffort: string;
  effectiveEffort: string | null;
  warnings: string[];
}

interface ProviderStatus {
  provider: SummaryProvider;
  label: string;
  state:
    | "not-installed"
    | "sign-in-required"
    | "login-in-progress"
    | "ready"
    | "probe-failed";
  installUrl: string;
  reason?: string;
  signedIn?: true;
  checkedAt?: string;
  readyVia?: string;
}

interface InstallerStatus {
  installation: { status: "complete" | "pending" };
  providerConnection: { state: "not-connected" | "configured" };
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  t: Translations;
  selectedDate: string;
  onDateChange: (date: string) => void;
  isGenerating?: boolean;
  onReportGenerated: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  language,
  t,
  selectedDate,
  onDateChange,
  isGenerating = false,
  onReportGenerated,
}: SettingsModalProps) {
  const [models, setModels] = useState<ProviderModelView[]>([]);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [installerStatus, setInstallerStatus] =
    useState<InstallerStatus | null>(null);
  const [preferredCli, setPreferredCli] = useState<SummaryProvider>("agy");
  const [sourceScope, setSourceScope] = useState<string[]>([
    "claude-code",
    "codex",
    "antigravity",
  ]);
  const [loading, setLoading] = useState(true);
  const [checkingProvider, setCheckingProvider] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [savingPreferred, setSavingPreferred] = useState(false);
  const [savingModelProvider, setSavingModelProvider] = useState<string | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const isBusy =
    loading ||
    generating ||
    isGenerating ||
    checkingProvider !== null ||
    savingPreferred ||
    savingModelProvider !== null;

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    async function loadData() {
      setLoading(true);
      try {
        const [modelsRes, permRes, providersRes, installerRes] =
          await Promise.all([
            fetch("/api/summarizer/models").then((r) =>
              r.ok ? r.json() : null,
            ),
            fetch("/api/summarizer/permission").then((r) =>
              r.ok ? r.json() : null,
            ),
            fetch("/api/summarizer/providers").then((r) =>
              r.ok ? r.json() : null,
            ),
            fetch("/api/installer/status").then((r) =>
              r.ok ? r.json() : null,
            ),
          ]);

        if (!active) return;
        if (modelsRes?.providers) {
          setModels(modelsRes.providers);
        }
        if (permRes?.permission) {
          if (permRes.permission.preferredCli) {
            setPreferredCli(permRes.permission.preferredCli);
          }
          if (permRes.permission.sourceScope) {
            setSourceScope(permRes.permission.sourceScope);
          }
        }
        if (providersRes?.providers) {
          setStatuses(providersRes.providers);
        }
        if (installerRes?.installation && installerRes?.providerConnection) {
          setInstallerStatus(installerRes);
        }
      } catch (err) {
        console.error("Failed to load settings data", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePreferredChange = async (provider: SummaryProvider) => {
    if (isBusy) return;
    setSavingPreferred(true);
    setPreferredCli(provider);
    try {
      await fetch("/api/summarizer/permission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceScope,
          preferredCli: provider,
          summaryLanguage: language,
        }),
      });
    } catch (err) {
      console.error("Failed to save preferred CLI", err);
    } finally {
      setSavingPreferred(false);
    }
  };

  const handleModelSelect = async (
    provider: SummaryProvider,
    model: string,
  ) => {
    if (isBusy) return;
    setSavingModelProvider(provider);
    startTransition(() => {
      setModels((prev) =>
        prev.map((m) =>
          m.provider === provider ? { ...m, selected: model } : m,
        ),
      );
    });
    try {
      const res = await fetch(
        `/api/summarizer/models/${encodeURIComponent(provider)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        },
      );
      if (res.ok) {
        const body = (await res.json()) as { provider: ProviderModelView };
        setModels((prev) =>
          prev.map((m) => (m.provider === provider ? body.provider : m)),
        );
      }
    } catch (err) {
      console.error("Failed to save model", err);
    } finally {
      setSavingModelProvider(null);
    }
  };

  const handleEffortSelect = async (
    provider: SummaryProvider,
    effort: string,
  ) => {
    if (isBusy) return;
    setSavingModelProvider(provider);
    startTransition(() => {
      setModels((prev) =>
        prev.map((m) =>
          m.provider === provider ? { ...m, selectedEffort: effort } : m,
        ),
      );
    });
    try {
      const res = await fetch(
        `/api/summarizer/models/${encodeURIComponent(provider)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ effort }),
        },
      );
      if (res.ok) {
        const body = (await res.json()) as { provider: ProviderModelView };
        setModels((prev) =>
          prev.map((m) => (m.provider === provider ? body.provider : m)),
        );
      }
    } catch (err) {
      console.error("Failed to save effort", err);
    } finally {
      setSavingModelProvider(null);
    }
  };

  const handleCheckReadiness = async (provider: SummaryProvider) => {
    if (isBusy) return;
    setCheckingProvider(provider);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/summarizer/providers/${encodeURIComponent(provider)}/readiness`,
        { method: "POST" },
      );
      if (res.ok) {
        const body = (await res.json()) as { provider: ProviderStatus };
        setStatuses((prev) =>
          prev.map((s) => (s.provider === provider ? body.provider : s)),
        );
      }
    } catch (err) {
      console.error("Readiness check failed", err);
    } finally {
      setCheckingProvider(null);
    }
  };

  const handleStartLogin = async (provider: SummaryProvider) => {
    if (isBusy) return;
    setCheckingProvider(provider);
    try {
      const res = await fetch(
        `/api/summarizer/providers/${encodeURIComponent(provider)}/login`,
        { method: "POST" },
      );
      if (res.ok) {
        const body = (await res.json()) as { provider: ProviderStatus };
        setStatuses((prev) =>
          prev.map((status) =>
            status.provider === provider ? body.provider : status,
          ),
        );
      }
    } catch {
      // Provider command output and errors deliberately stay outside the UI.
    } finally {
      setCheckingProvider(null);
    }
  };

  const handleGenerateReport = async () => {
    if (isBusy) return;
    setGenerating(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled: false,
          language,
          date: selectedDate,
        }),
      });
      if (res.ok) {
        setActionMessage(t.settings.generateSuccess);
        onReportGenerated();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
          report?: { reason?: string };
        } | null;
        setActionMessage(
          `${t.settings.generateError}: ${data?.report?.reason || data?.error?.message || "HTTP " + res.status}`,
        );
      }
    } catch (err) {
      setActionMessage(
        `${t.settings.generateError}: ${err instanceof Error ? err.message : "Network error"}`,
      );
    } finally {
      setGenerating(false);
    }
  };

  const providerNames: Record<SummaryProvider, string> = {
    agy: "Google Antigravity / Gemini CLI (agy)",
    "claude-code": "Anthropic Claude Code",
    codex: "OpenAI Codex",
  };

  return (
    <div
      className="modal-backdrop"
      onClick={generating || isGenerating ? undefined : onClose}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">⚙️</span>
            <h2 className="modal-title">{t.settings.title}</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={generating || isGenerating}
            title={t.card.cancel}
          >
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-section">
            <DateSelector
              selectedDate={selectedDate}
              onDateChange={onDateChange}
              disabled={isBusy}
              t={t}
              direction={directionFor(language)}
            />
          </section>

          {/* Section 2: Summarizer Models */}
          <section className="settings-section">
            <h3 className="section-title">{t.settings.modelSectionTitle}</h3>
            {loading ? (
              <p className="evidence-text-faint">{t.states.loading}</p>
            ) : (
              <>
                {installerStatus?.installation.status === "complete" &&
                  installerStatus.providerConnection.state ===
                    "not-connected" && (
                    <p className="action-message" role="status">
                      {t.settings.noSummarizerConnected}
                    </p>
                  )}
                <div className="providers-list">
                  {(["agy", "claude-code", "codex"] as SummaryProvider[]).map(
                    (provider) => {
                      const modelView = models.find(
                        (m) => m.provider === provider,
                      );
                      const status = statuses.find(
                        (s) => s.provider === provider,
                      );
                      const isPreferred = preferredCli === provider;
                      const isChecking = checkingProvider === provider;

                      return (
                        <div
                          key={provider}
                          className={`provider-card ${isPreferred ? "is-preferred" : ""}`}
                        >
                          <div className="provider-header">
                            <label className="provider-radio-label">
                              <input
                                type="radio"
                                name="preferredProvider"
                                value={provider}
                                checked={isPreferred}
                                disabled={isBusy}
                                onChange={() =>
                                  void handlePreferredChange(provider)
                                }
                              />
                              <strong className="provider-name">
                                {providerNames[provider]}
                              </strong>
                            </label>
                            {isPreferred && (
                              <span className="preferred-badge">
                                {t.settings.preferredBadge}
                              </span>
                            )}
                          </div>

                          <div className="provider-controls">
                            {/* Model Select */}
                            <div className="control-group">
                              <label className="control-label">
                                {t.settings.modelLabel}
                              </label>
                              <select
                                className="settings-select"
                                value={modelView?.selected ?? "default"}
                                disabled={isBusy}
                                onChange={(e) =>
                                  void handleModelSelect(
                                    provider,
                                    e.target.value,
                                  )
                                }
                              >
                                <option value="default">
                                  {t.settings.defaultModel}
                                </option>
                                {modelView?.options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Effort Select (if available) */}
                            {modelView &&
                              modelView.effortOptions.length > 0 && (
                                <div className="control-group">
                                  <label className="control-label">
                                    {t.settings.effortLabel}
                                  </label>
                                  <select
                                    className="settings-select"
                                    value={modelView.selectedEffort}
                                    disabled={isBusy}
                                    onChange={(e) =>
                                      void handleEffortSelect(
                                        provider,
                                        e.target.value,
                                      )
                                    }
                                  >
                                    <option value="default">Default</option>
                                    {modelView.effortOptions.map((eff) => (
                                      <option key={eff} value={eff}>
                                        {eff}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                            {/* Status & Test */}
                            <div className="provider-status-row">
                              <div className="status-badge-wrap">
                                <span className="control-label">
                                  {t.settings.statusLabel}:
                                </span>
                                {status?.state === "ready" ? (
                                  <span className="status-pill status-ready">
                                    🟢 {t.settings.statusReady}
                                  </span>
                                ) : status?.signedIn ? (
                                  <span className="status-pill status-signed-in">
                                    🔵 {t.settings.statusSignedIn}
                                  </span>
                                ) : status?.state === "login-in-progress" ? (
                                  <span
                                    className="status-pill status-login-in-progress"
                                    title={t.settings.checkStatus}
                                  >
                                    🟡 {t.settings.statusLoginInProgress}
                                  </span>
                                ) : status?.state === "sign-in-required" ? (
                                  <span className="status-pill status-sign-in-required">
                                    🟡 {t.settings.statusSignInRequired}
                                  </span>
                                ) : status?.state === "not-installed" ? (
                                  <span className="status-pill status-not-installed">
                                    ⚪️ {t.settings.statusNotInstalled}
                                  </span>
                                ) : status?.state === "probe-failed" ? (
                                  <span className="status-pill status-probe-failed">
                                    🔴 Check failed
                                  </span>
                                ) : (
                                  <span
                                    className={`status-pill status-${status?.state || "unknown"}`}
                                  >
                                    {status?.state || "Not checked"}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary check-btn"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleCheckReadiness(provider)
                                }
                              >
                                {isChecking
                                  ? t.settings.checking
                                  : t.settings.checkStatus}
                              </button>
                              {!status?.signedIn &&
                                status?.state !== "ready" &&
                                status?.state !== "not-installed" && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary check-btn"
                                    disabled={isBusy}
                                    onClick={() =>
                                      void handleStartLogin(provider)
                                    }
                                  >
                                    {t.settings.signInProvider}
                                  </button>
                                )}
                              {status?.state === "not-installed" && (
                                <a
                                  className="btn btn-secondary check-btn"
                                  href={status.installUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {t.settings.installProvider}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </>
            )}
          </section>

          {/* Section 3: Generate Today Summary */}
          <section className="settings-section generate-section">
            <button
              type="button"
              className="btn btn-primary generate-action-btn"
              disabled={isBusy}
              onClick={() => void handleGenerateReport()}
            >
              {generating || isGenerating
                ? t.states.generating
                : t.settings.generateReportBtn}
            </button>
            {actionMessage && (
              <p
                className={`action-message ${actionMessage.includes("成功") || actionMessage.includes("successfully") ? "success" : "error"}`}
              >
                {actionMessage}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
