#!/usr/bin/env bash
set -euo pipefail

# Daily Proof (agent-daily-achievements) macOS Installer & Launcher

echo "=========================================================="
echo "    Daily Proof — Agent Daily Achievements Setup"
echo "=========================================================="

# 1. Verify macOS platform
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Error: Daily Proof currently supports macOS only (Apple Silicon & Intel)."
  exit 1
fi

# 2. Verify Node.js >= 24
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed."
  echo "Daily Proof requires Node.js 24 LTS."
  echo "Please install Node.js 24 via Homebrew or official installer:"
  echo "  brew install node@24"
  echo "  https://nodejs.org/"
  exit 1
fi

NODE_VERSION="$(node -v)"
NODE_MAJOR="$(echo "$NODE_VERSION" | sed -E 's/^v([0-9]+).*/\1/')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Error: Node.js version 24 LTS or higher is required. Found: $NODE_VERSION"
  echo "Please upgrade to Node.js 24 LTS:"
  echo "  brew install node@24"
  exit 1
fi

# 3. Verify npm
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not in PATH."
  exit 1
fi

echo "Environment verified: macOS ($(uname -m)), Node.js $NODE_VERSION, npm $(npm -v)"
echo ""

# Change to repository root
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

# 4. Install dependencies
echo "--> Installing dependencies (npm install)..."
npm install

# 5. Configure setup (timezone & default summarizer permissions)
echo ""
echo "--> Initializing local configuration (npm run setup)..."
npm run setup

# 6. Build production bundles
echo ""
echo "--> Building production assets (npm run build)..."
npm run build

# 7. Check if running in an interactive terminal for background service setup
if [ -t 0 ]; then
  echo ""
  echo "=== macOS Background Automation Setup ==="
  echo "Daily Proof can run in the background using macOS LaunchAgents:"
  echo "  1. Web Server Daemon (auto-starts on login, port 4317 always ready)"
  echo "  2. Daily 09:00 AM Scheduler (auto-generates daily achievement reports)"
  echo ""
  read -r -p "Install background web server LaunchAgent? [y/N] " install_server
  if [[ "$install_server" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    npm run server:install
  fi

  read -r -p "Install daily 09:00 AM report scheduler LaunchAgent? [y/N] " install_schedule
  if [[ "$install_schedule" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    npm run schedule:install
  fi
else
  echo ""
  echo "=== macOS Background Automation ==="
  echo "To enable background automation later, run:"
  echo "  npm run server:install    # Keeps web server running in background on port 4317"
  echo "  npm run schedule:install  # Schedules daily 09:00 AM report generation"
fi

# 8. Launch application
echo ""
echo "--> Launching Daily Proof (npm run open)..."
npm run open

echo ""
echo "Setup complete! Enjoy your daily cognitive relief."
