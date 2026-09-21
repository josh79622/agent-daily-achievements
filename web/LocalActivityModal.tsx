import { useEffect, useState } from "react";
import { format, type Translations } from "./i18n.js";
import {
  computeSourceCoverageList,
  formatSourceCoverageText,
  formatSessionTimeRange,
  KNOWN_SOURCES,
  type LocalSource,
  type CollectorSourceStatus,
  type CollectorSessionItem,
} from "./local-activity-view.js";
import { sourceLabel } from "./report-view.js";
import { DateSelector } from "./DateSelector.js";
import type { Direction } from "../src/report/languages.js";

interface EvidenceMessage {
  id: string;
  role: string;
  text: string;
  timestamp?: string;
}

export interface LocalActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  t: Translations;
  isGenerating?: boolean;
  direction?: Direction;
}

export function LocalActivityModal({
  isOpen,
  onClose,
  selectedDate,
  onDateChange,
  t,
  isGenerating = false,
  direction = "ltr",
}: LocalActivityModalProps) {
  const [savedSources, setSavedSources] = useState<LocalSource[]>([]);
  const [draftSources, setDraftSources] = useState<LocalSource[]>([]);
  const [reportedSources, setReportedSources] = useState<
    CollectorSourceStatus[]
  >([]);
  const [sessions, setSessions] = useState<CollectorSessionItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const [modalDate, setModalDate] = useState(selectedDate);
  const [activeDate, setActiveDate] = useState(selectedDate);

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null,
  );
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<
    Map<string, EvidenceMessage[]>
  >(new Map());
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isBusy =
    searching ||
    loadingConsent ||
    savingConsent ||
    loadingPreviewId !== null ||
    isGenerating;

  const loadConsent = async () => {
    setLoadingConsent(true);
    try {
      const consentRes = await fetch("/api/collector/consent");
      if (consentRes.ok) {
        const data = (await consentRes.json()) as { sources: LocalSource[] };
        const currentSources = data.sources ?? [];
        setSavedSources(currentSources);
        setDraftSources(currentSources);
        return currentSources;
      }
    } catch (err) {
      console.error("Failed to load consent", err);
    } finally {
      setLoadingConsent(false);
    }
    return [];
  };

  const searchActivity = async (date: string) => {
    setSearching(true);
    setActionMessage(null);
    try {
      const currentSources =
        savedSources.length > 0 ? savedSources : await loadConsent();
      if (currentSources.length === 0) {
        setReportedSources([]);
        setSessions([]);
        return;
      }

      const todayRes = await fetch(
        `/api/collector/today?date=${encodeURIComponent(date)}`,
      );
      if (todayRes.ok) {
        const todayData = (await todayRes.json()) as {
          sources: CollectorSourceStatus[];
          sessions: CollectorSessionItem[];
        };
        setReportedSources(todayData.sources ?? []);
        setSessions(todayData.sessions ?? []);
      } else {
        setReportedSources([]);
        setSessions([]);
      }
    } catch (err) {
      console.error("Failed to search local activity", err);
      setActionMessage({
        text: `${t.activity.errorPrefix}: ${err instanceof Error ? err.message : "Network error"}`,
        type: "error",
      });
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setModalDate(selectedDate);
    setActiveDate(selectedDate);
    setHasSearched(false);
    setReportedSources([]);
    setSessions([]);
    setExpandedSessionId(null);
    setSessionMessages(new Map());
    setActionMessage(null);
    void loadConsent();
  }, [isOpen, selectedDate]);

  if (!isOpen) return null;

  const handleToggleDraftSource = (source: LocalSource) => {
    if (isBusy) return;
    setDraftSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source],
    );
  };

  const handleSaveConsent = async () => {
    if (isBusy) return;
    setSavingConsent(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/collector/consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: draftSources }),
      });
      if (res.ok) {
        const data = (await res.json()) as { sources: LocalSource[] };
        setSavedSources(data.sources);
        setActionMessage({
          text: t.activity.savedScopeSuccess,
          type: "success",
        });
        if (hasSearched) {
          await searchActivity(activeDate);
        }
      } else {
        const errData = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setActionMessage({
          text: `${t.activity.errorPrefix}: ${errData?.error?.message ?? "HTTP " + res.status}`,
          type: "error",
        });
      }
    } catch (err) {
      setActionMessage({
        text: `${t.activity.errorPrefix}: ${err instanceof Error ? err.message : "Network error"}`,
        type: "error",
      });
    } finally {
      setSavingConsent(false);
    }
  };

  const handleSearch = () => {
    if (isBusy) return;
    setHasSearched(true);
    setActiveDate(modalDate);
    onDateChange(modalDate);
    setExpandedSessionId(null);
    setSessionMessages(new Map());
    void searchActivity(modalDate);
  };

  const handleTogglePreview = async (
    sessionId: string,
    source: LocalSource,
  ) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);
    setPreviewError(null);

    // If messages already cached, don't refetch
    if (sessionMessages.has(sessionId)) {
      return;
    }

    setLoadingPreviewId(sessionId);
    try {
      const res = await fetch(
        `/api/collector/sessions/${encodeURIComponent(sessionId)}?source=${encodeURIComponent(source)}&date=${encodeURIComponent(activeDate)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          session: { messages: EvidenceMessage[] };
        };
        setSessionMessages((prev) => {
          const next = new Map(prev);
          next.set(sessionId, data.session?.messages ?? []);
          return next;
        });
      } else {
        setPreviewError(`Failed to load session (HTTP ${res.status})`);
      }
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Failed to load session",
      );
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const coverageList = computeSourceCoverageList(savedSources, reportedSources);

  const sourceLabelsMap: Record<LocalSource, string> = {
    "claude-code": t.activity.claudeLabel,
    codex: t.activity.codexLabel,
    antigravity: t.activity.antigravityLabel,
  };

  return (
    <div className="modal-backdrop" onClick={isBusy ? undefined : onClose}>
      <div
        className="settings-modal activity-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">📂</span>
            <h2 className="modal-title">{t.activity.title}</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={savingConsent || isGenerating}
            title={t.activity.close}
          >
            ✕
          </button>
        </header>

        <div className="activity-modal-toolbar">
          <div className="activity-toolbar-left">
            <span className="activity-toolbar-label">
              <span>📅</span> {t.header.selectDate}:
            </span>
            <DateSelector
              selectedDate={modalDate}
              onDateChange={setModalDate}
              disabled={isBusy}
              t={t}
              direction={direction}
            />
            <button
              type="button"
              className="btn btn-primary search-activity-btn"
              onClick={handleSearch}
              disabled={isBusy}
              title={t.activity.searchBtn}
            >
              {searching ? (
                <span>⏳ {t.states.loading}</span>
              ) : (
                <span>{t.activity.searchBtn}</span>
              )}
            </button>
          </div>
        </div>

        <div className="modal-body">
          {/* Section 1: Local Consent Scope */}
          <section className="settings-section">
            <h3 className="section-title">{t.activity.consentSectionTitle}</h3>
            <p className="section-desc">{t.activity.consentDesc}</p>

            <div className="consent-checkbox-grid">
              {KNOWN_SOURCES.map((src) => {
                const isChecked = draftSources.includes(src);
                return (
                  <label
                    key={src}
                    className={`consent-checkbox-card ${isChecked ? "is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isBusy}
                      onChange={() => handleToggleDraftSource(src)}
                    />
                    <div className="checkbox-info">
                      <span className="checkbox-title">
                        {sourceLabelsMap[src]}
                      </span>
                      <span className="checkbox-source-tag">({src})</span>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="consent-actions-row">
              <button
                type="button"
                className="btn btn-primary check-btn"
                disabled={isBusy}
                onClick={() => void handleSaveConsent()}
              >
                {savingConsent
                  ? t.activity.savingScope
                  : t.activity.saveScopeBtn}
              </button>
            </div>

            {actionMessage && (
              <p className={`action-message ${actionMessage.type}`}>
                {actionMessage.text}
              </p>
            )}
          </section>

          {/* Section 2: Coverage Status Grid */}
          <section className="settings-section">
            <h3 className="section-title">
              {format(t.activity.coverageSectionTitle, {
                date: hasSearched ? activeDate : modalDate,
              })}
            </h3>
            {!hasSearched ? (
              <p className="evidence-text-faint">{t.activity.searchPrompt}</p>
            ) : searching ? (
              <p className="evidence-text-faint">
                {t.activity.readingMetadata}
              </p>
            ) : (
              <div className="coverage-badge-grid">
                {coverageList.map((cov) => (
                  <div
                    key={cov.source}
                    className={`coverage-card status-box-${cov.state}`}
                  >
                    <div className="coverage-status-row">
                      <strong className="coverage-name">
                        {sourceLabel(cov.source)}
                      </strong>
                      <span className={`status-pill status-${cov.state}`}>
                        {cov.state}
                      </span>
                    </div>
                    <p className="coverage-desc">
                      {formatSourceCoverageText(cov, t)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 3: Discovered Sessions & Preview */}
          <section className="settings-section">
            <h3 className="section-title">
              {format(t.activity.sessionsSectionTitle, {
                date: hasSearched ? activeDate : modalDate,
              })}
            </h3>
            {!hasSearched ? (
              <p className="evidence-text-faint">{t.activity.searchPrompt}</p>
            ) : savedSources.length === 0 ? (
              <p className="evidence-text-faint">
                {t.activity.noConsentedSources}
              </p>
            ) : searching ? (
              <p className="evidence-text-faint">
                {t.activity.readingMetadata}
              </p>
            ) : sessions.length === 0 ? (
              <p className="evidence-text-faint">
                {t.activity.noSessionsFound}
              </p>
            ) : (
              <div className="sessions-list">
                {sessions.map((session) => {
                  const isExpanded = expandedSessionId === session.id;
                  const isLoadingThisPreview = loadingPreviewId === session.id;
                  const messages = sessionMessages.get(session.id) ?? [];

                  return (
                    <div key={session.id} className="session-item-card">
                      <div className="session-header-row">
                        <div className="session-info-left">
                          <span className="session-source-badge">
                            {sourceLabel(session.source)}
                          </span>
                          <code className="session-id-tag">{session.id}</code>
                          <span className="session-time-range">
                            {formatSessionTimeRange(
                              session.startedAt,
                              session.endedAt,
                            )}
                          </span>
                        </div>
                        <div className="session-info-right">
                          <span className="session-stat-pill">
                            {format(t.activity.sessionMessagesCount, {
                              n: session.messageCount,
                            })}
                          </span>
                          {session.issueCount > 0 && (
                            <span className="session-issue-pill">
                              {format(t.activity.sessionIssuesCount, {
                                n: session.issueCount,
                              })}
                            </span>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary preview-btn"
                            disabled={isBusy}
                            onClick={() =>
                              void handleTogglePreview(
                                session.id,
                                session.source,
                              )
                            }
                          >
                            {isLoadingThisPreview
                              ? t.activity.loadingSession
                              : isExpanded
                                ? t.activity.collapsePreview
                                : t.activity.previewLocally}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="session-preview-box">
                          {isLoadingThisPreview ? (
                            <p className="evidence-text-faint">
                              {t.activity.loadingSession}
                            </p>
                          ) : previewError ? (
                            <p className="evidence-error">{previewError}</p>
                          ) : messages.length === 0 ? (
                            <p className="evidence-text-faint">
                              No messages in this session.
                            </p>
                          ) : (
                            <div className="evidence-messages-list">
                              {messages.map((m) => (
                                <div key={m.id} className="evidence-msg-item">
                                  <span className={`msg-role-badge ${m.role}`}>
                                    {m.role}
                                  </span>
                                  <div className="msg-text">{m.text}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
