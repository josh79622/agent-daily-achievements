# Daily Proof (Agent Daily Achievements)

> **Daily cognitive relief with evidence-backed achievements from local AI agent conversations.**

Daily Proof is a local-first, privacy-focused tool that transforms messy conversation histories across your local AI coding agents into clean, evidence-backed daily achievement journals, structured deliverables, and crucial decision records.

---

### 🤖 Prompt for Your AI Coding Agent

If you use **Claude Code**, **OpenAI Codex**, **Google Antigravity**, **Cursor**, **Windsurf**, or **GitHub Copilot CLI**, copy and paste this single prompt to have your agent install Daily Proof automatically:

> *"Clone https://github.com/josh79622/agent-daily-achievements and install it for me on my Mac. Check that Node.js 24 is installed (install via Homebrew if missing), run the setup and build, configure the background launchd services (web-server and 09:00 AM daily scheduler), and verify that http://127.0.0.1:4317/ responds with HTTP 200."*

---

## Table of Contents

- [Vision & Purpose](#vision--purpose)
- [Agent-Friendly Non-Interactive Quick Start](#agent-friendly-non-interactive-quick-start)
- [Prerequisites & Auto-Remediation](#prerequisites--auto-remediation)
- [Core Architecture & Strict Privacy Principles](#core-architecture--strict-privacy-principles)
- [Supported Local AI Agent Sources](#supported-local-ai-agent-sources)
- [macOS Background Automation (LaunchAgents)](#macos-background-automation-launchagents)
- [UI & Daily Experience](#ui--daily-experience)
- [Agent Cheat Sheet for Ongoing Management](#agent-cheat-sheet-for-ongoing-management)
- [中文使用說明 (Traditional Chinese Guide)](#中文使用說明-traditional-chinese-guide)
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

## Agent-Friendly Non-Interactive Quick Start

For automated environments, CI, or AI coding agents (Claude Code, Codex, Antigravity, Cursor terminal), run these shell instructions sequentially. Every command runs non-interactively with zero TTY blocking prompts:

```bash
# 1. Verify macOS environment & Node.js version
uname -s # Must output 'Darwin'
node -v  # Must be >= 24.0.0

# 2. Clone repository & navigate to root
git clone https://github.com/josh79622/agent-daily-achievements.git
cd agent-daily-achievements

# 3. Install dependencies
npm install

# 4. Initialize local configuration (timezone detection & default summarizer permissions)
npm run setup

# 5. Build server and web application bundles
npm run build

# 6. Configure macOS background automation (LaunchAgents)
# - server:install: Keeps web server alive in background on port 4317 across reboots
# - schedule:install: Automatically generates yesterday's report at 09:00 AM daily
npm run server:install
npm run schedule:install

# 7. Verify fresh installation integrity
npm run verify:install

# 8. Open Daily Proof web interface
npm run open
```

> **Interactive Terminal Alternative**:
> If a human user prefers a guided setup in an interactive terminal, simply run `./install.sh`.

---

## Prerequisites & Auto-Remediation

### 1. Operating System
- **Supported**: macOS 14+ (Apple Silicon `arm64` and Intel `x86_64`).
- **Check**:
  ```bash
  uname -s # Returns "Darwin"
  ```

### 2. Node.js 24 LTS
Daily Proof requires **Node.js 24 LTS** (`>=24.0.0 <25.0.0`).

#### Auto-Remediation if Missing or Outdated:

- **Via Homebrew** (Recommended):
  ```bash
  brew install node@24 && brew link --overwrite --force node@24
  ```
- **Via NVM (Node Version Manager)**:
  ```bash
  nvm install 24 && nvm use 24
  ```
- **Verify**:
  ```bash
  node -v # Should display v24.x.x
  npm -v  # Included with Node.js
  ```

### 3. Local AI Agent CLI Sign-In Checks
Daily Proof utilizes your locally authenticated agent CLIs for synthesizing daily summaries. Verify that at least one supported agent is installed and authenticated:

- **Anthropic Claude Code**:
  ```bash
  claude --version
  claude auth login # Authenticate if not already signed in
  ```
  *Local data directory*: `~/.claude/projects/`

- **OpenAI Codex**:
  ```bash
  codex --version
  codex login # Authenticate if not already signed in
  ```
  *Local data directory*: `~/.codex/sessions/` and `~/.codex/archived_sessions/` (or bundled `/Applications/ChatGPT.app/Contents/Resources/codex`).

- **Google Antigravity**:
  ```bash
  agy --version
  ```
  *Local data directory*: `~/.gemini/antigravity/brain/**/transcript.jsonl`

---

## Core Architecture & Strict Privacy Principles

Daily Proof is engineered from the ground up on strict local-first privacy principles:

- **100% Local Execution**: The server listens exclusively on loopback (`http://127.0.0.1:4317/`). There are **zero external cloud servers, zero analytics, and zero telemetry tracking**.
- **Fail-Closed Privacy Gate**: Local agent conversations stay on your local disk. Reading agent histories requires local consent. External AI summarization requires a separate explicit permission grant stored in `data/summary-permission.json`.
- **Zero Raw Transcript Retention**: Generated reports store only synthesized conclusions, key deliverables, strategic decisions, and structural evidence pointers (source provider, session ID, turn index). Raw conversation logs are never copied into report archives.
- **Git-Ignored Local Data**: All user settings, timezone anchors, logs, and report records reside in the root `data/` folder, which is strictly git-ignored.
- **CSRF & Origin Verification**: Mutating server endpoints (`/api/reports/generate`, `/api/summarizer/permission`) enforce strict local origin checks (`Origin: http://127.0.0.1:4317`).

---

## Supported Local AI Agent Sources

Daily Proof reads conversation activities directly from your local machines:

| Agent Source | CLI Command | Activity Traced |
| :--- | :--- | :--- |
| **Google Antigravity** | `agy` | Trajectory step events, tool calls, thinking outputs, and conversations in `~/.gemini/antigravity/brain` |
| **OpenAI Codex** | `codex` | Active & archived CLI session JSON lines in `~/.codex/` and ChatGPT desktop sessions |
| **Anthropic Claude Code** | `claude` | Multi-project session transcripts in `~/.claude/projects/` |

---

## macOS Background Automation (LaunchAgents)

Daily Proof includes native macOS background automation via `launchd`:

### 1. Always-On Web Server Daemon
Keeps the Daily Proof web interface alive in the background. It boots automatically on user login and restarts within 1 second if terminated:
```bash
npm run server:install
```
- **Service Label**: `com.dailyproof.web-server`
- **Plist Location**: `~/Library/LaunchAgents/com.dailyproof.web-server.plist`
- **Log Location**: `data/logs/web-server.log`

### 2. Daily 09:00 AM Report Scheduler
Generates yesterday's daily achievement report automatically every morning at 09:00 AM using the local 07:00-to-07:00 date window. If your Mac is sleeping at 09:00 AM, macOS launchd runs the job immediately upon waking up:
```bash
npm run schedule:install
```
- **Service Label**: `com.dailyproof.scheduled-report`
- **Plist Location**: `~/Library/LaunchAgents/com.dailyproof.scheduled-report.plist`
- **Log Location**: `data/logs/scheduled-report.log`

---

## UI & Daily Experience

### 1. Three Zen Journal Layouts
Switch between 3 view modes instantly via the top header bar (preference persists across visits):
- 📖 **Concept A: Minimal Journal** (Linear / Raycast aesthetic): Clean vertical cards with subtle status indicators and concise bullet summaries.
- 🍱 **Concept B: Focus Bento** (Apple / Things 3 aesthetic): Responsive grid anchored by an eye-catching **Hero Card** celebrating the day's **Key Milestone**.
- 📝 **Concept C: Executive Briefing** (Notion / Axios aesthetic): Structured high-level brief organized cleanly into *Key Deliverables* and *Strategic Decisions*.

### 2. Compact Evidence Pills & Centered Evidence Modal
- **Pill Container**: Displays source session references in a compact, scrollable fixed-height (120px) pills container.
- **Centered Modal via `createPortal`**: Clicking any evidence pill opens an interactive modal rendered at document body level to prevent parent container clipping.
- **Fixed-Height Conversation Drawer**: Displays exact conversation turns, assistant thinking, and tool execution outputs in a dedicated 320px scrollable drawer.

### 3. Model Tracking Badge
Every generated report stamps the exact AI provider and model used in the metadata bar:
```
🤖 模型：codex (gpt-5.6-terra)
# or
🤖 模型：agy (gemini-3.8-flash)
# or
🤖 模型：claude-code (claude-3-7-sonnet)
```

### 4. Append-Only Report Version History
Regenerating a date's report never overwrites your previous record. All iterations are preserved and navigable newest-first in the report version selector.

### 5. Dynamic 41+ Language Pack Generation
- Built-in out of the box: Traditional Chinese (`zh-TW`), English (`en`), and Spanish (`es`).
- 41+ catalog languages supported dynamically: One-click on-demand generation powered by your local agent summarizer and cached locally in `data/locales/`.
- Full Right-to-Left (RTL) Layout: Complete mirrored UI support for Arabic (`ar`), Hebrew (`he`), Persian (`fa`), and Urdu (`ur`).

---

## Agent Cheat Sheet for Ongoing Management

AI agents and automated scripts can use this cheat sheet for ongoing maintenance:

### 1. Trigger Report Generation

#### Via CLI:
```bash
npm run schedule:run
```

#### Via cURL (Port 4317):
```bash
# Note: The Origin header is required for local CSRF validation
curl -s -X POST http://127.0.0.1:4317/api/reports/generate \
  -H "Origin: http://127.0.0.1:4317" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-09-24"}'
```

### 2. Check LaunchAgent Status
```bash
launchctl list | grep dailyproof
```

### 3. Inspect Service Logs
```bash
# Web server logs
tail -n 50 -f data/logs/web-server.log

# Scheduled report generator logs
tail -n 50 -f data/logs/scheduled-report.log
```

### 4. Update Daily Proof to Latest Version
```bash
git pull
npm install
npm run build
npm run server:install # Re-registers launchd with new build
```

### 5. Override System Timezone
Daily Proof auto-detects your Mac's timezone during setup. To explicitly specify a timezone:
```bash
npm run setup -- --force Asia/Taipei
# or
npm run setup -- --force America/New_York
```

### 6. Clean Uninstallation
To completely remove background daemons and stop Daily Proof:
```bash
# Unload and delete LaunchAgent plists
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.dailyproof.web-server.plist 2>/dev/null || true
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.dailyproof.scheduled-report.plist 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.dailyproof.web-server.plist
rm -f ~/Library/LaunchAgents/com.dailyproof.scheduled-report.plist

# Terminate running web server process on port 4317
kill $(lsof -t -i:4317) 2>/dev/null || true

echo "Daily Proof background services have been completely uninstalled."
```

---

## 中文使用說明 (Traditional Chinese Guide)

### 🤖 給 AI Coding Agent 的一鍵安裝指令

如果您正在使用 **Claude Code**、**OpenAI Codex**、**Google Antigravity** 或 **Cursor**，直接將以下指令複製貼給您的 AI Agent：

> *「請幫我在這台 Mac 上安裝 Daily Proof：先檢查是否有 Node.js 24（若無請用 Homebrew 安裝），Clone https://github.com/josh79622/agent-daily-achievements ，依序執行 setup 與 build，設定 LaunchAgent 背景服務（網頁伺服器與每天 09:00 自動產生日報），最後驗證 http://127.0.0.1:4317/ 正常回應 HTTP 200。」*

### ⚡ 零互動終端機安裝步驟

適合開發者或自動化腳本直接執行，全流程無任何需要按鍵確認的阻斷性提示：

```bash
# 1. 檢查 macOS 與 Node.js 24+
uname -s
node -v

# 2. Clone 專案並進入目錄
git clone https://github.com/josh79622/agent-daily-achievements.git
cd agent-daily-achievements

# 3. 安裝相依套件、初始化時區與權限、編譯前端與伺服器
npm install
npm run setup
npm run build

# 4. 安裝 macOS 背景常駐服務（開機自啟網頁伺服器 + 每日 09:00 AM 自動產報）
npm run server:install
npm run schedule:install

# 5. 驗證完整性並啟動介面
npm run verify:install
npm run open
```

### 🛡️ 核心原則與隱私保護
1. **100% 本機端執行**：所有對話記錄收集、報告儲存皆在 `http://127.0.0.1:4317/`，零雲端、零遙測收集、零外部追蹤。
2. **具體可查證的成果 (Evidence-Backed)**：每個項目皆標記具體的 Agent 工作對話或執行工具日誌，杜絕 AI 幻覺。
3. **肯認決策價值**：不做某些設計、放棄引入不合適的套件，也是深具價值的關鍵決策成果。
4. **多模型支援**：支援 Claude Code、OpenAI Codex、Google Antigravity 本機工作階段。

---

## Quality Gate & Development

Verify fresh-installation prerequisites and isolated runtime state:
```bash
npm run verify:install
```

Before committing code or submitting changes, run the project quality gate:
```bash
npm run check
```

The quality gate executes strictly in sequence:
1. `format:check`: Prettier style verification
2. `lint`: ESLint static analysis
3. `typecheck`: TypeScript compiler checks for both Node.js server and Vite React web application
4. `test`: Vitest unit and component tests
5. `build`: Production bundling

All 70+ test suites and 650+ tests must pass cleanly.
