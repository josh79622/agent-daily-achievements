# Daily Proof

Daily Proof is a local-first tool for turning activity from AI agents into an evidence-backed daily-achievements report. The current Phase 3 demo combines fictional report output with consent-gated, local-only collection of Claude Code and Codex session metadata.

## What the demo proves

- a browser action can request a report from a localhost-only service;
- fictional evidence becomes progress, decision, and learning sections with source IDs;
- the generated report is saved to local JSON and read back into the page;
- local collection cannot begin until the user explicitly saves a Claude Code and/or Codex source choice;
- only the source choice is stored locally; conversation text stays in process memory and previews appear only on request;
- formatting, linting, type checking, tests, and the build run through one ordered gate.

It does **not** call an AI model, transmit conversation text, run on a schedule, send notifications, or include the optional Chrome add-on yet. Parser correctness against approved real sessions, failure classification, and deduplication remain Phase 3 work.

## Requirements

- macOS
- Node.js 24 LTS
- npm (included with a normal Node.js installation)

## Run the demo

```bash
npm install
npm run build
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Select **Local activity**, choose one or both local sources, then select **Save source choice** before collection. Generated sample data is written under the ignored `data/reports/` directory; the source choice is stored in ignored `data/local-sources.json`.

For a development server that rebuilds once before watching the TypeScript server:

```bash
npm run dev
```

Restart the command after changing browser assets so they are rebuilt.

## Verification

```bash
npm run check
```

The gate runs, in order:

1. `format:check`
2. `lint`
3. `typecheck`
4. `test`
5. `build`

GitHub Actions runs the same command after `npm ci`.

## Project decisions

Product scope is in [BRIEF.md](BRIEF.md), durable agent rules are in [AGENTS.md](AGENTS.md), and design and decision records are under [`docs/`](docs/).
