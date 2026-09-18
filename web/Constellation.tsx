// Cosmic Constellation UI (Style A): Star-core nodes, radiating satellite evidence,
// flowing constellation lines, and interactive corner color palette.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Handle,
  Position,
  ReactFlow,
  type Edge,
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
  layoutPosition,
  pickEvidenceMessages,
  sourceLabel,
  type EvidenceMessage,
} from "./report-view.js";

const canvasScale = 11;

if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem("daily_proof_accent_color");
    if (saved) applyAccentColor(saved);
  } catch {
    // ignore
  }
}

const PALETTE_PRESETS = [
  { name: "翡翠星雲 (Emerald)", color: "#10b981" },
  { name: "天青幻光 (Cyan)", color: "#06b6d4" },
  { name: "深空星紫 (Violet)", color: "#8b5cf6" },
  { name: "超新星金 (Gold)", color: "#f59e0b" },
  { name: "星雲玫粉 (Rose)", color: "#ec4899" },
];

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16) || 16,
    g: parseInt(clean.substring(2, 4), 16) || 185,
    b: parseInt(clean.substring(4, 6), 16) || 129,
  };
}

function applyAccentColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-text", hex);
  document.documentElement.style.setProperty(
    "--accent-glow",
    `rgba(${r}, ${g}, ${b}, 0.35)`,
  );
  document.documentElement.style.setProperty(
    "--accent-dim",
    `rgba(${r}, ${g}, ${b}, 0.15)`,
  );
  document.documentElement.style.setProperty(
    "--accent-line",
    `rgba(${r}, ${g}, ${b}, 0.65)`,
  );
  try {
    localStorage.setItem("daily_proof_accent_color", hex);
  } catch {
    // ignore
  }
}

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speed: number;
}

interface Meteor {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  alpha: number;
}

function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let stars: Star[] = [];
    const meteors: Meteor[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      stars = Array.from({ length: 140 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.006,
      }));
    }

    resize();
    window.addEventListener("resize", resize);

    function spawnMeteor() {
      if (!canvas || meteors.length >= 2 || Math.random() > 0.012) return;
      meteors.push({
        x: Math.random() * canvas.width * 0.8 + canvas.width * 0.1,
        y: Math.random() * canvas.height * 0.4,
        length: Math.random() * 80 + 60,
        speed: Math.random() * 5 + 7,
        angle: Math.PI / 4 + (Math.random() - 0.5) * 0.2,
        alpha: 1,
      });
    }

    function render() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const accent =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim() || "#10b981";

      // 1. Nebula clouds synced with theme accent color
      const grad1 = ctx.createRadialGradient(
        canvas.width * 0.28,
        canvas.height * 0.32,
        50,
        canvas.width * 0.28,
        canvas.height * 0.32,
        480,
      );
      grad1.addColorStop(0, accent + "22");
      grad1.addColorStop(1, "transparent");
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const grad2 = ctx.createRadialGradient(
        canvas.width * 0.78,
        canvas.height * 0.65,
        70,
        canvas.width * 0.78,
        canvas.height * 0.65,
        520,
      );
      grad2.addColorStop(0, "rgba(56, 189, 248, 0.08)");
      grad2.addColorStop(1, "transparent");
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Twinkling celestial stars
      for (const s of stars) {
        s.alpha += s.speed;
        const brightness = ((Math.sin(s.alpha) + 1) / 2) * 0.75 + 0.25;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230, 244, 255, ${brightness.toFixed(3)})`;
        if (s.radius > 1.2) {
          ctx.shadowBlur = 5;
          ctx.shadowColor = accent;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();
      }

      // 3. Occasional shooting stars (meteors)
      spawnMeteor();
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        if (!m) continue;
        const tailX = m.x - Math.cos(m.angle) * m.length;
        const tailY = m.y - Math.sin(m.angle) * m.length;
        const lineGrad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        lineGrad.addColorStop(0, `rgba(255, 255, 255, ${m.alpha})`);
        lineGrad.addColorStop(0.3, accent);
        lineGrad.addColorStop(1, "transparent");

        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 8;
        ctx.shadowColor = accent;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.alpha -= 0.015;
        if (
          m.alpha <= 0 ||
          m.x > canvas.width + 100 ||
          m.y > canvas.height + 100
        ) {
          meteors.splice(i, 1);
        }
      }

      animId = requestAnimationFrame(render);
    }

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield-canvas" />;
}

function ColorPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentColor, setCurrentColor] = useState("#10b981");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("daily_proof_accent_color");
      if (saved) {
        setCurrentColor(saved);
        applyAccentColor(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleSelectColor(color: string) {
    setCurrentColor(color);
    applyAccentColor(color);
  }

  return (
    <div className="palette-container">
      <button
        type="button"
        className="palette-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        title="選擇主題主色調"
      >
        <span className="palette-indicator" />
        <span>星系主色</span>
      </button>

      {isOpen ? (
        <div className="palette-menu">
          <p className="palette-title">星雲主題色調</p>
          <div className="palette-presets">
            {PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.color}
                type="button"
                className={`color-swatch ${currentColor === preset.color ? "active" : ""}`}
                style={{ backgroundColor: preset.color }}
                onClick={() => {
                  handleSelectColor(preset.color);
                  setIsOpen(false);
                }}
                title={preset.name}
              />
            ))}
          </div>
          <div className="custom-color-row">
            <span>自訂色碼</span>
            <input
              type="color"
              value={currentColor}
              onChange={(e) => handleSelectColor(e.target.value)}
              title="自訂顏色"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface AchievementNodeData {
  id: string;
  title: string;
  detail: string;
  category?: string;
  evidence: EvidenceRef[];
  reportDate?: string;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onReportUpdated?: (report: AchievementReportV1) => void;
  onError?: (message: string) => void;
  [key: string]: unknown;
}

interface SatelliteNodeData {
  id: string;
  parentId: string;
  ref: EvidenceRef;
  reportDate?: string;
  onViewSource: (ref: EvidenceRef) => void;
  [key: string]: unknown;
}

function AchievementNode({ data }: NodeProps & { data: AchievementNodeData }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const [editTitle, setEditTitle] = useState(data.title);
  const [editDetail, setEditDetail] = useState(data.detail);
  const [editError, setEditError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEditTitle(data.title);
    setEditDetail(data.detail);
  }, [data.title, data.detail]);

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

  return (
    <article
      className={`achievement-card ${data.isExpanded ? "is-expanded" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="target-center"
        className="react-flow__handle"
        style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-center"
        className="react-flow__handle"
        style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
      />

      {isEditing ? (
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
      ) : (
        <>
          <div className="card-top-row">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span className="star-core-badge">✦</span>
              <span className="category-chip">
                {data.category ?? "ACHIEVEMENT"}
              </span>
            </div>
            {data.reportDate ? (
              <span className="card-date">{data.reportDate}</span>
            ) : null}
          </div>

          <h2>{data.title}</h2>
          <p className="node-detail">{data.detail}</p>

          <div className="card-controls-row nodrag">
            {data.evidence.length > 0 ? (
              <button
                type="button"
                className={`btn-constellation-expand ${data.isExpanded ? "is-active" : ""}`}
                onClick={() => data.onToggleExpand(data.id)}
              >
                <span>
                  {data.isExpanded ? "⬡ 收合星座連線" : "✦ 展開星座連線"}
                </span>
                <span className="badge-count">{data.evidence.length}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="card-sub-actions">
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
                    style={{ color: "var(--accent-text)" }}
                    onClick={handleConfirmRemove}
                  >
                    Confirm
                  </button>
                  <button type="button" onClick={() => setIsRemoving(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setIsRemoving(true)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function SatelliteNode({ data }: NodeProps & { data: SatelliteNodeData }) {
  const msgCount = data.ref.messageIds?.length
    ? `${data.ref.messageIds.length} msgs`
    : "all";

  return (
    <div
      className="satellite-card nodrag"
      onClick={() => data.onViewSource(data.ref)}
      title="點擊檢視原始對話紀錄"
    >
      <Handle
        type="target"
        position={Position.Top}
        id="target-center"
        className="react-flow__handle"
        style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-center"
        className="react-flow__handle"
        style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
      />

      <div className="satellite-header">
        <span className="satellite-source-tag">
          {sourceLabel(data.ref.source)}
        </span>
        <span className="satellite-count">{msgCount}</span>
      </div>
      <p className="satellite-title">{data.ref.recordId}</p>
      <div className="satellite-footer">
        <span>查看原始對話</span>
        <span>→</span>
      </div>
    </div>
  );
}

function SessionModal({
  refData,
  reportDate,
  onClose,
}: {
  refData: EvidenceRef | null;
  reportDate?: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<EvidenceMessage[]>([]);
  const [missingIds, setMissingIds] = useState<string[]>([]);

  useEffect(() => {
    if (!refData) return;
    let active = true;
    setLoading(true);
    setError(null);

    async function load() {
      if (!refData) return;
      if (!isLocallyTraceable(refData.source)) {
        setError("Source preview isn't available for this source yet.");
        setLoading(false);
        return;
      }
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

    void load();
    return () => {
      active = false;
    };
  }, [refData, reportDate]);

  if (!refData) return null;

  return (
    <div className="session-modal-backdrop" onClick={onClose}>
      <div className="session-modal" onClick={(e) => e.stopPropagation()}>
        <div className="session-modal-header">
          <div>
            <h3>{sourceLabel(refData.source)}</h3>
            <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
              {refData.recordId}
            </span>
          </div>
          <button type="button" className="session-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="session-modal-body">
          {loading ? (
            <p style={{ color: "var(--muted)" }}>正在載入對話工作階段…</p>
          ) : error ? (
            <p style={{ color: "var(--accent-text)" }}>{error}</p>
          ) : (
            <div className="evidence">
              {messages.length === 0 && missingIds.length === 0 ? (
                <p>此工作階段無訊息。</p>
              ) : null}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="evidence-message"
                  style={{ marginBottom: "0.8rem" }}
                >
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--accent-text)",
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {message.role}:
                  </div>
                  <div
                    style={{
                      color: "#e2e8f0",
                      whiteSpace: "pre-wrap",
                      fontSize: "0.78rem",
                      marginTop: "0.2rem",
                    }}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {missingIds.map((id) => (
                <p
                  key={id}
                  style={{ color: "var(--muted)", fontStyle: "italic" }}
                >
                  Message {id} is no longer in this session.
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  achievement: AchievementNode,
  satellite: SatelliteNode,
};

export function Constellation() {
  const [report, setReport] = useState<AchievementReportV1 | null>(null);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedRef, setSelectedRef] = useState<EvidenceRef | null>(null);

  const handleReportUpdated = useCallback(
    (updatedReport: AchievementReportV1) => {
      setReport(updatedReport);
      const incomplete = describeIncomplete(updatedReport.incomplete);
      if (incomplete.length) setStatus(incomplete.join(" "));
      else if (updatedReport.achievements.length === 0)
        setStatus("No achievements were found for this day.");
      else setStatus(undefined);
    },
    [],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function applyLatestReport() {
      try {
        const response = await fetch("/api/reports/latest");
        if (!active) return;

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
        if (!active) return;
        handleReportUpdated(body.report);
        // Expand the first achievement with evidence by default so constellation lines are visible immediately
        const firstWithEvidence = body.report.achievements.find(
          (ach) => ach.evidence && ach.evidence.length > 0,
        );
        if (firstWithEvidence) {
          setExpandedIds(new Set([firstWithEvidence.id]));
        }
      } catch {
        if (!active) return;
        setReport(null);
        setStatus("The report could not be loaded.");
      }
    }

    void applyLatestReport();
    return () => {
      active = false;
    };
  }, [handleReportUpdated]);

  const hasExpandable = useMemo(() => {
    return (
      report?.achievements.some(
        (ach) => ach.evidence && ach.evidence.length > 0,
      ) ?? false
    );
  }, [report]);

  const allExpanded = useMemo(() => {
    if (!report || report.achievements.length === 0) return false;
    const withEvidence = report.achievements.filter(
      (ach) => ach.evidence && ach.evidence.length > 0,
    );
    if (withEvidence.length === 0) return false;
    return withEvidence.every((ach) => expandedIds.has(ach.id));
  }, [report, expandedIds]);

  const handleToggleAll = useCallback(() => {
    if (!report) return;
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      const allIds = report.achievements
        .filter((ach) => ach.evidence && ach.evidence.length > 0)
        .map((ach) => ach.id);
      setExpandedIds(new Set(allIds));
    }
  }, [report, allExpanded]);

  const { nodes, edges } = useMemo(() => {
    if (!report || report.achievements.length === 0) {
      return { nodes: [], edges: [] };
    }

    const generatedNodes: Node[] = [];
    const generatedEdges: Edge[] = [];
    const count = report.achievements.length;
    const centerX = 50 * canvasScale;
    const centerY = 52 * canvasScale;

    // 1. Primary achievement nodes
    report.achievements.forEach((ach, index) => {
      const basePos = layoutPosition(index, count);
      const px = basePos.x * canvasScale;
      const py = basePos.y * canvasScale;
      const isExpanded = expandedIds.has(ach.id);

      generatedNodes.push({
        id: ach.id,
        type: "achievement",
        position: { x: px, y: py },
        data: {
          id: ach.id,
          title: ach.title,
          detail: ach.detail,
          category: ach.category,
          evidence: ach.evidence,
          reportDate: report.date,
          isExpanded,
          onToggleExpand: handleToggleExpand,
          onReportUpdated: handleReportUpdated,
          onError: (msg: string) => setStatus(msg),
        },
      });

      // 2. Radiating satellites when expanded
      if (isExpanded && ach.evidence.length > 0) {
        const M = ach.evidence.length;
        const dx = px - centerX;
        const dy = py - centerY;
        const dist = Math.hypot(dx, dy);
        const baseAngle = dist > 0.001 ? Math.atan2(dy, dx) : 0;
        const angleSpan = Math.min(Math.PI * 0.88, (M - 1) * 0.45);

        ach.evidence.forEach((ref, refIdx) => {
          const satId = `sat-${ach.id}-${refIdx}`;
          const angle =
            count === 1
              ? (2 * Math.PI * refIdx) / M
              : baseAngle +
                (M === 1 ? 0 : (refIdx / (M - 1) - 0.5) * angleSpan);
          const radiusX = 350;
          const radiusY = 240;
          const sx = px + Math.cos(angle) * radiusX;
          const sy = py + Math.sin(angle) * radiusY;

          generatedNodes.push({
            id: satId,
            type: "satellite",
            position: { x: sx, y: sy },
            data: {
              id: satId,
              parentId: ach.id,
              ref,
              reportDate: report.date,
              onViewSource: (selected: EvidenceRef) => setSelectedRef(selected),
            },
          });

          generatedEdges.push({
            id: `edge-${ach.id}-${satId}`,
            source: ach.id,
            target: satId,
            sourceHandle: "source-center",
            targetHandle: "target-center",
            type: "straight",
            animated: true,
            style: { stroke: "var(--accent-line)", strokeWidth: 2 },
          });
        });
      }
    });

    // 3. Constellation spine edges connecting primary stars
    if (count >= 2) {
      for (let i = 0; i < count; i++) {
        const nextIdx = (i + 1) % count;
        if (count === 2 && i === 1) continue;
        const currentAch = report.achievements[i];
        const nextAch = report.achievements[nextIdx];
        if (!currentAch || !nextAch) continue;
        generatedEdges.push({
          id: `spine-${currentAch.id}-${nextAch.id}`,
          source: currentAch.id,
          target: nextAch.id,
          sourceHandle: "source-center",
          targetHandle: "target-center",
          type: "straight",
          className: "spine-edge",
        });
      }
    }

    return { nodes: generatedNodes, edges: generatedEdges };
  }, [report, expandedIds, handleToggleExpand, handleReportUpdated]);

  return (
    <>
      <StarfieldBackground />
      <header className="page-header">
        <span className="brand">Daily Proof</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            pointerEvents: "auto",
          }}
        >
          {report?.date ? (
            <time dateTime={report.date}>{report.date}</time>
          ) : null}
          {hasExpandable ? (
            <button
              type="button"
              className="palette-trigger"
              onClick={handleToggleAll}
              title={allExpanded ? "收合全部星系連線" : "展開全部星系連線"}
            >
              <span>{allExpanded ? "⬡ 全部收合" : "✦ 全部展開"}</span>
            </button>
          ) : null}
          <ColorPalette />
        </div>
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
          <ReactFlow
            key={report?.date ?? "empty"}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.2}
            maxZoom={1.8}
          />
        </div>
        {selectedRef ? (
          <SessionModal
            refData={selectedRef}
            reportDate={report?.date}
            onClose={() => setSelectedRef(null)}
          />
        ) : null}
      </main>
    </>
  );
}
