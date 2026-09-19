import { useCallback, useEffect, useState } from "react";
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

type ViewMode = "journal" | "bento" | "briefing";

interface EvidenceDrawerProps {
  refData: EvidenceRef;
  reportDate?: string;
}

function EvidenceDrawer({ refData, reportDate }: EvidenceDrawerProps) {
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
          來源來自 {sourceLabel(refData.source)}
          （線上歷史紀錄暫不支援本機直接預覽）。
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
        <p className="evidence-text-faint">正在載入對話工作階段…</p>
      ) : error ? (
        <p className="evidence-error">{error}</p>
      ) : (
        <div className="evidence-messages-list">
          {messages.length === 0 && missingIds.length === 0 ? (
            <p className="evidence-text-faint">此工作階段無訊息。</p>
          ) : null}
          {messages.map((m) => (
            <div key={m.id} className="evidence-msg-item">
              <span className={`msg-role-badge ${m.role}`}>{m.role}</span>
              <div className="msg-text">{m.text}</div>
            </div>
          ))}
          {missingIds.map((id) => (
            <p key={id} className="evidence-stale-id">
              訊息 {id} 已不存在於此工作階段（可能已被修剪或歸檔）。
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
}

function AchievementCard({
  achievement,
  reportDate,
  onReportUpdated,
  onError,
  isHero = false,
}: AchievementCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [editTitle, setEditTitle] = useState(achievement.title);
  const [editDetail, setEditDetail] = useState(achievement.detail);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | undefined>(undefined);
  const [expandedEvidence, setExpandedEvidence] = useState<number | null>(null);

  useEffect(() => {
    setEditTitle(achievement.title);
    setEditDetail(achievement.detail);
  }, [achievement.title, achievement.detail]);

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
          }),
        },
      );
      const body = (await response.json().catch(() => undefined)) as
        | { report?: AchievementReportV1; error?: { message?: string } }
        | undefined;
      if (!response.ok || !body?.report) {
        throw new Error(body?.error?.message ?? "無法儲存變更。");
      }
      setIsEditing(false);
      onReportUpdated(body.report);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "無法儲存變更。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmRemove() {
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(reportDate)}/achievements/${encodeURIComponent(achievement.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => undefined)) as
        | { report?: AchievementReportV1; error?: { message?: string } }
        | undefined;
      if (!response.ok || !body?.report) {
        throw new Error(body?.error?.message ?? "無法刪除此成就。");
      }
      setIsRemoving(false);
      onReportUpdated(body.report);
    } catch (err) {
      setIsRemoving(false);
      onError(err instanceof Error ? err.message : "無法刪除此成就。");
    }
  }

  const category = achievement.category || "progress";
  const cardClassName = `journal-card category-${category} ${isHero ? "hero-card" : ""}`;

  return (
    <article className={cardClassName}>
      {isHero ? (
        <div className="hero-badge-tag">
          <span>🌟</span> 今日核心里程碑
        </div>
      ) : null}

      {isEditing ? (
        <form className="journal-edit-form" onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor={`edit-title-${achievement.id}`}>
              成就標題（簡短精煉）
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
              詳細成果（1-2句具體結論）
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
          {editError ? <p className="form-error">{editError}</p> : null}
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "儲存中…" : "儲存"}
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
              }}
            >
              取消
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
                  <span className="remove-prompt">確定刪除？</span>
                  <button
                    type="button"
                    className="action-btn action-danger"
                    onClick={handleConfirmRemove}
                  >
                    確定
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => setIsRemoving(false)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => setIsEditing(true)}
                    title="編輯成就內容"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => setIsRemoving(true)}
                    title="刪除成就"
                  >
                    刪除
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
                        {sourceLabel(ref.source)} · {count} 條紀錄佐證
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
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

export function ZenJournal() {
  const [report, setReport] = useState<AchievementReportV1 | null>(null);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
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

  const loadReport = useCallback(async (date?: string) => {
    setLoading(true);
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
        setStatus("今日對話中未發現符合標準的具體成就。");
      } else {
        setStatus(undefined);
      }
    } catch {
      setReport(null);
      setStatus("The report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  function shiftDate(offsetDays: number) {
    if (!report?.date) return;
    const [y, m, d] = report.date.split("-").map(Number);
    if (!y || !m || !d) return;
    const current = new Date(Date.UTC(y, m - 1, d));
    current.setUTCDate(current.getUTCDate() + offsetDays);
    const nextDate = current.toISOString().slice(0, 10);
    void loadReport(nextDate);
  }

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
          {report ? (
            <div className="date-display">
              <span className="date-string">{report.date}</span>
              <span className="status-tag verified">已驗證</span>
            </div>
          ) : (
            <span className="date-string">每日成就檢視</span>
          )}
          <div className="nav-btn-group">
            <button
              type="button"
              className="zen-nav-btn"
              onClick={() => shiftDate(-1)}
              title="前一天"
              disabled={loading || !report}
            >
              ←
            </button>
            <button
              type="button"
              className="zen-nav-btn"
              onClick={() => void loadReport()}
              title="回到最新報告"
              disabled={loading}
            >
              最新
            </button>
            <button
              type="button"
              className="zen-nav-btn"
              onClick={() => shiftDate(1)}
              title="後一天"
              disabled={loading || !report}
            >
              →
            </button>
          </div>
        </div>
      </header>

      {/* 3 Design Directions Switcher Bar */}
      <nav className="concept-switcher-bar" aria-label="設計風格切換">
        <button
          type="button"
          className={`concept-btn ${viewMode === "journal" ? "active" : ""}`}
          onClick={() => changeViewMode("journal")}
        >
          <span>📖</span> 方案 A：極簡手帳 (Linear)
        </button>
        <button
          type="button"
          className={`concept-btn ${viewMode === "bento" ? "active" : ""}`}
          onClick={() => changeViewMode("bento")}
        >
          <span>🍱</span> 方案 B：焦點 Bento (Apple)
        </button>
        <button
          type="button"
          className={`concept-btn ${viewMode === "briefing" ? "active" : ""}`}
          onClick={() => changeViewMode("briefing")}
        >
          <span>📝</span> 方案 C：晨昏簡報 (Notion)
        </button>
      </nav>

      <main className="zen-main-container">
        {loading ? (
          <div className="zen-state-card">
            <p className="zen-state-text">正在載入成就報告…</p>
          </div>
        ) : report ? (
          <>
            <section className="zen-meta-bar">
              <div className="meta-left">
                <span className="meta-count">
                  🎯 <strong>{report.achievements.length}</strong> 項具體成果
                </span>
                <span className="meta-divider">•</span>
                <span className="meta-source">
                  來源：
                  {report.coverage.map((c) => sourceLabel(c.source)).join("、")}
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
                  />
                ))}
              </section>
            )}

            {/* View 2: Bento Grid (Hero card + 2-col subcards) */}
            {viewMode === "bento" && (
              <section className="bento-layout-container">
                {report.achievements[0] ? (
                  <AchievementCard
                    key={report.achievements[0].id}
                    achievement={report.achievements[0]}
                    reportDate={report.date}
                    onReportUpdated={(updated) => setReport(updated)}
                    onError={(err) => setStatus(err)}
                    isHero={true}
                  />
                ) : null}

                {report.achievements.length > 1 ? (
                  <div className="bento-sub-grid">
                    {report.achievements.slice(1).map((ach) => (
                      <AchievementCard
                        key={ach.id}
                        achievement={ach}
                        reportDate={report.date}
                        onReportUpdated={(updated) => setReport(updated)}
                        onError={(err) => setStatus(err)}
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
                    <span className="sec-icon">🚀</span> 關鍵成果 (Deliverables)
                  </div>
                  <div className="briefing-items-group">
                    {deliverables.map((ach) => (
                      <AchievementCard
                        key={ach.id}
                        achievement={ach}
                        reportDate={report.date}
                        onReportUpdated={(updated) => setReport(updated)}
                        onError={(err) => setStatus(err)}
                      />
                    ))}
                    {deliverables.length === 0 ? (
                      <p className="evidence-text-faint">本日無進展類成果。</p>
                    ) : null}
                  </div>

                  {decisions.length > 0 ? (
                    <>
                      <div
                        className="briefing-section-header"
                        style={{ color: "#c084fc", marginTop: "2rem" }}
                      >
                        <span className="sec-icon">🧭</span> 關鍵決策與止損
                        (Decisions)
                      </div>
                      <div className="briefing-items-group">
                        {decisions.map((ach) => (
                          <AchievementCard
                            key={ach.id}
                            achievement={ach}
                            reportDate={report.date}
                            onReportUpdated={(updated) => setReport(updated)}
                            onError={(err) => setStatus(err)}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}

                  <div className="briefing-conclusion-callout">
                    <span>✨</span>{" "}
                    今日評估：關鍵目標全數落地，及時排除無效雜訊，時間利用率高。
                  </div>
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="zen-state-card">
            <h2 className="zen-empty-title">尚無報告</h2>
            <p className="zen-state-text">
              {status || "No report has been generated yet."}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "16px" }}
              onClick={() => void loadReport()}
            >
              重新整理
            </button>
          </div>
        )}
      </main>

      <footer className="zen-footer">
        <p>所有對話紀錄均於本機 macOS 本地解析與儲存 · 遵循零隱私洩漏原則</p>
      </footer>
    </div>
  );
}
