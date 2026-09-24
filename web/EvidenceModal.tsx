import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Achievement, EvidenceRef } from "../src/report/contract.js";
import {
  isLocallyTraceable,
  pickEvidenceMessages,
  sourceLabel,
  type EvidenceMessage,
} from "./report-view.js";
import { format, type Translations } from "./i18n.js";

export interface EvidenceDrawerProps {
  refData: EvidenceRef;
  reportDate?: string;
  t: Translations;
}

export function EvidenceDrawer({
  refData,
  reportDate,
  t,
}: EvidenceDrawerProps) {
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

export interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  achievement: Achievement;
  reportDate?: string;
  t: Translations;
}

export function EvidenceModal({
  isOpen,
  onClose,
  achievement,
  reportDate,
  t,
}: EvidenceModalProps) {
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = useState(0);

  useEffect(() => {
    setSelectedEvidenceIndex(0);
  }, [achievement?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !achievement) return null;

  const category = achievement.category || "progress";
  const evidenceList = achievement.evidence ?? [];
  const selectedEvidence =
    evidenceList[selectedEvidenceIndex] ?? evidenceList[0];

  const modalContent = (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="evidence-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`evidence-modal-title-${achievement.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header evidence-modal-header">
          <div className="evidence-modal-heading">
            <div className="evidence-modal-title-row">
              <span className={`status-dot ${category}`} title={category} />
              {achievement.isPrimary ? (
                <span className="hero-badge-tag primary-badge-tag">
                  {t.badges.primary}
                </span>
              ) : null}
              <h2
                id={`evidence-modal-title-${achievement.id}`}
                className="evidence-modal-title"
              >
                {achievement.title}
              </h2>
              {achievement.project ? (
                <span className="project-badge" title={achievement.project}>
                  <span className="project-badge-icon">📁</span>
                  <span className="project-badge-name">
                    {achievement.project}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label={t.settings.close}
            title={t.settings.close}
          >
            ✕
          </button>
        </header>

        <div className="modal-body evidence-modal-body">
          {achievement.detail ? (
            <p className="evidence-modal-detail">{achievement.detail}</p>
          ) : null}

          <section className="evidence-modal-section">
            <div className="evidence-section-header-label">
              📎 {t.card.evidenceModalTitle} ({evidenceList.length})
            </div>
            <div className="evidence-pills-scroll-container">
              <div className="evidence-pills-row">
                {evidenceList.map((ref, idx) => {
                  const isSelected = selectedEvidenceIndex === idx;
                  const count = ref.messageIds?.length ?? 1;
                  return (
                    <button
                      key={`${ref.recordId}-${idx}`}
                      type="button"
                      className={`evidence-pill ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedEvidenceIndex(idx)}
                    >
                      <span>📎</span>
                      <span>
                        {sourceLabel(ref.source)} ·{" "}
                        {format(t.card.evidenceCount, { n: count })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="evidence-modal-section">
            <div className="evidence-drawer-fixed-container">
              {selectedEvidence ? (
                <EvidenceDrawer
                  refData={selectedEvidence}
                  reportDate={reportDate}
                  t={t}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
