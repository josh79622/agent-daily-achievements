# Daily Proof (Agent Daily Achievements)

> **Daily cognitive relief with evidence-backed achievements from local AI agent conversations.**

Daily Proof is a local-first, privacy-focused tool that transforms messy conversation histories across your local AI coding agents into clean, evidence-backed daily achievement journals, structured deliverables, and crucial decision records.

---

## Table of Contents

- [Vision & Purpose](#vision--purpose)
- [Privacy & Architecture](#privacy--architecture)
- [Supported Platforms & Requirements](#supported-platforms--requirements)
- [Supported Local AI Agent Sources](#supported-local-ai-agent-sources)
- [Quick Start](#quick-start)
  - [One-Command Bootstrap](#one-command-bootstrap)
  - [Manual GitHub Source Setup](#manual-github-source-setup)
- [macOS Background Automation (LaunchAgents)](#macos-background-automation-launchagents)
  - [Daily 09:00 AM Report Scheduler](#daily-0900-am-report-scheduler)
  - [Always-On Web Server Daemon](#always-on-web-server-daemon)
  - [Uninstallation of LaunchAgents](#uninstallation-of-launchagents)
- [Daily Operations & UI Features](#daily-operations--ui-features)
- [Troubleshooting & Failure Guidance](#troubleshooting--failure-guidance)
- [Quality Gate & Development](#quality-gate--development)

---

## Vision & Purpose

When developers spend their days collaborating with autonomous AI agents across dozens of terminal tabs, scratchpads, and git worktrees, they often close their laptops feeling mentally drained, asking:

> *"I was busy all day, but what did I actually finish?"*

Daily Proof solves this by providing:

1. **Daily Cognitive Relief**: Synthesizes the day's agent activities into 3–5 crisp, tangible accomplishments with a designated **Key Milestone**.
2. **Evidence-Backed Grounding**: Every single achievement cites verifiable conversation sessions, message IDs, or tool execution results. No phantom achievements or fabricated progress.
3. **First-Class Credit for Decisions**: Deliberate negative decisions—deciding *not* to adopt a dependency, rejecting an unsuitable design, or pausing a premature migration—are recognized as high-value progress.
4. **Multi-Project Attribution**: Intelligently groups activities by project folder and git worktree so concurrent projects are balanced fairly.

---

## Privacy & Architecture

Daily Proof is built from the ground up on strict local-first privacy principles:

- **100% Local Execution**: Runs entirely on your machine (`http://127.0.0.1:4317/`). There are **zero cloud servers, zero external databases, and zero telemetry/analytics**.
- **Local JSON Storage**: All reports, settings, and language packs are stored as human-readable JSON files in the local `data/` directory (git-ignored and private to your machine).
- **Fail-Closed Consent Gate**: Reading local agent history requires explicit permission. External AI summarization requires a separate, explicit user grant.
- **Zero Raw Conversation Retention in Summaries**: Generated reports store only synthesized conclusions and structural evidence pointers (source name, session ID, message index), never raw conversation transcripts.

---

## Supported Platforms & Requirements

- **Operating System**: macOS (Apple Silicon `arm64` & Intel `x86_64`).
- **Runtime**: Node.js 24 LTS (`>=24.0.0 <25.0.0`).
- **Package Manager**: `npm` (included with Node.js).
- **Browser**: Any modern browser (Safari, Chrome, Arc, Firefox, Edge).

---

## Supported Local AI Agent Sources

Daily Proof reads local conversation histories directly from your installed CLI agents:

| Agent | CLI / Binary | Local Data Location |
| :--- | :--- | :--- |
| **Anthropic Claude Code** | `claude` | `~/.claude/` session transcripts and projects |
| **OpenAI Codex** | `codex` | `~/.codex/` active and archived session logs, plus bundled `/Applications/ChatGPT.app/Contents/Resources/codex` |
| **Google Antigravity** | `agy` | `~/.gemini/antigravity/brain/**/transcript.jsonl` agent trajectory files |

---

## Quick Start

### One-Command Bootstrap

If you have cloned the repository, you can run the automated installer:

```bash
./install.sh
```

The script verifies macOS and Node.js >= 24, installs dependencies, configures timezone and fail-closed summarizer permissions, builds production bundles, prompts for background LaunchAgent setup, and launches the app.

---

### Manual GitHub Source Setup

Step-by-step setup from source:

```bash
# 1. Clone the repository
git clone https://github.com/josh79622/agent-daily-achievements.git
cd agent-daily-achievements

# 2. Install dependencies
npm install

# 3. Initialize local configuration
npm run setup

# 4. Compile TypeScript and bundle frontend assets
npm run build

# 5. Open Daily Proof
npm run open
```

#### What each command does:

1. **`npm install`**: Installs runtime and build dependencies.
2. **`npm run setup`**:
   - Detects your Mac's system timezone and saves it to `data/report-timezone.json` to anchor the 07:00–07:00 daily report window.
   - Pre-configures fail-closed external summarization permission (`data/summary-permission.json`) defaulting to Google Antigravity (`agy`), falling back to Claude Code or Codex.
3. **`npm run build`**:
   - Compiles server TypeScript into `dist/`.
   - Bundles the React web application with Vite into `dist/web/`.
4. **`npm run open`**:
   - Checks if the Daily Proof server is already listening on `http://127.0.0.1:4317/`.
   - If not running, launches it as a detached background process.
   - Automatically opens `http://127.0.0.1:4317/` in your default browser.

#### Running in Development Mode

To run a live watcher that rebuilds client and server on code changes:

```bash
npm run dev
```

---

## macOS Background Automation (LaunchAgents)

Daily Proof includes native macOS background automation via `launchd`:

### Daily 09:00 AM Report Scheduler

Generates yesterday's daily achievement report automatically every morning at 09:00 AM using the 07:00-to-07:00 date window. Upon completion or issue, it sends a native macOS notification with a system chime and a direct link to `http://127.0.0.1:4317/`.

To install:

```bash
npm run schedule:install
```

### Always-On Web Server Daemon

Keeps the Daily Proof web interface alive in the background. It starts automatically on user login and restarts within 1 second if killed:

```bash
npm run server:install
```

### Uninstallation of LaunchAgents

To remove background automation at any time:

```bash
# Remove daily report scheduler
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.dailyproof.scheduled-report.plist
rm -f ~/Library/LaunchAgents/com.dailyproof.scheduled-report.plist

# Remove background web server daemon
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.dailyproof.web-server.plist
rm -f ~/Library/LaunchAgents/com.dailyproof.web-server.plist
```

To check current status:

```bash
launchctl list | grep dailyproof
```

---

## Daily Operations & UI Features

### 1. Three Distinct Zen Journal Layouts
Switch between 3 view modes instantly via the header selector (preferences saved locally):
- 📖 **Concept A: Minimal Journal** (Linear / Raycast): Clean vertical cards with pulsing status indicators and concise bullet summaries.
- 🍱 **Concept B: Focus Bento** (Apple / Things 3): Responsive 2-column grid anchored by a prominent Hero Card for the day's **Key Milestone**.
- 📝 **Concept C: Executive Briefing** (Notion / Axios): High-level executive briefing separated into *Key Deliverables* and *Strategic Decisions*.

### 2. Expandable Source Trace-Back Drawer
Every achievement has a `Show source` button. Clicking it fetches the cited local session messages on demand and displays the exact conversation turns and tool results that prove completion.

### 3. Inline Editing & Safe Two-Step Deletion
- **Edit**: Correct or rephrase any achievement title or detail inline (`PATCH`). Changes persist immediately to local storage.
- **Delete**: Remove irrelevant achievements safely with a two-step confirmation (`DELETE`).

### 4. Append-Only Report Version History
Regenerating a date's report never overwrites your previous record. All iterations are preserved and navigable newest-first in the report version selector.

### 5. Multi-Language Support & On-Demand Language Packs
- Built-in: Traditional Chinese (`zh-TW`), English (`en`), and Spanish (`es`).
- On-Demand Generation: Add any of 41 catalog languages with one click.
- Full Right-to-Left (RTL) Layout: Complete mirrored UI support for Arabic (`ar`), Hebrew (`he`), Persian (`fa`), and Urdu (`ur`).

---

## Troubleshooting & Failure Guidance

### Agent CLI Not Found or Signed Out

If report generation fails or settings displays a warning:
- **Claude Code**: Run `claude auth login` in your terminal.
- **OpenAI Codex**: Run `codex login` in your terminal. If using ChatGPT Desktop app, verify `/Applications/ChatGPT.app` is installed.
- **Google Antigravity**: Ensure the `agy` CLI is accessible in your PATH and `~/.gemini/antigravity/brain` contains session trajectories.

### Adjusting Summarizer Settings & Permissions

Click the **Settings (⚙️)** icon in the header to:
- Select your preferred summarizer CLI (`agy`, `claude-code`, or `codex`).
- Choose specific models (e.g. `gemini-3.8-flash`, `gpt-5.6-terra`, `claude-3-7-sonnet`).
- Adjust reasoning effort (`low`, `medium`, `high`).
- Run a zero-cost readiness check.

### Overriding Report Timezone

Daily Proof uses your Mac's system timezone by default. To explicitly set a different IANA timezone:

```bash
npm run setup -- --force Asia/Taipei
# or
npm run setup -- --force America/New_York
```

### Inspecting Service Logs

When background LaunchAgents are active, logs are streamed to `data/logs/`:

```bash
# View web server logs
tail -f data/logs/web-server.log

# View scheduled 09:00 AM report generation logs
tail -f data/logs/scheduled-report.log
```

### Port 4317 Conflicts

If port 4317 is occupied by another process:

```bash
# Find process using port 4317
lsof -i :4317

# Stop an orphaned server instance
kill -9 <PID>
```

---

## Quality Gate & Development

Run the automated fresh-install verification script:

```bash
node scripts/verify-fresh-install.mjs
```

Before committing or opening a pull request, run the single ordered gate:

```bash
npm run check
```

The gate executes in strict sequence:
1. `format:check`: Prettier style verification
2. `lint`: ESLint static analysis
3. `typecheck`: TypeScript compiler checks for both Node server and Vite web application
4. `test`: Vitest unit and component tests
5. `build`: Production bundling

All 70+ test suites and 650+ tests must pass cleanly.
