type NodeKind = "achievement" | "event" | "detail";

interface ConstellationNode {
  id: string;
  parentId?: string;
  title: string;
  detail: string;
  kind: NodeKind;
  x: number;
  y: number;
}

const constellation = requiredElement<HTMLElement>("constellation");
const collectorToggle = requiredElement<HTMLButtonElement>("collector-toggle");
const collectorPanel = requiredElement<HTMLElement>("collector-panel");
const collectorClose = requiredElement<HTMLButtonElement>("collector-close");
const collectorStatus = requiredElement<HTMLElement>("collector-status");
const collectorSources = requiredElement<HTMLElement>("collector-sources");
const collectorSessions = requiredElement<HTMLElement>("collector-sessions");
const nodes: ConstellationNode[] = [
  {
    id: "reliable-reports",
    title: "Made the report generator reliable",
    detail: "Fixed the date-boundary bug and confirmed the regression test.",
    kind: "achievement",
    x: 27,
    y: 42,
  },
  {
    id: "local-first",
    title: "Kept the first release local",
    detail: "Protected private work records by keeping the workflow on-device.",
    kind: "achievement",
    x: 51,
    y: 54,
  },
  {
    id: "verification",
    title: "Clarified what verification means",
    detail:
      "Separated recording a change from proving that it behaves correctly.",
    kind: "achievement",
    x: 75,
    y: 37,
  },
  {
    id: "boundary-test",
    parentId: "reliable-reports",
    title: "Date-boundary regression",
    detail: "A focused test captured the issue before the fix.",
    kind: "event",
    x: 14,
    y: 67,
  },
  {
    id: "focused-check",
    parentId: "reliable-reports",
    title: "Focused check passed",
    detail: "The repaired path produced the expected report.",
    kind: "event",
    x: 36,
    y: 74,
  },
  {
    id: "privacy-choice",
    parentId: "local-first",
    title: "Privacy choice",
    detail: "The first release remains local-first by design.",
    kind: "event",
    x: 55,
    y: 79,
  },
  {
    id: "commit-evidence",
    parentId: "verification",
    title: "Commit versus evidence",
    detail: "A commit records work; verification supplies confidence.",
    kind: "event",
    x: 86,
    y: 66,
  },
  {
    id: "test-evidence",
    parentId: "boundary-test",
    title: "Regression evidence",
    detail: "The failure was reproduced before implementation changed it.",
    kind: "detail",
    x: 8,
    y: 84,
  },
  {
    id: "local-control",
    parentId: "privacy-choice",
    title: "User control",
    detail: "Local records stay under the user's control.",
    kind: "detail",
    x: 46,
    y: 90,
  },
];

let expandedNodeId: string | undefined;
let relatedNodeId: string | undefined;

renderConstellation();
collectorToggle.addEventListener("click", () => void showCollector());
collectorClose.addEventListener("click", hideCollector);

interface CollectorSession {
  id: string;
  source: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  issueCount: number;
}

const consentForm = requiredElement<HTMLFormElement>("source-consent-form");
const claudeChoice = requiredElement<HTMLInputElement>("source-claude-code");
const codexChoice = requiredElement<HTMLInputElement>("source-codex");
const consentSave = requiredElement<HTMLButtonElement>("source-consent-save");
let collectorRevision = 0;
let savedSources: string[] = [];
consentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveSources();
});

function clearCollection(): number {
  collectorSources.replaceChildren();
  collectorSessions.replaceChildren();
  return nextCollectionRevision();
}

function nextCollectionRevision(): number {
  return ++collectorRevision;
}

function replaceCollection(
  sources: HTMLElement[],
  sessions: HTMLElement[],
): void {
  collectorSources.replaceChildren(...sources);
  collectorSessions.replaceChildren(...sessions);
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok)
    throw new Error(body.error?.message ?? "Local activity is unavailable.");
  return body;
}

async function showCollector(): Promise<void> {
  collectorPanel.hidden = false;
  collectorToggle.setAttribute("aria-expanded", "true");
  const revision = clearCollection();
  collectorStatus.textContent = "Checking source settings…";
  try {
    const consent = await api<{ sources: string[] }>("/api/collector/consent");
    if (revision !== collectorRevision) return;
    savedSources = consent.sources;
    claudeChoice.checked = savedSources.includes("claude-code");
    codexChoice.checked = savedSources.includes("codex");
    await loadCollection(revision);
  } catch (error) {
    showCollectorError(error, revision);
  }
}

async function saveSources(): Promise<void> {
  const sources = [
    ...(claudeChoice.checked ? ["claude-code"] : []),
    ...(codexChoice.checked ? ["codex"] : []),
  ];
  const revision = nextCollectionRevision();
  consentSave.disabled = true;
  collectorStatus.textContent = "Saving source choice…";
  try {
    const consent = await api<{ sources: string[] }>("/api/collector/consent", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sources }),
    });
    if (revision !== collectorRevision) return;
    savedSources = consent.sources;
    await loadCollection(revision, true);
  } catch (error) {
    showCollectorError(error, revision, true);
  } finally {
    consentSave.disabled = false;
  }
}

async function loadCollection(
  revision: number,
  retainExisting = false,
): Promise<void> {
  consentSave.disabled = true;
  const unauthorized = ["claude-code", "codex"].filter(
    (source) => !savedSources.includes(source),
  );
  const sourceLines = unauthorized.map((source) => {
    const line = document.createElement("p");
    line.textContent = `${source} · not authorized`;
    return line;
  });
  if (!savedSources.length) {
    collectorStatus.textContent =
      "Collection is off. Choose sources and save to allow local reads.";
    consentSave.disabled = false;
    return;
  }
  collectorStatus.textContent = "Reading authorized local metadata…";
  try {
    const result = await api<{
      sources: Array<{ source: string; sessions: number; issues: number }>;
      sessions: CollectorSession[];
    }>("/api/collector/today");
    if (revision !== collectorRevision) return;
    result.sources.forEach((source) => {
      const line = document.createElement("p");
      line.className = "collector-source";
      line.textContent = `${source.source} · ${source.sessions} sessions · ${source.issues} issues`;
      sourceLines.push(line);
    });
    replaceCollection(
      sourceLines,
      result.sessions.map((session) => createSession(session, revision)),
    );
    collectorStatus.textContent = "Metadata only — previews stay local.";
  } catch (error) {
    showCollectorError(error, revision, retainExisting);
  } finally {
    consentSave.disabled = false;
  }
}

function showCollectorError(
  error: unknown,
  revision: number,
  retainExisting = false,
): void {
  if (revision !== collectorRevision) return;
  if (!retainExisting) clearCollection();
  collectorStatus.textContent =
    error instanceof Error ? error.message : "Local activity is unavailable.";
}

function hideCollector(): void {
  clearCollection();
  collectorPanel.hidden = true;
  collectorToggle.setAttribute("aria-expanded", "false");
}

function createSession(
  session: CollectorSession,
  revision: number,
): HTMLElement {
  const article = document.createElement("article");
  article.className = "collector-session";
  const title = document.createElement("p");
  title.textContent = `${session.source} · ${session.messageCount} messages`;
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "Preview locally";
  preview.addEventListener("click", async () => {
    preview.disabled = true;
    try {
      const consent = await api<{ sources: string[] }>(
        "/api/collector/consent",
      );
      if (revision !== collectorRevision) return;
      if (JSON.stringify(consent.sources) !== JSON.stringify(savedSources)) {
        await showCollector();
        return;
      }
      const body = await api<{
        session: { messages: Array<{ role: string; text: string }> };
      }>(
        `/api/collector/sessions/${encodeURIComponent(session.id)}?source=${encodeURIComponent(session.source)}`,
      );
      if (revision !== collectorRevision) return;
      const messages = document.createElement("div");
      messages.className = "collector-preview";
      body.session.messages.forEach((message) => {
        const line = document.createElement("p");
        line.textContent = `${message.role}: ${message.text}`;
        messages.append(line);
      });
      preview.replaceWith(messages);
    } catch (error) {
      showCollectorError(error, revision, true);
    }
  });
  article.append(title, preview);
  return article;
}

function renderConstellation(): void {
  constellation.replaceChildren();
  constellation.append(createConnectionLayer());

  nodes.forEach((node) => {
    if (isVisible(node)) constellation.append(createNode(node));
  });
}

function isVisible(node: ConstellationNode): boolean {
  if (node.kind === "achievement") return true;
  return node.parentId === relatedNodeId;
}

function createConnectionLayer(): SVGSVGElement {
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  layer.classList.add("constellation-lines");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("viewBox", "0 0 100 100");
  layer.setAttribute("preserveAspectRatio", "none");

  nodes.forEach((node) => {
    if (!node.parentId || node.parentId !== relatedNodeId) return;
    const parent = nodes.find(({ id }) => id === node.parentId);
    if (!parent) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(parent.x));
    line.setAttribute("y1", String(parent.y));
    line.setAttribute("x2", String(node.x));
    line.setAttribute("y2", String(node.y));
    layer.append(line);
  });

  return layer;
}

function createNode(node: ConstellationNode): HTMLElement {
  const article = document.createElement("article");
  article.className = `constellation-node ${node.kind}-node`;
  article.dataset.nodeId = node.id;
  article.style.setProperty("--x", `${node.x}%`);
  article.style.setProperty("--y", `${node.y}%`);

  if (expandedNodeId === node.id) article.classList.add("is-expanded");
  if (relatedNodeId === node.id) article.classList.add("has-related");

  const title = document.createElement("h2");
  title.textContent = node.title;
  article.append(title);

  const detail = document.createElement("p");
  detail.className = "node-detail";
  detail.textContent = node.detail;
  article.append(detail);

  const controls = document.createElement("div");
  controls.className = "node-controls";
  controls.append(
    createControl("Expand", expandedNodeId === node.id, () => {
      expandedNodeId = expandedNodeId === node.id ? undefined : node.id;
      renderConstellation();
    }),
    createControl("Related", relatedNodeId === node.id, () => {
      relatedNodeId = relatedNodeId === node.id ? undefined : node.id;
      renderConstellation();
    }),
  );
  article.append(controls);

  article.addEventListener("pointermove", (event) => {
    const bounds = article.getBoundingClientRect();
    article.style.setProperty(
      "--pointer-x",
      String(event.clientX - bounds.left - bounds.width / 2),
    );
    article.style.setProperty(
      "--pointer-y",
      String(event.clientY - bounds.top - bounds.height / 2),
    );
  });
  article.addEventListener("pointerleave", () => {
    article.style.setProperty("--pointer-x", "0");
    article.style.setProperty("--pointer-y", "0");
  });

  return article;
}

function createControl(
  label: string,
  pressed: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(pressed));
  button.addEventListener("click", onClick);
  return button;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing page element: ${id}`);
  return element as T;
}
