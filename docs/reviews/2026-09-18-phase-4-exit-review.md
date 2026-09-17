# Phase 4 exit review — report intelligence

Status: **draft — awaiting Josh's decision on the scope gap below.** Phase 4 is
not declared complete until that decision is recorded.

## Result

All four Phase 4 items in `TODO.md` are checked. They establish the safety
boundary, report contract, evaluation set, and provider readiness controls that
report generation will rely on. **No report has been generated from real
conversation content, and no summarizer runner, prompt, or report-day payload
exists yet.** This is not a first-version release claim.

## Evidence reviewed

| Area | Evidence | Result |
| --- | --- | --- |
| Separate summarization permission | Eight synthetic permission tests; server implementation | Maximum external-summarization permission is stored separately from local-source consent, fails closed, discloses both possible recipients, defaults to Codex, and allows fallback only under the saved grant. Browser requests cannot supply conversation text. |
| Report contract | RC-1–RC-9, RA-1–RA-5, RS-1–RS-4 ([design](../plans/2026-09-17-report-contract-design.md)) | Untrusted output may contain only 0–5 achievements with manifest evidence; any violation fails closed as incomplete without echoing candidate text; more than five is re-analysed with at most three attempts; status and coverage come only from local facts (D3). |
| Evaluation set | [Synthetic set 02](../evals/synthetic-set-02.md), fixture, EV-1–EV-9, six scorer mutations caught | Eight approved fictional cases cover completion, intention, decision, learning, cross-source duplicates, conflicting evidence, failed sources, and more than five plausible achievements. No model has been run against the set. |
| Sign-in and readiness | Login demo; PR-1–PR-19 ([probe design](../plans/2026-09-17-readiness-probe-design.md)); Josh's real checks | Both providers launch their own login; a zero-conversation liveness probe runs only on request with tool-restricted commands; both real CLIs showed Ready; network loss produced `timed out` rather than a false Ready; a metadata-only snapshot found no persisted probe sessions; a Codex canary run could not read a file outside its working directory. |
| Model and effort settings | MC, SM, SR, SE, SP, EC, ES, ER, EE, EP, EU cases; Josh's real checks | Per-provider model and effort lists are fetched at startup (no prompt) with a built-in fallback; only listed values are saved; problem settings fall back to Default with a warning. Josh confirmed the real dropdowns. |
| Temporary directories | LK-1–LK-3; end-to-end check on a separate port | Leaked probe directories are cleaned on SIGINT/SIGTERM and swept at startup. |

## Known limitations

- Codex tool removal has canary evidence only, not proof that every tool is
  disabled.
- Codex `max`/`ultra` effort acceptance is unverified (Josh limited this to
  checks without a model call); Claude Code `--effort` has not been exercised
  with a real run.
- Quota-exhaustion exit codes have not been observed; the real "Ready via …"
  text has not been observed.
- Model lists depend on an undocumented Codex debug command and an undocumented
  Claude Code initialize response.
- Deterministic validation rejects only exact duplicate evidence sets; semantic
  duplicates rely on the eval scorer and human review. Evidence is traceable by
  identifiers; clickable trace-back is Phase 5.
- No end-to-end test was run; product-wide E2E testing remains deferred.

## Scope gap requiring a decision

BRIEF.md requires a daily report summarized by the chosen agent from complete
report-day conversations. The roadmap's later phases (report control, daily
automation, release readiness) assume reports exist, but no phase item covers
the steps that actually produce one:

1. a server-side report-day payload builder from collected sessions (format,
   size limits without omission, handling of secrets inside conversations);
2. a summarizer runner that sends the payload to the selected CLI with the
   approved permission, model, effort, and tool restrictions, and applies the
   re-analysis and fallback rules;
3. a prompt, first run against synthetic set 02 and scored, then one
   Josh-approved real day.

Options:

- **A — Keep Phase 4 open** and add these as Phase 4 items, because they are
  report intelligence. Phase 5 would then start with real reports to correct.
- **B — Close Phase 4 as scoped** and add these items to the start of Phase 5.

Recommendation: **A**. Phase 5's report control has little value without a real
report, and these steps carry the remaining privacy decisions (payload
contents, secret handling, real-day approval) that belong with report
intelligence.

## Verification

On 2026-09-18, `npm run check` passed using Node 24.20.0: formatting, lint,
type checking, 21 Vitest files with 207 tests, and the production build.
