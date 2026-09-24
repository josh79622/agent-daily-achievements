import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Achievement,
  AchievementReportV1,
  ReportSource,
} from "../src/report/contract.js";
import { describeIncomplete, sourceLabel } from "./report-view.js";
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
import { HeaderIconButton } from "./HeaderIconButton.js";
import { getYesterdayDate } from "./date-utils.js";
import { EvidenceModal } from "./EvidenceModal.js";

type ViewMode = "journal" | "bento" | "briefing";

interface ReportVersion {
  id: string;
  generatedAt: string;
  report: AchievementReportV1;
  summaryModel?: string;
  summaryProvider?: ReportSource;
}

interface AchievementCardProps {
  achievement: Achievement;
  reportDate: string;
  reportVersionId: string;
  onReportUpdated: (report: AchievementReportV1) => void;
  onError: (message: string) => void;
  isHero?: boolean;
  t: Translations;
  onOpenEvidence?: (achievement: Achievement) => void;
}

function AchievementCard({
  achievement,
  reportDate,
  reportVersionId,
  onReportUpdated,
  onError,
  isHero = false,
  t,
  onOpenEvidence,
}: AchievementCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [editTitle, setEditTitle] = useState(achievement.title);
  const [editDetail, setEditDetail] = useState(achievement.detail);
  const [editProject, setEditProject] = useState(achievement.project ?? "");
  const [editIsPrimary, setEditIsPrimary] = useState(
    achievement.isPrimary ?? false,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editError, setEditError] = useState<string | undefined>(undefined);
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);

  useEffect(() => {
    setEditTitle(achievement.title);
    setEditDetail(achievement.detail);
    setEditProject(achievement.project ?? "");
    setEditIsPrimary(achievement.isPrimary ?? false);
  }, [
    achievement.title,
    achievement.detail,
    achievement.project,
    achievement.isPrimary,
  ]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setEditError(undefined);
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(reportDate)}/versions/${encodeURIComponent(reportVersionId)}/achievements/${encodeURIComponent(achievement.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: editTitle,
            detail: editDetail,
            project: editProject.trim() || undefined,
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
        `/api/reports/${encodeURIComponent(reportDate)}/versions/${encodeURIComponent(reportVersionId)}/achievements/${encodeURIComponent(achievement.id)}`,
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
  const hasEvidence = Boolean(
    achievement.evidence && achievement.evidence.length > 0,
  );
  const cardClassName = `journal-card category-${category} ${isHero ? "hero-card" : ""} ${isPrimary ? "is-primary-card" : ""}${hasEvidence ? " is-clickable" : ""}`;

  const handleCardClick = () => {
    if (hasEvidence && !isEditing && !isRemoving) {
      if (onOpenEvidence) {
        onOpenEvidence(achievement);
      } else {
        setIsEvidenceModalOpen(true);
      }
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (
      hasEvidence &&
      !isEditing &&
      !isRemoving &&
      (e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      if (onOpenEvidence) {
        onOpenEvidence(achievement);
      } else {
        setIsEvidenceModalOpen(true);
      }
    }
  };

  return (
    <article
      className={cardClassName}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      tabIndex={hasEvidence && !isEditing ? 0 : undefined}
    >
      {isPrimary ? (
        <div className="hero-badge-tag primary-badge-tag">
          {t.badges.primary}
        </div>
      ) : isHero ? (
        <div className="hero-badge-tag">{t.badges.primary}</div>
      ) : null}

      {isEditing ? (
        <form
          className="journal-edit-form"
          onSubmit={handleSave}
          onClick={(e) => e.stopPropagation()}
        >
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
            <label htmlFor={`edit-project-${achievement.id}`}>
              {t.card.editProjectLabel}
            </label>
            <input
              id={`edit-project-${achievement.id}`}
              type="text"
              maxLength={100}
              value={editProject}
              onChange={(e) => setEditProject(e.target.value)}
              disabled={isSaving}
              placeholder={t.card.editProjectLabel}
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
                setEditProject(achievement.project ?? "");
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
              {achievement.project ? (
                <span className="project-badge" title={achievement.project}>
                  <span className="project-badge-icon">📁</span>
                  <span className="project-badge-name">
                    {achievement.project}
                  </span>
                </span>
              ) : null}
            </div>
            <div className="card-actions">
              {isRemoving ? (
                <div
                  className="remove-confirm-group"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="remove-prompt">{t.card.confirmDelete}</span>
                  <button
                    type="button"
                    className="action-btn action-danger"
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleConfirmRemove();
                    }}
                  >
                    {isDeleting ? t.card.deleting : t.card.delete}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRemoving(false);
                    }}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                    title={t.card.edit}
                  >
                    {t.card.edit}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={isSaving || isDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRemoving(true);
                    }}
                    title={t.card.delete}
                  >
                    {t.card.delete}
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="card-detail">{achievement.detail}</p>

          {hasEvidence ? (
            <div className="card-evidence-summary">
              <button
                type="button"
                className="evidence-summary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenEvidence) {
                    onOpenEvidence(achievement);
                  } else {
                    setIsEvidenceModalOpen(true);
                  }
                }}
              >
                <span>📎</span>
                <span>
                  {format(t.card.evidenceCount, {
                    n: achievement.evidence!.length,
                  })}{" "}
                  · {t.card.viewEvidence} ↗
                </span>
              </button>
            </div>
          ) : null}

          {hasEvidence && isEvidenceModalOpen && !onOpenEvidence ? (
            <EvidenceModal
              isOpen={isEvidenceModalOpen}
              onClose={() => setIsEvidenceModalOpen(false)}
              achievement={achievement}
              reportDate={reportDate}
              t={t}
            />
          ) : null}
        </>
      )}
    </article>
  );
}

interface ReportVersionContentProps {
  version: ReportVersion;
  language: Language;
  viewMode: ViewMode;
  t: Translations;
  onReportUpdated: (report: AchievementReportV1) => void;
  onError: (message: string) => void;
  onOpenEvidence?: (achievement: Achievement) => void;
}

export type ReportVersionViewProps = ReportVersionContentProps;

function formatGeneratedAt(generatedAt: string, language: Language): string {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return generatedAt;
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ReportVersionContent({
  version,
  language,
  viewMode,
  t,
  onReportUpdated,
  onError,
  onOpenEvidence,
}: ReportVersionContentProps) {
  const report = version.report;
  const incomplete = describeIncomplete(report.incomplete, t);
  const status = incomplete.length
    ? incomplete.join(" ")
    : report.achievements.length === 0
      ? t.states.emptyDesc
      : undefined;
  const heroAchievement =
    report.achievements.find((achievement) => achievement.isPrimary) ??
    report.achievements[0];
  const secondaryAchievements = report.achievements.filter(
    (achievement) => achievement.id !== heroAchievement?.id,
  );
  const deliverables = report.achievements.filter(
    (achievement) => achievement.category !== "decision",
  );
  const decisions = report.achievements.filter(
    (achievement) => achievement.category === "decision",
  );
  const card = (achievement: Achievement, isHero = false) => (
    <AchievementCard
      key={achievement.id}
      achievement={achievement}
      reportDate={report.date}
      reportVersionId={version.id}
      onReportUpdated={onReportUpdated}
      onError={onError}
      isHero={isHero}
      t={t}
      onOpenEvidence={onOpenEvidence}
    />
  );

  return (
    <section className="report-version" data-version-id={version.id}>
      <header className="report-version-header">
        <time dateTime={version.generatedAt}>
          {format(t.states.versionGeneratedAt, {
            time: formatGeneratedAt(version.generatedAt, language),
          })}
        </time>
      </header>
      <section className="zen-meta-bar">
        <div className="meta-left">
          <span className="meta-count">
            {format(t.meta.count, { n: report.achievements.length })}
          </span>
          <span className="meta-divider">•</span>
          <span className="meta-source">
            {t.meta.sources}
            {report.coverage
              .map((coverage) => sourceLabel(coverage.source))
              .join(", ")}
          </span>
          {report.summaryModel || version.summaryModel ? (
            <>
              <span className="meta-divider">•</span>
              <span className="meta-model">
                🤖{" "}
                {format(t.meta.model, {
                  model:
                    report.summaryProvider || version.summaryProvider
                      ? `${sourceLabel((report.summaryProvider || version.summaryProvider) as ReportSource)} (${report.summaryModel || version.summaryModel})`
                      : (report.summaryModel || version.summaryModel)!,
                })}
              </span>
            </>
          ) : null}
        </div>
      </section>

      {status ? (
        <div className="zen-status-alert">
          <span className="alert-icon">ℹ️</span>
          <span>{status}</span>
        </div>
      ) : null}

      {viewMode === "journal" ? (
        <section className="journal-cards-container">
          {report.achievements.map((achievement) => card(achievement))}
        </section>
      ) : null}

      {viewMode === "bento" ? (
        <section className="bento-layout-container">
          {heroAchievement ? card(heroAchievement, true) : null}
          {secondaryAchievements.length > 0 ? (
            <div className="bento-sub-grid">
              {secondaryAchievements.map((achievement) => card(achievement))}
            </div>
          ) : null}
        </section>
      ) : null}

      {viewMode === "briefing" ? (
        <section className="briefing-paper-view">
          <div className="briefing-inner-paper">
            <div className="briefing-section-header">
              {t.states.briefingDeliverables}
            </div>
            <div className="briefing-items-group">
              {deliverables.map((achievement) => card(achievement))}
              {deliverables.length === 0 ? (
                <p className="evidence-text-faint">{t.states.noDeliverables}</p>
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
                  {decisions.map((achievement) => card(achievement))}
                </div>
              </>
            ) : null}
            <div className="briefing-conclusion-callout">
              {t.states.briefingConclusion}
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}

type Theme = "dark" | "light";

export function ZenJournal() {
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [viewingEvidenceAchievement, setViewingEvidenceAchievement] =
    useState<Achievement | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getYesterdayDate);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | undefined>(
    undefined,
  );
  const [generateErrorType, setGenerateErrorType] = useState<
    "permission" | "generic" | undefined
  >(undefined);

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
      setGenerateErrorType(undefined);
      try {
        const url = `/api/reports/${encodeURIComponent(date ?? selectedDate)}/versions`;
        const response = await fetch(url);
        if (response.status === 404) {
          setVersions([]);
          setStatus("No report has been generated yet.");
          return;
        }
        if (!response.ok) {
          setVersions([]);
          setStatus("The report could not be loaded.");
          return;
        }
        const body = (await response.json()) as {
          versions?: ReportVersion[];
          report?: AchievementReportV1;
        };
        const loadedVersions =
          body.versions ??
          (body.report
            ? [{ id: "latest", generatedAt: "", report: body.report }]
            : []);
        setVersions(
          [...loadedVersions].sort(
            (left, right) =>
              right.generatedAt.localeCompare(left.generatedAt) ||
              right.id.localeCompare(left.id),
          ),
        );
        setStatus(undefined);
      } catch {
        setVersions([]);
        setStatus("The report could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadReport(selectedDate);
  }, [selectedDate, loadReport]);

  async function handleGenerateForSelectedDate() {
    setIsGenerating(true);
    setGenerateMessage(undefined);
    setGenerateErrorType(undefined);
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
        const errorMsg =
          data.report?.reason ?? data.error?.message ?? "Generation failed.";
        const isPermissionError =
          res.status === 403 ||
          errorMsg.includes("Save external summarization permission first") ||
          errorMsg.toLowerCase().includes("permission");
        if (isPermissionError) {
          setGenerateErrorType("permission");
          setGenerateMessage(t.states.permissionRequired);
          return;
        }
        throw new Error(errorMsg);
      }
      await loadReport(selectedDate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed.";
      const isPermissionError =
        msg.includes("Save external summarization permission first") ||
        msg.toLowerCase().includes("permission");
      if (isPermissionError) {
        setGenerateErrorType("permission");
        setGenerateMessage(t.states.permissionRequired);
      } else {
        setGenerateErrorType("generic");
        setGenerateMessage(msg);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="zen-app-shell">
      <header className="zen-header">
        <div className="brand-badge">Daily Proof</div>
        <div className="date-picker-wrap">
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            disabled={loading || isGenerating}
            t={t}
            direction={direction}
          />
        </div>

        <div className="header-utilities">
          <HeaderIconButton
            label={t.header.activity}
            onClick={() => setIsActivityOpen(true)}
            disabled={isGenerating}
          >
            <span aria-hidden="true">📂</span>
          </HeaderIconButton>

          <HeaderIconButton
            label={t.header.settings}
            onClick={() => setIsSettingsOpen(true)}
            disabled={isGenerating}
          >
            <span aria-hidden="true">⚙️</span>
          </HeaderIconButton>

          <LanguageSelector
            language={language}
            onLanguageChange={(code) => void handleLanguageChange(code)}
            disabled={isGenerating}
            t={t}
          />

          <HeaderIconButton
            label={t.header.themeToggle}
            onClick={toggleTheme}
            disabled={isGenerating}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
          </HeaderIconButton>
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
        ) : versions.length > 0 ? (
          <>
            {versions.some(
              (version) => version.report.status === "incomplete",
            ) ? (
              <div
                className="incomplete-regenerate-bar"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "8px",
                  marginTop: "-0.75rem",
                  marginBottom: "1.5rem",
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerateForSelectedDate}
                  disabled={isGenerating}
                >
                  ⚡ {t.states.regenerateReport}
                </button>
                {generateMessage && (
                  <p className="action-message error">{generateMessage}</p>
                )}
              </div>
            ) : null}
            {status ? (
              <div className="zen-status-alert">
                <span className="alert-icon">ℹ️</span>
                <span>{status}</span>
              </div>
            ) : null}
            {versions.map((version) => (
              <ReportVersionContent
                key={version.id}
                version={version}
                language={language}
                viewMode={viewMode}
                t={t}
                onReportUpdated={(updated) =>
                  setVersions((current) =>
                    current.map((item) =>
                      item.id === version.id
                        ? { ...item, report: updated }
                        : item,
                    ),
                  )
                }
                onError={setStatus}
                onOpenEvidence={setViewingEvidenceAchievement}
              />
            ))}
          </>
        ) : (
          <div className="zen-state-card">
            <h2 className="zen-empty-title">
              {format(t.states.emptyDateTitle, { date: selectedDate })}
            </h2>
            <p className="zen-state-text">
              {status || format(t.states.emptyDateDesc, { date: selectedDate })}
            </p>
            {generateErrorType === "permission" ? (
              <div
                className="permission-error-callout"
                style={{
                  margin: "16px auto",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  maxWidth: "480px",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <p className="action-message error" style={{ margin: 0 }}>
                  {t.states.permissionRequired}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  ⚙️ {t.states.openSettings}
                </button>
              </div>
            ) : generateMessage ? (
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

      {viewingEvidenceAchievement ? (
        <EvidenceModal
          isOpen={true}
          onClose={() => setViewingEvidenceAchievement(null)}
          achievement={viewingEvidenceAchievement}
          reportDate={selectedDate}
          t={t}
        />
      ) : null}
    </div>
  );
}
