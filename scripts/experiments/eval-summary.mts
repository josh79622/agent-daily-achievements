// Eval harness, an EXPERIMENT rather than production code: the real summary
// runner is still an open TODO item with its own design and test cases.
//
// Usage, from the worktree root, with Node 24 on PATH:
//   npx tsx scripts/experiments/eval-summary.mts codex gpt-5.6-luna [case-01]
//   npx tsx scripts/experiments/eval-summary.mts claude-code haiku [case-01]
//
// Runs the draft prompt over the
// eight FICTIONAL cases of synthetic set 02 against one CLI/model, validates the
// reply against the approved manifest, assembles the report and scores it.
// It sends only fictional records. Tools are disabled, sessions not persisted.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleReport } from "../../src/report/contract.js";
import { scoreReport, type EvalSet } from "../../src/report/eval-scorer.js";
import { buildSummaryRequestText } from "../../src/report/summary-prompt.js";

const provider = process.argv[2] as "claude-code" | "codex";
const model = process.argv[3];
const only = process.argv[4];
const exe = provider === "codex" ? "codex" : "claude";

const set = JSON.parse(
  await readFile("test/fixtures/report-eval/synthetic-set-02.json", "utf8"),
) as EvalSet;
const payloads = JSON.parse(
  await readFile(
    "test/fixtures/report-eval/synthetic-set-02-payloads.json",
    "utf8",
  ),
) as { cases: Record<string, { date: string; conversations: unknown[] }> };

const disabled = [
  "shell_tool",
  "unified_exec",
  "browser_use",
  "computer_use",
  "apps",
  "plugins",
  "image_generation",
  "view_image",
];

async function ask(text: string): Promise<{ reply?: string; error?: string }> {
  const dir = await mkdtemp(join(tmpdir(), "eval-run-"));
  const replyFile = join(dir, "reply.txt");
  const args =
    provider === "claude-code"
      ? [
          "-p",
          "--tools",
          "",
          "--no-session-persistence",
          "--strict-mcp-config",
          "--output-format",
          "json",
          "--model",
          model,
          text,
        ]
      : [
          "exec",
          "--ephemeral",
          "--skip-git-repo-check",
          "--ignore-user-config",
          "--sandbox",
          "read-only",
          "--color",
          "never",
          "-o",
          replyFile,
          "-m",
          model,
          "-C",
          dir,
          ...disabled.flatMap((d) => ["--disable", d]),
          text,
        ];
  try {
    const out = await new Promise<{ code: number | null; stdout: string }>(
      (res, rej) => {
        const child = spawn(exe, args, {
          cwd: dir,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        child.stdout.on("data", (b) => (stdout += b));
        child.on("error", rej);
        const t = setTimeout(() => {
          child.kill("SIGKILL");
          rej(new Error("timed out"));
        }, 180_000);
        child.on("close", (code) => {
          clearTimeout(t);
          res({ code, stdout });
        });
      },
    );
    if (out.code !== 0) return { error: `exit ${out.code}` };
    if (provider === "codex")
      return { reply: await readFile(replyFile, "utf8") };
    const env = JSON.parse(out.stdout) as {
      is_error?: boolean;
      result?: string;
    };
    if (env.is_error) return { error: "is_error" };
    return { reply: env.result };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function parseCandidate(reply: string): unknown {
  const t = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    return { __unparseable: true };
  }
}

let pass = 0,
  critical = 0,
  failed = 0;
for (const c of set.cases) {
  if (only && c.id !== only) continue;
  const payload = payloads.cases[c.id]!;
  const json = JSON.stringify({
    date: payload.date,
    conversations: payload.conversations,
  });
  const started = Date.now();
  const { reply, error } = await ask(buildSummaryRequestText(json));
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (error || reply === undefined) {
    console.log(`${c.id}  RUN FAILED  ${error}`);
    failed++;
    continue;
  }
  const candidate = parseCandidate(reply);
  const report = assembleReport({
    date: "2026-09-18",
    timezone: "Australia/Sydney",
    manifest: c.manifest,
    coverage: c.coverage,
    summary: { kind: "candidate", candidate },
  });
  const score = scoreReport(c, report);
  const ok = !score.critical && score.failures.length === 0;
  if (ok) pass++;
  else if (score.critical) critical++;
  else failed++;
  console.log(
    `${c.id}  ${ok ? "PASS" : score.critical ? "CRITICAL" : "FAIL"}  ${secs}s  ` +
      `items=${report.achievements.length} status=${report.status}` +
      (report.incomplete.length
        ? ` incomplete=${JSON.stringify(report.incomplete)}`
        : "") +
      (score.failures.length ? `\n    ${JSON.stringify(score.failures)}` : ""),
  );
}
console.log(
  `\n${provider} ${model}: ${pass} pass, ${critical} critical, ${failed} other failures`,
);
