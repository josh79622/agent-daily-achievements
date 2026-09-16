# Daily Proof

Daily Proof is a local-first tool for turning activity from AI agents into an evidence-backed daily-achievements report. The current Stage 2 skeleton is a clickable UI demonstration built entirely from fictional records.

## What the demo proves

- a browser action can request a report from a localhost-only service;
- fictional evidence becomes progress, decision, and learning sections with source IDs;
- the generated report is saved to local JSON and read back into the page;
- formatting, linting, type checking, tests, and the build run through one ordered gate.

It does **not** read Claude Code or Codex histories, call an AI model, run on a schedule, send notifications, or include the optional Chrome add-on yet.

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

Open [http://127.0.0.1:4317](http://127.0.0.1:4317), then select **Generate sample report**. Generated sample data is written under the ignored `data/reports/` directory.

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
