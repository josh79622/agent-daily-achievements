// Cross-platform utility to check if the server is running, auto-wake it
// detached in the background if stopped, and open the web UI in the browser.

import net from "node:net";
import { spawn } from "node:child_process";

export type CommandRunner = (
  file: string,
  args: string[],
) => Promise<{ exitCode: number }>;

export interface DetachedServerConfig {
  nodePath?: string;
  scriptPath: string;
  cwd: string;
}

export interface EnsureServerAndOpenOptions {
  port?: number;
  host?: string;
  scriptPath: string;
  cwd: string;
  nodePath?: string;
  url?: string;
  platform?: string;
  execCommand?: CommandRunner;
  timeoutMs?: number;
  startServer?: (config: DetachedServerConfig) => void;
}

/**
 * Checks whether a TCP port is currently accepting connections.
 */
export function isPortListening(
  port: number,
  host: string = "127.0.0.1",
  timeoutMs: number = 500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(true);
      }
    });

    socket.once("timeout", () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(false);
      }
    });

    socket.once("error", () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
}

/**
 * Polls isPortListening until the server accepts connections or timeoutMs elapses.
 */
export async function waitForServer(
  port: number,
  host: string = "127.0.0.1",
  timeoutMs: number = 5000,
  intervalMs: number = 100,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const listening = await isPortListening(
      port,
      host,
      Math.min(timeoutMs, 500),
    );
    if (listening) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Spawns the web server as a detached, unreferenced background process.
 */
export function startDetachedServer(config: DetachedServerConfig): void {
  const child = spawn(
    config.nodePath ?? process.execPath,
    [config.scriptPath],
    {
      cwd: config.cwd,
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
}

/**
 * Opens a URL in the user's default browser across macOS, Windows, and Linux.
 */
export async function openBrowser(
  url: string,
  platform: string = process.platform,
  execCommand?: CommandRunner,
): Promise<boolean> {
  let file: string;
  let args: string[];

  if (platform === "darwin") {
    file = "open";
    args = [url];
  } else if (platform === "win32") {
    file = "cmd.exe";
    args = ["/c", "start", '""', url];
  } else {
    file = "xdg-open";
    args = [url];
  }

  if (execCommand) {
    try {
      const result = await execCommand(file, args);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(file, args, { stdio: "ignore", detached: true });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
      child.unref();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Checks if the server is listening; if not, starts it detached and waits for readiness,
 * then opens the browser.
 */
export async function ensureServerAndOpen(
  options: EnsureServerAndOpenOptions,
): Promise<{ serverStarted: boolean; browserOpened: boolean }> {
  const port = options.port ?? 4317;
  const host = options.host ?? "127.0.0.1";
  const url = options.url ?? `http://${host}:${port}/`;

  let serverStarted = false;
  const alreadyListening = await isPortListening(port, host);

  if (!alreadyListening) {
    const launchServer = options.startServer ?? startDetachedServer;
    launchServer({
      nodePath: options.nodePath,
      scriptPath: options.scriptPath,
      cwd: options.cwd,
    });
    const ready = await waitForServer(port, host, options.timeoutMs ?? 5000);
    if (!ready) {
      throw new Error(`Server failed to start on port ${port} within timeout.`);
    }
    serverStarted = true;
  }

  const browserOpened = await openBrowser(
    url,
    options.platform,
    options.execCommand,
  );

  return { serverStarted, browserOpened };
}
