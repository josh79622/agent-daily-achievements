# Daily report UI skeleton design

Date: 2026-09-16

## Goal and boundary

Build the first runnable Stage 2 slice: a local web page where a user can generate and view an English daily-achievements report made from fictional records. The slice proves one end-to-end route—browser action, local request, report generation, local write, local read, and rendered result—without reading private histories or calling Claude Code or Codex.

This is a demonstration foundation, not the first-version product. Real source parsing, agent consent and invocation, scheduling, notifications, correction controls, the Chrome add-on, and public installation remain later slices.

## Chosen approach

Use Node.js LTS, npm, TypeScript, a small server built on Node's HTTP API, and a framework-free browser page. Store the generated sample report as JSON under the ignored local `data/` directory. This keeps the first slice easy to inspect and avoids choosing a UI framework or production database before either is needed.

The two rejected approaches for this slice are:

- Connect a real history source immediately. It would show real value sooner, but source parsing and privacy behavior would obscure whether the basic end-to-end path works.
- Set up a UI framework and database first. They may become useful later, but they add dependencies and irreversible conventions before the report interaction has been validated.

## Components

- `src/domain/`: typed fictional evidence records and a deterministic sample-report generator. The generator produces factual achievements, decisions, and learning items with source identifiers.
- `src/storage/`: a JSON report store. Production uses `data/reports/`; tests use temporary directories.
- `src/server/`: a localhost-only HTTP server. `POST /api/reports/sample` generates, persists, and returns the sample report. `GET /api/reports/latest` reads it back. Other routes return explicit JSON or HTTP errors.
- `web/`: static HTML, CSS, and browser TypeScript. The page initially explains that it is a fictional demo. Its primary button calls the generation endpoint, and the report view renders status, sections, and source references.
- `scripts/`: build support that compiles TypeScript and copies static assets to `dist/`.

## Data flow

1. The browser loads the local page from `127.0.0.1`.
2. The user selects **Generate sample report**.
3. The server passes a fixed fictional record set to the deterministic generator.
4. The generator returns a typed report whose items retain source identifiers.
5. The JSON store writes the report atomically enough for this single-process skeleton, then reads it back.
6. The server returns the stored report and the browser renders it.

No conversation content leaves the machine, and no model is used in this slice.

## Error handling

The server returns structured JSON errors without exposing stack traces. The page keeps the fictional-demo explanation visible, disables the button while a request is running, and shows a clear failure message with a retry action. A missing saved report returns `404`, not an empty success. Invalid methods and routes return `405` or `404` as appropriate. Startup binds only to `127.0.0.1` and reports its local URL.

## Verification

The single gate command runs `format:check`, `lint`, `typecheck`, `test`, and `build` in that order. Tests are derived from this design before implementation:

- the generator retains the report date, evidence categories, and source IDs;
- the store writes and reads the same report and distinguishes a missing report;
- the HTTP endpoints demonstrate generation followed by read-back and explicit failure responses;
- the built page contains the fictional-data notice and generation control.

GitHub Actions runs the same gate on pushes and pull requests. Before calling the slice complete, deliberately make one focused test fail and confirm the gate stops, restore it, run the complete gate successfully, then inspect the UI in a browser at desktop and narrow widths.
