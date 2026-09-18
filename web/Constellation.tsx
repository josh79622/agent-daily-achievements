// Migration Task 3: port Expand/Show source/Edit/Remove into the React Flow
// node component. The sign-in/local-activity panels are Task 4.
import { useCallback, useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  AchievementReportV1,
  EvidenceRef,
} from "../src/report/contract.js";
import {
  describeIncomplete,
  isLocallyTraceable,
  mapAchievementsToNodes,
  pickEvidenceMessages,
  sourceLabel,
  type EvidenceMessage,
} from "./report-view.js";

/** How far apart layoutPosition's 0-100 grid is spread on the React Flow
 * canvas. An arbitrary pixel scale, not yet the organic scatter noted as a
 * later visual-polish task in report-view.ts. */
const canvasScale = 6;

interface AchievementNodeData {
  id: string;
  title: string;
  detail: string;
  evidence: EvidenceRef[];
  reportDate?: string;
  onReportUpdated?: (report: AchievementReportV1) => void;
  onError?: (message: string) => void;
  [key: string]: unknown;
}

interface SourceRecord {
  ref: EvidenceRef;
  byline: string;
  notTraceable?: boolean;
  error?: string;
  messages?: EvidenceMessage[];
  missingIds?: string[];
}

function AchievementNode({ data }: NodeProps & { data: AchievementNodeData }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const [editTitle, setEditTitle] = useState(data.title);
  const [editDetail, setEditDetail] = useState(data.detail);
  const [editError, setEditError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceRecords, setSourceRecords] = useState<SourceRecord[] | null>(
    null,
  );

  useEffect(() => {
    setEditTitle(data.title);
    setEditDetail(data.detail);
  }, [data.title, data.detail]);

  useEffect(() => {
    setSourceRecords(null);
    setShowSource(false);
  }, [data.reportDate, data.id]);

  async function loadSources() {
    setSourceLoading(true);
    try {
      const records = await Promise.all(
        data.evidence.map(async (ref): Promise<SourceRecord> => {
          const byline = `${sourceLabel(ref.source)} · ${ref.recordId}`;
          if (!isLocallyTraceable(ref.source)) {
            return { ref, byline, notTraceable: true };
          }
          try {
            const dateQuery = data.reportDate
              ? `&date=${encodeURIComponent(data.reportDate)}`
              : "";
            const response = await fetch(
              `/api/collector/sessions/${encodeURIComponent(ref.recordId)}?source=${encodeURIComponent(ref.source)}${dateQuery}`,
            );
            if (!response.ok) {
              const body = (await response.json().catch(() => undefined)) as
                { error?: { message?: string } } | undefined;
              return {
                ref,
                byline,
                error: body?.error?.message ?? "Source session unavailable.",
              };
            }
            const body = (await response.json()) as {
              session: { messages: EvidenceMessage[] };
            };
            const { found, missingIds } = pickEvidenceMessages(
              body.session.messages,
              ref.messageIds,
            );
            return { ref, byline, messages: found, missingIds };
          } catch (err) {
            return {
              ref,
              byline,
              error:
                err instanceof Error
                  ? err.message
                  : "Source session unavailable.",
            };
          }
        }),
      );
      setSourceRecords(records);
    } finally {
      setSourceLoading(false);
    }
  }

  function handleToggleSource() {
    if (showSource) {
      setShowSource(false);
    } else {
      setShowSource(true);
      if (!sourceRecords && !sourceLoading) {
        void loadSources();
      }
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.reportDate) return;
    setIsSaving(true);
    setEditError(undefined);
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(data.reportDate)}/achievements/${encodeURIComponent(data.id)}`,
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
        throw new Error(body?.error?.message ?? "The edit could not be saved.");
      }
      setIsEditing(false);
      data.onReportUpdated?.(body.report);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "The edit could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmRemove() {
    if (!data.reportDate) return;
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(data.reportDate)}/achievements/${encodeURIComponent(data.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => undefined)) as
        | { report?: AchievementReportV1; error?: { message?: string } }
        | undefined;
      if (!response.ok || !body?.report) {
        throw new Error(
          body?.error?.message ?? "The achievement could not be removed.",
        );
      }
      setIsRemoving(false);
      data.onReportUpdated?.(body.report);
    } catch (err) {
      setIsRemoving(false);
      data.onError?.(
        err instanceof Error
          ? err.message
          : "The achievement could not be removed.",
      );
    }
  }

  const cardClasses = [
    "achievement-card",
    isExpanded ? "is-expanded" : "",
    showSource ? "has-source" : "",
    isEditing ? "is-editing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isEditing) {
    return (
      <article className={cardClasses}>
        <form className="node-edit-form nodrag" onSubmit={handleSaveEdit}>
          <textarea
            aria-label="Title"
            maxLength={120}
            rows={2}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            disabled={isSaving}
          />
          <textarea
            aria-label="Detail"
            maxLength={500}
            rows={5}
            value={editDetail}
            onChange={(e) => setEditDetail(e.target.value)}
            disabled={isSaving}
          />
          {editError ? <p className="node-edit-error">{editError}</p> : null}
          <div className="node-edit-actions">
            <button type="submit" className="text-button" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={isSaving}
              onClick={() => {
                setIsEditing(false);
                setEditError(undefined);
                setEditTitle(data.title);
                setEditDetail(data.detail);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className={cardClasses}>
      <h2>{data.title}</h2>
      <p className="node-detail">{data.detail}</p>
      <div className="node-controls nodrag">
        <button
          type="button"
          aria-pressed={isExpanded}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          Expand
        </button>
        {data.evidence.length > 0 ? (
          <button
            type="button"
            aria-pressed={showSource}
            onClick={handleToggleSource}
          >
            Show source
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setEditError(undefined);
          }}
        >
          Edit
        </button>
        {isRemoving ? (
          <>
            <button
              type="button"
              className="text-button"
              onClick={handleConfirmRemove}
            >
              Confirm remove
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setIsRemoving(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setIsRemoving(true)}>
            Remove
          </button>
        )}
      </div>

      {showSource ? (
        <div className="evidence nodrag">
          {sourceLoading ? (
            <p>Loading source…</p>
          ) : sourceRecords ? (
            sourceRecords.map((record) => (
              <div
                key={`${record.ref.source}-${record.ref.recordId}`}
                className="evidence-record"
              >
                <p className="evidence-byline">{record.byline}</p>
                {record.notTraceable ? (
                  <p>Source preview isn't available for this source yet.</p>
                ) : record.error ? (
                  <p>{record.error}</p>
                ) : (
                  <>
                    {record.messages?.length === 0 &&
                    record.missingIds?.length === 0 ? (
                      <p>No messages in this session.</p>
                    ) : null}
                    {record.messages?.map((message) => (
                      <p key={message.id} className="evidence-message">
                        {message.role}: {message.text}
                      </p>
                    ))}
                    {record.missingIds?.map((id) => (
                      <p key={id} className="evidence-message">
                        Message {id} is no longer in this session.
                      </p>
                    ))}
                  </>
                )}
              </div>
            ))
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

const nodeTypes = { achievement: AchievementNode };

export function Constellation() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [reportDate, setReportDate] = useState<string | undefined>(undefined);
  const [nodes, setNodes] = useState<Node[]>([]);

  const applyReport = useCallback((report: AchievementReportV1) => {
    setReportDate(report.date);
    setNodes(
      mapAchievementsToNodes(report.achievements).map((node) => ({
        id: node.id,
        type: "achievement",
        position: { x: node.x * canvasScale, y: node.y * canvasScale },
        data: {
          id: node.id,
          title: node.title,
          detail: node.detail,
          evidence: node.evidence,
          reportDate: report.date,
          onReportUpdated: applyReport,
          onError: (message: string) => setStatus(message),
        },
      })),
    );

    const incomplete = describeIncomplete(report.incomplete);
    if (incomplete.length) setStatus(incomplete.join(" "));
    else if (report.achievements.length === 0)
      setStatus("No achievements were found for this day.");
    else setStatus(undefined);
  }, []);

  useEffect(() => {
    let active = true;

    void applyLatestReport();
    return () => {
      active = false;
    };

    async function applyLatestReport() {
      const response = await fetch("/api/reports/latest");
      if (!active) return;

      if (response.status === 404) {
        setNodes([]);
        setReportDate(undefined);
        setStatus("No report has been generated yet.");
        return;
      }
      if (!response.ok) {
        setNodes([]);
        setStatus("The report could not be loaded.");
        return;
      }

      const body = (await response.json()) as { report: AchievementReportV1 };
      if (!active) return;
      applyReport(body.report);
    }
  }, [applyReport]);

  return (
    <>
      <header className="page-header">
        <span className="brand">Daily Proof</span>
        {reportDate ? <time dateTime={reportDate}>{reportDate}</time> : null}
      </header>
      <main>
        {status ? (
          <p className="constellation-status" role="status">
            {status}
          </p>
        ) : null}
        <div
          className="constellation"
          aria-label="Today's achievement constellation"
        >
          <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} fitView>
            <Background variant={BackgroundVariant.Dots} />
          </ReactFlow>
        </div>
      </main>
    </>
  );
}
