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
  type ConstellationNode,
  type EvidenceMessage,
} from "./report-view.js";

const constellation = requiredElement<HTMLElement>("constellation");
const constellationStatus = requiredElement<HTMLElement>(
  "constellation-status",
);
const reportDate = requiredElement<HTMLTimeElement>("report-date");
const collectorToggle = requiredElement<HTMLButtonElement>("collector-toggle");
const collectorPanel = requiredElement<HTMLElement>("collector-panel");
const collectorClose = requiredElement<HTMLButtonElement>("collector-close");
const collectorStatus = requiredElement<HTMLElement>("collector-status");
const collectorSources = requiredElement<HTMLElement>("collector-sources");
const collectorSessions = requiredElement<HTMLElement>("collector-sessions");
let nodes: ConstellationNode[] = [];
let currentReportDate: string | undefined;
let expandedNodeId: string | undefined;
let relatedNodeId: string | undefined;
let sourceOpenId: string | undefined;
let reportRevision = 0;
const sourceResults = new Map<string, HTMLElement>();
const sourceLoading = new Set<string>();

void loadReport();
collectorToggle.addEventListener("click", () => {
  hideSignin();
  void showCollector();
});
collectorClose.addEventListener("click", hideCollector);

interface CollectorSession {
  id: string;
  source: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  issueCount: number;
}

interface CollectorSource {
  source: string;
  sessions: number;
  issues: number;
  state: "available" | "incomplete" | "no-activity" | "not-installed";
  reason?: string;
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
      sources: CollectorSource[];
      sessions: CollectorSession[];
    }>("/api/collector/today");
    if (revision !== collectorRevision) return;
    result.sources.forEach((source) => {
      const line = document.createElement("p");
      line.className = "collector-source";
      line.textContent = sourceCoverageText(source);
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

function sourceCoverageText(source: CollectorSource): string {
  if (source.state === "not-installed")
    return `${source.source} · not installed`;
  if (source.state === "no-activity") return `${source.source} · no activity`;
  if (source.state === "incomplete")
    return `${source.source} · incomplete: ${source.reason ?? "unknown"} · ${source.sessions} sessions · ${source.issues} issues`;
  return `${source.source} · ${source.sessions} sessions · available`;
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

async function loadReport(): Promise<void> {
  reportRevision += 1;
  sourceOpenId = undefined;
  sourceResults.clear();
  sourceLoading.clear();

  const response = await fetch("/api/reports/latest");
  if (response.status === 404) {
    nodes = [];
    currentReportDate = undefined;
    reportDate.textContent = "";
    reportDate.removeAttribute("datetime");
    setConstellationStatus("No report has been generated yet.");
    renderConstellation();
    return;
  }
  if (!response.ok) {
    nodes = [];
    currentReportDate = undefined;
    setConstellationStatus("The report could not be loaded.");
    renderConstellation();
    return;
  }
  const body = (await response.json()) as { report: AchievementReportV1 };
  const report = body.report;
  nodes = mapAchievementsToNodes(report.achievements);
  currentReportDate = report.date;
  reportDate.textContent = report.date;
  reportDate.dateTime = report.date;
  const incomplete = describeIncomplete(report.incomplete);
  if (incomplete.length) setConstellationStatus(incomplete.join(" "));
  else if (report.achievements.length === 0)
    setConstellationStatus("No achievements were found for this day.");
  else setConstellationStatus(undefined);
  renderConstellation();
}

/** Loads and renders one node's evidence, from the local collector only. */
async function loadSource(
  node: ConstellationNode,
  revision: number,
): Promise<void> {
  sourceLoading.add(node.id);
  try {
    const container = document.createElement("div");
    container.className = "evidence";
    for (const ref of node.evidence)
      container.append(await loadEvidenceRef(ref));
    if (revision !== reportRevision) return;
    sourceResults.set(node.id, container);
  } finally {
    sourceLoading.delete(node.id);
    if (revision === reportRevision) renderConstellation();
  }
}

async function loadEvidenceRef(ref: EvidenceRef): Promise<HTMLElement> {
  const block = document.createElement("div");
  block.className = "evidence-record";
  const byline = document.createElement("p");
  byline.className = "evidence-byline";
  byline.textContent = `${sourceLabel(ref.source)} · ${ref.recordId}`;
  block.append(byline);

  if (!isLocallyTraceable(ref.source)) {
    block.append(
      textParagraph("Source preview isn't available for this source yet."),
    );
    return block;
  }
  try {
    const dateQuery = currentReportDate
      ? `&date=${encodeURIComponent(currentReportDate)}`
      : "";
    const body = await api<{ session: { messages: EvidenceMessage[] } }>(
      `/api/collector/sessions/${encodeURIComponent(ref.recordId)}?source=${encodeURIComponent(
        ref.source,
      )}${dateQuery}`,
    );
    const { found, missingIds } = pickEvidenceMessages(
      body.session.messages,
      ref.messageIds,
    );
    found.forEach((message) => {
      block.append(
        textParagraph(`${message.role}: ${message.text}`, "evidence-message"),
      );
    });
    if (missingIds.length)
      block.append(
        textParagraph(
          `${missingIds.length} cited message(s) are no longer available locally.`,
        ),
      );
  } catch {
    block.append(textParagraph("Source no longer available locally."));
  }
  return block;
}

function textParagraph(text: string, className?: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  if (className) paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

function setConstellationStatus(message: string | undefined): void {
  constellationStatus.hidden = !message;
  constellationStatus.textContent = message ?? "";
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
  if (sourceOpenId === node.id) article.classList.add("has-source");

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
  );
  // Evidence is not turned into its own child nodes; only show Related
  // where something else actually points at this node.
  if (nodes.some((other) => other.parentId === node.id))
    controls.append(
      createControl("Related", relatedNodeId === node.id, () => {
        relatedNodeId = relatedNodeId === node.id ? undefined : node.id;
        renderConstellation();
      }),
    );
  if (node.evidence.length)
    controls.append(
      createControl("Show source", sourceOpenId === node.id, () => {
        if (sourceOpenId === node.id) {
          sourceOpenId = undefined;
        } else {
          sourceOpenId = node.id;
          if (!sourceResults.has(node.id) && !sourceLoading.has(node.id))
            void loadSource(node, reportRevision);
        }
        renderConstellation();
      }),
    );
  article.append(controls);

  if (sourceOpenId === node.id)
    article.append(
      sourceResults.get(node.id) ?? textParagraph("Loading source…"),
    );

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

type SigninProvider = "codex" | "claude-code";

interface SigninStatus {
  provider: SigninProvider;
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
  probeFailures?: Array<{ attempt: string; reason: string }>;
  checking?: true;
  readyVia?: string;
}

// Display labels for the fixed probe codes; no reply or error text is shown.
const probeReasonLabels: Record<string, string> = {
  "could-not-start": "could not start",
  "timed-out": "timed out",
  "exited-with-error": "exited with error",
  "empty-reply": "empty reply",
  "unreadable-reply": "unreadable reply",
  "reply-too-large": "reply too large",
};
const probeAttemptLabels: Record<string, string> = {
  "lowest-cost-model": "lowest-cost model",
  "summary-model": "summary model",
};

const signinProviders: SigninProvider[] = ["codex", "claude-code"];
const signinToggle = requiredElement<HTMLButtonElement>("signin-toggle");
const signinPanel = requiredElement<HTMLElement>("signin-panel");
const signinRefresh = requiredElement<HTMLButtonElement>("signin-refresh");
let signinRevision = 0;

signinToggle.addEventListener("click", () => {
  hideCollector();
  void showSignin();
});
requiredElement<HTMLButtonElement>("signin-close").addEventListener(
  "click",
  hideSignin,
);
signinRefresh.addEventListener("click", () => void refreshSignin());
for (const provider of signinProviders) {
  signinButton(provider).addEventListener(
    "click",
    () => void startSignin(provider),
  );
  readinessButton(provider).addEventListener(
    "click",
    () => void checkReadiness(provider),
  );
}

function signinButton(provider: SigninProvider): HTMLButtonElement {
  return requiredElement<HTMLButtonElement>(`signin-button-${provider}`);
}

async function showSignin(): Promise<void> {
  signinPanel.hidden = false;
  signinToggle.setAttribute("aria-expanded", "true");
  await Promise.all([refreshSignin(), loadModels()]);
}

interface ModelView {
  provider: SigninProvider;
  source: "fetched" | "built-in";
  options: Array<{ value: string; label: string }>;
  selected: string;
  effective: string | null;
  effortOptions: string[];
  selectedEffort: string;
  effectiveEffort: string | null;
  warnings: string[];
}

// Fixed warning texts; the page never shows free-form server text here.
const modelWarningLabels: Record<string, string> = {
  "saved-model-unavailable":
    "Saved model is no longer available; using Default.",
  "model-list-unavailable": "Model list unavailable; using the built-in list.",
  "settings-unreadable": "Model settings could not be read; using Default.",
  "saved-effort-unavailable":
    "Saved effort is no longer supported; using Default.",
};

function modelSelect(provider: SigninProvider): HTMLSelectElement {
  return requiredElement<HTMLSelectElement>(`signin-model-${provider}`);
}

function effortSelect(provider: SigninProvider): HTMLSelectElement {
  return requiredElement<HTMLSelectElement>(`signin-effort-${provider}`);
}

function modelNote(provider: SigninProvider): HTMLElement {
  return requiredElement(`signin-model-note-${provider}`);
}

for (const provider of signinProviders) {
  modelSelect(provider).addEventListener(
    "change",
    () => void saveModel(provider, { model: modelSelect(provider).value }),
  );
  effortSelect(provider).addEventListener(
    "change",
    () => void saveModel(provider, { effort: effortSelect(provider).value }),
  );
}

async function loadModels(): Promise<void> {
  try {
    const { providers } = await api<{ providers: ModelView[] }>(
      "/api/summarizer/models",
    );
    for (const view of providers) renderModel(view);
  } catch {
    for (const provider of signinProviders) {
      modelSelect(provider).disabled = true;
      effortSelect(provider).disabled = true;
      modelNote(provider).textContent = "Model settings are unavailable.";
    }
  }
}

async function saveModel(
  provider: SigninProvider,
  change: { model: string } | { effort: string },
): Promise<void> {
  modelSelect(provider).disabled = true;
  effortSelect(provider).disabled = true;
  try {
    const { provider: view } = await api<{ provider: ModelView }>(
      `/api/summarizer/models/${provider}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          "effort" in change
            ? { effort: change.effort }
            : { model: change.model },
        ),
      },
    );
    renderModel(view);
  } catch {
    modelNote(provider).textContent = "The model choice could not be saved.";
    await loadModels();
  }
}

function renderModel(view: ModelView): void {
  if (!signinProviders.includes(view.provider)) return;
  const select = modelSelect(view.provider);
  const options = [
    { value: "default", label: "Default" },
    ...view.options.filter((option) => option.value !== "default"),
  ];
  select.replaceChildren(
    ...options.map(({ value, label }) => {
      const element = document.createElement("option");
      element.value = value;
      element.textContent = label;
      return element;
    }),
  );
  select.value = options.some((option) => option.value === view.selected)
    ? view.selected
    : "default";
  select.disabled = false;
  const effort = effortSelect(view.provider);
  const efforts = ["default", ...view.effortOptions];
  effort.replaceChildren(
    ...efforts.map((value) => {
      const element = document.createElement("option");
      element.value = value;
      element.textContent = value === "default" ? "Default" : value;
      return element;
    }),
  );
  effort.value = efforts.includes(view.selectedEffort)
    ? view.selectedEffort
    : "default";
  effort.disabled = view.effortOptions.length === 0;
  modelNote(view.provider).textContent = view.warnings
    .map((warning) => modelWarningLabels[warning])
    .filter(Boolean)
    .join(" ");
}

function hideSignin(): void {
  signinRevision += 1;
  signinPanel.hidden = true;
  signinToggle.setAttribute("aria-expanded", "false");
}

async function refreshSignin(): Promise<void> {
  const revision = ++signinRevision;
  for (const provider of signinProviders) {
    requiredElement(`signin-status-${provider}`).textContent = "Checking…";
  }
  try {
    const { providers } = await api<{ providers: SigninStatus[] }>(
      "/api/summarizer/providers",
    );
    if (revision !== signinRevision) return;
    for (const status of providers) renderSignin(status);
  } catch (error) {
    if (revision !== signinRevision) return;
    for (const provider of signinProviders) {
      requiredElement(`signin-status-${provider}`).textContent =
        error instanceof Error ? error.message : "Sign-in status unavailable.";
    }
  }
}

async function startSignin(provider: SigninProvider): Promise<void> {
  const revision = ++signinRevision;
  signinButton(provider).disabled = true;
  requiredElement(`signin-status-${provider}`).textContent = "Starting…";
  try {
    const { provider: status } = await api<{ provider: SigninStatus }>(
      `/api/summarizer/providers/${provider}/login`,
      { method: "POST" },
    );
    if (revision !== signinRevision) return;
    renderSignin(status);
  } catch (error) {
    if (revision !== signinRevision) return;
    signinButton(provider).disabled = false;
    requiredElement(`signin-status-${provider}`).textContent =
      error instanceof Error ? error.message : "Sign-in could not be started.";
  }
}

function readinessButton(provider: SigninProvider): HTMLButtonElement {
  return requiredElement<HTMLButtonElement>(`signin-readiness-${provider}`);
}

// Runs the zero-conversation probe only on this explicit click (decision C1).
async function checkReadiness(provider: SigninProvider): Promise<void> {
  readinessButton(provider).disabled = true;
  requiredElement(`signin-status-${provider}`).textContent =
    "Checking readiness…";
  try {
    const { provider: status } = await api<{ provider: SigninStatus }>(
      `/api/summarizer/providers/${provider}/readiness`,
      { method: "POST" },
    );
    if (!signinPanel.hidden) renderSignin(status);
  } catch (error) {
    if (signinPanel.hidden) return;
    requiredElement(`signin-status-${provider}`).textContent =
      error instanceof Error ? error.message : "Readiness check unavailable.";
    readinessButton(provider).disabled = false;
  }
}

function clockTime(checkedAt: string | undefined): string | undefined {
  const date = checkedAt ? new Date(checkedAt) : undefined;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function notReadyMessage(status: SigninStatus): string {
  if (status.checking) return "Checking readiness…";
  if (status.probeFailures?.length)
    return `Not ready${
      clockTime(status.checkedAt)
        ? ` (checked ${clockTime(status.checkedAt)})`
        : ""
    }: ${status.probeFailures
      .map(
        (failure) =>
          `${probeAttemptLabels[failure.attempt] ?? "attempt"} ${
            probeReasonLabels[failure.reason] ?? "failed"
          }`,
      )
      .join("; ")}.`;
  return `Not ready: ${status.reason ?? "The readiness check did not pass."}`;
}

function renderSignin(status: SigninStatus): void {
  if (!signinProviders.includes(status.provider)) return;
  const readyVia = status.readyVia
    ? probeAttemptLabels[status.readyVia]
    : undefined;
  const checkedTime = clockTime(status.checkedAt) ?? "just now";
  const messages: Record<SigninStatus["state"], string> = {
    "not-installed": `${status.label} is not installed.`,
    "sign-in-required": "Sign-in required.",
    "login-in-progress": `Sign-in started. Complete it in the Terminal window, then choose Check again.`,
    ready: readyVia
      ? `Ready via ${readyVia} (checked ${checkedTime})`
      : `Ready (checked ${checkedTime})`,
    "probe-failed": notReadyMessage(status),
  };
  requiredElement(`signin-status-${status.provider}`).textContent =
    messages[status.state] ?? "Unknown state.";
  signinButton(status.provider).disabled = status.state === "not-installed";
  readinessButton(status.provider).disabled =
    status.signedIn !== true || status.checking === true;
  const install = requiredElement<HTMLAnchorElement>(
    `signin-install-${status.provider}`,
  );
  install.hidden = status.state !== "not-installed";
  if (/^https:\/\//.test(status.installUrl)) install.href = status.installUrl;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing page element: ${id}`);
  return element as T;
}
