import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Achievement,
  AchievementReportV1,
  EvidenceRef,
} from "../src/report/contract.js";
import {
  describeIncomplete,
  isLocallyTraceable,
  pickEvidenceMessages,
  sourceLabel,
  type EvidenceMessage,
} from "./report-view.js";
import {
  format,
  getTranslations,
  isBuiltInLanguage,
  type Language,
  type Translations,
} from "./i18n.js";
import {
  loadSavedLanguage,
  saveLanguageChoice,
  languageStorageKey,
} from "./language-store.js";
import {
  ensureLanguageLoaded,
  loadCachedLanguageList,
  resolveRuntimeLanguage,
} from "./language-runtime.js";
import { directionFor } from "../src/report/languages.js";
import { LanguageSelector } from "./LanguageSelector.js";
import { SettingsModal } from "./SettingsModal.js";
import { LocalActivityModal } from "./LocalActivityModal.js";
import { DateSelector } from "./DateSelector.js";
import { getYesterdayDate } from "./date-utils.js";

type ViewMode = "journal" | "bento" | "briefing";

interface EvidenceDrawerProps {
  refData: EvidenceRef;
  reportDate?: string;
  t: Translations;
}

function EvidenceDrawer({ refData, reportDate, t }: EvidenceDrawerProps) {
  const [messages, setMessages] = useState<EvidenceMessage[]>([]);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      if (!isLocallyTraceable(refData.source)) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(undefined);
      try {
        const dateQuery = reportDate
          ? `&date=${encodeURIComponent(reportDate)}`
          : "";
        const response = await fetch(
          `/api/collector/sessions/${encodeURIComponent(refData.recordId)}?source=${encodeURIComponent(refData.source)}${dateQuery}`,
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => undefined)) as
            { error?: { message?: string } } | undefined;
          throw new Error(
            body?.error?.message ?? "Source session unavailable.",
          );
        }
        const body = (await response.json()) as {
          session: { messages: EvidenceMessage[] };
        };
        if (!active) return;
        const { found, missingIds: missing } = pickEvidenceMessages(
          body.session.messages,
          refData.messageIds,
        );
        setMessages(found);
        setMissingIds(missing);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Source session unavailable.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, [refData, reportDate]);

  if (!isLocallyTraceable(refData.source)) {
    return (
      <div className="evidence-drawer">
        <p className="evidence-text-faint">
          {sourceLabel(refData.source)} (Online history is not directly
          previewable locally).
        </p>
      </div>
    );
  }

  return (
    <div className="evidence-drawer">
      <div className="evidence-drawer-header">
        <span className="evidence-drawer-title">
          {sourceLabel(refData.source)}
        </span>
        <span className="evidence-drawer-id">{refData.recordId}</span>
      </div>
      {loading ? (
        <p className="evidence-text-faint">{t.states.loading}</p>
      ) : error ? (
        <p className="evidence-error">{error}</p>
      ) : (
        <div className="evidence-messages-list">
          {messages.length === 0 && missingIds.length === 0 ? (
            <p className="evidence-text-faint">No messages in this session.</p>
          ) : null}
          {messages.map((m) => (
            <div key={m.id} className="evidence-msg-item">
              <span className={`msg-role-badge ${m.role}`}>{m.role}</span>
              <div className="msg-text">{m.text}</div>
            </div>
          ))}
          {missingIds.map((id) => (
            <p key={id} className="evidence-stale-id">
              Message {id} is no longer present in this session.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

interface AchievementCardProps {
  achievement: Achievement;
  reportDate: string;
  onReportUpdated: (report: AchievementReportV1) => void;
  onError: (message: string) => void;
  isHero?: boolean;
  t: Translations;
}

function AchievementCard({
  achievement,
  reportDate,
  onReportUpdated,
  onError,
  isHero = false,
  t,
}: AchievementCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [editTitle, setEditTitle] = useState(achievement.title);
  const [editDetail, setEditDetail] = useState(achievement.detail);
  const [editIsPrimary, setEditIsPrimary] = useState(
    achievement.isPrimary ?? false,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editError, setEditError] = useState<string | undefined>(undefined);
  const [expandedEvidence, setExpandedEvidence] = useState<number | null>(null);

  useEffect(() => {
    setEditTitle(achievement.title);
    setEditDetail(achievement.detail);
    setEditIsPrimary(achievement.isPrimary ?? false);
  }, [achievement.title, achievement.detail, achievement.isPrimary]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setEditError(undefined);
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(reportDate)}/achievements/${encodeURIComponent(achievement.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: editTitle,
            detail: editDetail,
            isPrimary: editIsPrimary,
          }),
        },
      );
      const body = (await response.json().catch(() => undefined)) as
        | { report?: AchievementReportV1; error?: { message?: string } }
        | undefined;
      if (!response.ok || !body?.report) {
        throw new Error(body?.error?.message ?? "Failed to save changes.");
      }
      setIsEditing(false);
      onReportUpdated(body.report);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to save changes.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmRemove() {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(reportDate)}/achievements/${encodeURIComponent(achievement.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => undefined)) as
        | { report?: AchievementReportV1; error?: { message?: string } }
        | undefined;
      if (!response.ok || !body?.report) {
        throw new Error(
          body?.error?.message ?? "Failed to delete achievement.",
        );
      }
      setIsRemoving(false);
      onReportUpdated(body.report);
    } catch (err) {
      setIsRemoving(false);
      onError(
        err instanceof Error ? err.message : "Failed to delete achievement.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const isPrimary = achievement.isPrimary === true;
  const category = achievement.category || "progress";
  const cardClassName = `journal-card category-${category} ${isHero ? "hero-card" : ""} ${isPrimary ? "is-primary-card" : ""}`;

  return (
    <article className={cardClassName}>
      {isPrimary ? (
        <div className="hero-badge-tag primary-badge-tag">
          {t.badges.primary}
        </div>
      ) : isHero ? (
        <div className="hero-badge-tag">{t.badges.primary}</div>
      ) : null}

      {isEditing ? (
        <form className="journal-edit-form" onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor={`edit-title-${achievement.id}`}>
              {t.card.editTitlePlaceholder}
            </label>
            <input
              id={`edit-title-${achievement.id}`}
              type="text"
              maxLength={120}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={isSaving}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor={`edit-detail-${achievement.id}`}>
              {t.card.editDetailPlaceholder}
            </label>
            <textarea
              id={`edit-detail-${achievement.id}`}
              rows={3}
              maxLength={500}
              value={editDetail}
              onChange={(e) => setEditDetail(e.target.value)}
              disabled={isSaving}
              required
            />
          </div>
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editIsPrimary}
                onChange={(e) => setEditIsPrimary(e.target.checked)}
                disabled={isSaving}
              />
              <span>{t.card.setAsPrimary}</span>
            </label>
          </div>
          {editError ? <p className="form-error">{editError}</p> : null}
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? t.card.saving : t.card.save}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isSaving}
              onClick={() => {
                setIsEditing(false);
                setEditError(undefined);
                setEditTitle(achievement.title);
                setEditDetail(achievement.detail);
                setEditIsPrimary(achievement.isPrimary ?? false);
              }}
            >
              {t.card.cancel}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="card-top-row">
            <div className="card-heading">
              <span className={`status-dot ${category}`} title={category} />
              <h3 className="card-title">{achievement.title}</h3>
            </div>
            <div className="card-actions">
              {isRemoving ? (
                <div className="remove-confirm-group">
                  <span className="remove-prompt">{t.card.confirmDelete}</span>
                  <button
                    type="button"
                    className="action-btn action-danger"
                    disabled={isDeleting}
                    onClick={handleConfirmRemove}
                  >
                    {isDeleting ? t.card.deleting : t.card.delete}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={isDeleting}
                    onClick={() => setIsRemoving(false)}
                  >
                    {t.card.cancel}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={isSaving || isDeleting}
                    onClick={() => setIsEditing(true)}
                    title={t.card.edit}
                  >
                    {t.card.edit}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={isSaving || isDeleting}
                    onClick={() => setIsRemoving(true)}
                    title={t.card.delete}
                  >
                    {t.card.delete}
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="card-detail">{achievement.detail}</p>

          {achievement.evidence && achievement.evidence.length > 0 ? (
            <div className="card-evidence-section">
              <div className="evidence-pills-row">
                {achievement.evidence.map((ref, idx) => {
                  const isExpanded = expandedEvidence === idx;
                  const count = ref.messageIds?.length ?? 1;
                  return (
                    <button
                      key={`${ref.recordId}-${idx}`}
                      type="button"
                      className={`evidence-pill ${isExpanded ? "active" : ""}`}
                      onClick={() =>
                        setExpandedEvidence(isExpanded ? null : idx)
                      }
                    >
                      <span>📎</span>
                      <span>
                        {sourceLabel(ref.source)} ·{" "}
                        {format(t.card.evidenceCount, { n: count })}
                      </span>
                      <span className="pill-arrow">
                        {isExpanded ? "▴" : "▾"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {expandedEvidence !== null &&
              achievement.evidence[expandedEvidence] ? (
                <EvidenceDrawer
                  refData={achievement.evidence[expandedEvidence]!}
                  reportDate={reportDate}
                  t={t}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

type Theme = "dark" | "light";

export function ZenJournal() {
  const [report, setReport] = useState<AchievementReportV1 | null>(null);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getYesterdayDate);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | undefined>(
    undefined,
  );

  const [language, setLanguage] = useState<Language>(() =>
    loadSavedLanguage(localStorage),
  );
  // Bumped after a runtime pack loads, so `t` recomputes even though
  // `language` itself may already hold that saved code (see below).
  const [packRevision, setPackRevision] = useState(0);

  const t = useMemo(() => getTranslations(language), [language, packRevision]);

  const direction = useMemo(() => directionFor(language), [language]);

  // Direction is always derived from `language`, never set on its own, so it
  // can never outlive the language it belongs to (test L3-4 to L3-7) — a
  // fallback to English from the startup effect below flips this right back
  // to "ltr" in the same render that changes `language`.
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);

  // Task L2 (test L2-23, L2-24): a saved non-built-in language starts this
  // page in English (loadSavedLanguage's existing fallback) while its cached
  // pack loads; if it loads, switch into it, otherwise stay in English and
  // leave that language addable again.
  useEffect(() => {
    let cancelled = false;
    let saved: string | null;
    try {
      saved = localStorage.getItem(languageStorageKey);
    } catch {
      saved = null;
    }
    if (!saved || isBuiltInLanguage(saved)) return;
    resolveRuntimeLanguage(saved, { fetchFn: fetch }).then((resolved) => {
      if (cancelled || !resolved.available) return;
      setLanguage(resolved.language);
      setPackRevision((revision) => revision + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Task L4: every language with a pack already on disk should stay
  // selectable after a reload, not only the saved one — the bug was that
  // only the saved language's pack was fetched at startup. This only
  // fetches the list of cached codes, never a pack itself; a pack is still
  // downloaded only when its language is actually chosen.
  useEffect(() => {
    let cancelled = false;
    loadCachedLanguageList({ fetchFn: fetch }).then(() => {
      if (!cancelled) setPackRevision((revision) => revision + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Task L4 (test L4-6): a cached-but-unloaded language must have its pack
  // fetched before the page switches, so it never renders a language whose
  // pack isn't in memory yet. `direction` is derived from `language` via
  // useMemo above, so it always switches together with it.
  const handleLanguageChange = async (lang: Language) => {
    const outcome = await ensureLanguageLoaded(lang, { fetchFn: fetch });
    if (!outcome.ok) return;
    setLanguage(outcome.language);
    setPackRevision((revision) => revision + 1);
    await saveLanguageChoice(outcome.language, {
      storage: localStorage,
      fetchFn: fetch,
      origin: window.location.origin,
    });
  };

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("daily_proof_theme");
      if (saved === "dark" || saved === "light") {
        return saved;
      }
    } catch {
      // ignore
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("daily_proof_theme", next);
    } catch {
      // ignore
    }
  };

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem("daily_proof_view_mode");
      if (saved === "journal" || saved === "bento" || saved === "briefing") {
        return saved;
      }
    } catch {
      // ignore
    }
    return "journal";
  });

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("daily_proof_view_mode", mode);
    } catch {
      // ignore
    }
  };

  const loadReport = useCallback(
    async (date?: string) => {
      setLoading(true);
      setGenerateMessage(undefined);
      try {
        const url = date
          ? `/api/reports/${encodeURIComponent(date)}`
          : "/api/reports/latest";
        const response = await fetch(url);
        if (response.status === 404) {
          setReport(null);
          setStatus("No report has been generated yet.");
          return;
        }
        if (!response.ok) {
          setReport(null);
          setStatus("The report could not be loaded.");
          return;
        }
        const body = (await response.json()) as { report: AchievementReportV1 };
        setReport(body.report);

        const incomplete = describeIncomplete(body.report.incomplete);
        if (incomplete.length) {
          setStatus(incomplete.join(" "));
        } else if (body.report.achievements.length === 0) {
          setStatus(t.states.emptyDesc);
        } else {
          setStatus(undefined);
        }
      } catch {
        setReport(null);
        setStatus("The report could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [t.states.emptyDesc],
  );

  useEffect(() => {
    void loadReport(selectedDate);
  }, [selectedDate, loadReport]);

  async function handleGenerateForSelectedDate() {
    setIsGenerating(true);
    setGenerateMessage(undefined);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: window.location.origin,
        },
        body: JSON.stringify({
          scheduled: false,
          language,
          date: selectedDate,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        provider?: string;
        report?: { reason?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(
          data.report?.reason ?? data.error?.message ?? "Generation failed.",
        );
      }
      await loadReport(selectedDate);
    } catch (err) {
      setGenerateMessage(
        err instanceof Error ? err.message : "Generation failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  // Bento separation: Hero is the primary milestone or first achievement
  const heroAchievement =
    report?.achievements.find((a) => a.isPrimary) ?? report?.achievements[0];
  const secondaryAchievements =
    report?.achievements.filter((a) => a.id !== heroAchievement?.id) ?? [];

  // Briefing Categorization
  const deliverables =
    report?.achievements.filter((a) => a.category !== "decision") ?? [];
  const decisions =
    report?.achievements.filter((a) => a.category === "decision") ?? [];

  return (
    <div className="zen-app-shell">
      <header className="zen-header">
        <div className="brand-badge">Daily Proof</div>
        <div className="zen-nav-group">
          <div className="date-picker-wrap">
            <DateSelector
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              disabled={loading || isGenerating}
              t={t}
              direction={direction}
            />
          </div>

          <button
            type="button"
            className="zen-theme-btn"
            onClick={() => setIsActivityOpen(true)}
            disabled={isGenerating}
            title={t.header.activity}
            aria-label={t.header.activity}
          >
            <span>📂</span>
            <span className="theme-btn-text">{t.header.activity}</span>
          </button>

          <button
            type="button"
            className="zen-theme-btn"
            onClick={() => setIsSettingsOpen(true)}
            disabled={isGenerating}
            title={t.header.settings}
            aria-label={t.header.settings}
          >
            <span>⚙️</span>
            <span className="theme-btn-text">{t.header.settings}</span>
          </button>

          <LanguageSelector
            language={language}
            onLanguageChange={(code) => void handleLanguageChange(code)}
            disabled={isGenerating}
            t={t}
          />

          <button
            type="button"
            className="zen-theme-btn"
            onClick={toggleTheme}
            disabled={isGenerating}
            title={t.header.themeToggle}
            aria-label={t.header.themeToggle}
          >
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            <span className="theme-btn-text">
              {theme === "dark" ? t.header.themeLight : t.header.themeDark}
            </span>
          </button>
        </div>
      </header>

      {/* 3 Design Directions Switcher Bar */}
      <nav
        className="concept-switcher-bar"
        aria-label={t.header.viewSwitcherLabel}
      >
        <button
          type="button"
          className={`concept-btn ${viewMode === "journal" ? "active" : ""}`}
          onClick={() => changeViewMode("journal")}
          disabled={loading || isGenerating}
        >
          {t.header.views.journal}
        </button>
        <button
          type="button"
          className={`concept-btn ${viewMode === "bento" ? "active" : ""}`}
          onClick={() => changeViewMode("bento")}
          disabled={loading || isGenerating}
        >
          {t.header.views.bento}
        </button>
        <button
          type="button"
          className={`concept-btn ${viewMode === "briefing" ? "active" : ""}`}
          onClick={() => changeViewMode("briefing")}
          disabled={loading || isGenerating}
        >
          {t.header.views.briefing}
        </button>
      </nav>

      <main className="zen-main-container">
        {loading ? (
          <div className="zen-state-card">
            <p className="zen-state-text">{t.states.loading}</p>
          </div>
        ) : report ? (
          <>
            <section className="zen-meta-bar">
              <div className="meta-left">
                <span className="meta-count">
                  {format(t.meta.count, { n: report.achievements.length })}
                </span>
                <span className="meta-divider">•</span>
                <span className="meta-source">
                  {t.meta.sources}
                  {report.coverage.map((c) => sourceLabel(c.source)).join(", ")}
                </span>
              </div>
            </section>

            {status ? (
              <div className="zen-status-alert">
                <span className="alert-icon">ℹ️</span>
                <span>{status}</span>
              </div>
            ) : null}

            {/* View 1: Zen Journal (Vertical cards) */}
            {viewMode === "journal" && (
              <section className="journal-cards-container">
                {report.achievements.map((ach) => (
                  <AchievementCard
                    key={ach.id}
                    achievement={ach}
                    reportDate={report.date}
                    onReportUpdated={(updated) => setReport(updated)}
                    onError={(err) => setStatus(err)}
                    t={t}
                  />
                ))}
              </section>
            )}

            {/* View 2: Bento Grid (Hero card + 2-col subcards) */}
            {viewMode === "bento" && (
              <section className="bento-layout-container">
                {heroAchievement ? (
                  <AchievementCard
                    key={heroAchievement.id}
                    achievement={heroAchievement}
                    reportDate={report.date}
                    onReportUpdated={(updated) => setReport(updated)}
                    onError={(err) => setStatus(err)}
                    isHero={true}
                    t={t}
                  />
                ) : null}

                {secondaryAchievements.length > 0 ? (
                  <div className="bento-sub-grid">
                    {secondaryAchievements.map((ach) => (
                      <AchievementCard
                        key={ach.id}
                        achievement={ach}
                        reportDate={report.date}
                        onReportUpdated={(updated) => setReport(updated)}
                        onError={(err) => setStatus(err)}
                        t={t}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )}

            {/* View 3: Executive Briefing (Editorial typography) */}
            {viewMode === "briefing" && (
              <section className="briefing-paper-view">
                <div className="briefing-inner-paper">
                  <div className="briefing-section-header">
                    {t.states.briefingDeliverables}
                  </div>
                  <div className="briefing-items-group">
                    {deliverables.map((ach) => (
                      <AchievementCard
                        key={ach.id}
                        achievement={ach}
                        reportDate={report.date}
                        onReportUpdated={(updated) => setReport(updated)}
                        onError={(err) => setStatus(err)}
                        t={t}
                      />
                    ))}
                    {deliverables.length === 0 ? (
                      <p className="evidence-text-faint">
                        {t.states.noDeliverables}
                      </p>
                    ) : null}
                  </div>

                  {decisions.length > 0 ? (
                    <>
                      <div
                        className="briefing-section-header"
                        style={{ color: "#c084fc", marginTop: "2rem" }}
                      >
                        {t.states.briefingDecisions}
                      </div>
                      <div className="briefing-items-group">
                        {decisions.map((ach) => (
                          <AchievementCard
                            key={ach.id}
                            achievement={ach}
                            reportDate={report.date}
                            onReportUpdated={(updated) => setReport(updated)}
                            onError={(err) => setStatus(err)}
                            t={t}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}

                  <div className="briefing-conclusion-callout">
                    {t.states.briefingConclusion}
                  </div>
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="zen-state-card">
            <h2 className="zen-empty-title">
              {format(t.states.emptyDateTitle, { date: selectedDate })}
            </h2>
            <p className="zen-state-text">
              {status || format(t.states.emptyDateDesc, { date: selectedDate })}
            </p>
            {generateMessage ? (
              <p className="action-message error">{generateMessage}</p>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                marginTop: "16px",
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateForSelectedDate}
                disabled={isGenerating || loading}
              >
                {isGenerating
                  ? format(t.states.generatingForDate, { date: selectedDate })
                  : format(t.states.generateForDate, { date: selectedDate })}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void loadReport(selectedDate)}
                disabled={isGenerating || loading}
              >
                {t.states.refresh}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="zen-footer">
        <p>{t.states.footerText}</p>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        language={language}
        t={t}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        isGenerating={isGenerating}
        onReportGenerated={() => void loadReport(selectedDate)}
      />

      <LocalActivityModal
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        t={t}
        isGenerating={isGenerating}
        direction={direction}
      />
    </div>
  );
}
