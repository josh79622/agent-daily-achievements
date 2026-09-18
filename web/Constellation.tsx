// Migration Task 2: the constellation on React Flow, fetching the real
// report. Node interactions (Expand/Show source/Edit/Remove) and the
// sign-in/local-activity panels are Tasks 3 and 4 — not here yet.
import { useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { AchievementReportV1 } from "../src/report/contract.js";
import { describeIncomplete, mapAchievementsToNodes } from "./report-view.js";

/** How far apart layoutPosition's 0-100 grid is spread on the React Flow
 * canvas. An arbitrary pixel scale, not yet the organic scatter noted as a
 * later visual-polish task in report-view.ts. */
const canvasScale = 6;

interface AchievementNodeData {
  title: string;
  detail: string;
}

function AchievementNode({ data }: NodeProps & { data: AchievementNodeData }) {
  return (
    <article className="achievement-card">
      <h2>{data.title}</h2>
      <p>{data.detail}</p>
    </article>
  );
}

const nodeTypes = { achievement: AchievementNode };

export function Constellation() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [reportDate, setReportDate] = useState<string | undefined>(undefined);
  const [nodes, setNodes] = useState<Node[]>([]);

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
      const report = body.report;

      setReportDate(report.date);
      setNodes(
        mapAchievementsToNodes(report.achievements).map((node) => ({
          id: node.id,
          type: "achievement",
          position: { x: node.x * canvasScale, y: node.y * canvasScale },
          data: { title: node.title, detail: node.detail },
        })),
      );

      const incomplete = describeIncomplete(report.incomplete);
      if (incomplete.length) setStatus(incomplete.join(" "));
      else if (report.achievements.length === 0)
        setStatus("No achievements were found for this day.");
      else setStatus(undefined);
    }
  }, []);

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
