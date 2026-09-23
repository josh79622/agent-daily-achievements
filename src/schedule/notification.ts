import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface ReportNotificationOptions {
  status: "generated" | "failed";
  date: string;
  provider?: string;
  reason?: string;
  language?: string;
  url?: string;
}

export interface NotificationDeps {
  platform?: string;
  repositoryRoot?: string;
  nodePath?: string;
  appletDir?: string;
  useApplet?: boolean;
  force?: boolean;
  execCommand?: (
    command: string,
    args: readonly string[],
  ) => Promise<{ exitCode: number; stderr?: string }>;
}

export interface EnsureNotifierAppletOptions {
  platform?: string;
  repositoryRoot?: string;
  nodePath?: string;
  appletDir?: string;
  force?: boolean;
  execCommand?: (
    command: string,
    args: readonly string[],
  ) => Promise<{ exitCode: number; stderr?: string }>;
}

export interface AppletScriptOptions {
  nodePath?: string;
  scriptPath?: string;
}

export function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildAppletScript(options?: AppletScriptOptions): string {
  const nodePath = options?.nodePath ?? process.execPath;
  const scriptPath =
    options?.scriptPath ?? resolve(process.cwd(), "scripts/open-app.mjs");

  const quoteArg = (arg: string): string => {
    if (arg.includes(" ") || arg.includes('"')) {
      return `\\"${escapeAppleScript(arg)}\\"`;
    }
    return escapeAppleScript(arg);
  };

  const shellCommand = `${quoteArg(nodePath)} ${quoteArg(scriptPath)}`;

  return `on run argv
  if (count of argv) > 0 then
    set msg to item 1 of argv
    set ttl to item 2 of argv
    display notification msg with title ttl sound name "default"
  else
    do shell script "${shellCommand}"
  end if
end run

on reopen
  do shell script "${shellCommand}"
end reopen`;
}

async function execute(
  command: string,
  args: readonly string[],
  customExec?: (
    command: string,
    args: readonly string[],
  ) => Promise<{ exitCode: number; stderr?: string }>,
): Promise<boolean> {
  if (customExec) {
    try {
      const res = await customExec(command, args);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(command, args as string[], { stdio: "ignore" });
      let settled = false;
      child.on("error", () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      });
      child.on("close", (code) => {
        if (!settled) {
          settled = true;
          resolve(code === 0);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

export async function ensureNotifierApplet(
  options?: EnsureNotifierAppletOptions,
): Promise<string | null> {
  const platform = options?.platform ?? process.platform;
  if (platform !== "darwin") {
    return null;
  }

  const repositoryRoot = options?.repositoryRoot ?? process.cwd();
  const appletDir =
    options?.appletDir ??
    resolve(repositoryRoot, "dist/notifier/DailyProofNotifier.app");
  const appletBinary = resolve(appletDir, "Contents/MacOS/applet");
  const plistPath = resolve(appletDir, "Contents/Info.plist");

  if (!options?.force && existsSync(appletBinary) && existsSync(plistPath)) {
    return appletBinary;
  }

  try {
    try {
      await mkdir(dirname(appletDir), { recursive: true });
    } catch {
      // Ignore filesystem mkdir errors in mocked environments
    }

    const nodePath = options?.nodePath ?? process.execPath;
    const scriptPath = resolve(repositoryRoot, "scripts/open-app.mjs");
    const script = buildAppletScript({ nodePath, scriptPath });

    const compileOk = await execute(
      "osacompile",
      ["-o", appletDir, "-e", script],
      options?.execCommand,
    );
    if (!compileOk) {
      return null;
    }

    const idOk = await execute(
      "plutil",
      [
        "-replace",
        "CFBundleIdentifier",
        "-string",
        "com.antigravity.agent-daily-achievements.notifier",
        plistPath,
      ],
      options?.execCommand,
    );
    if (!idOk) {
      return null;
    }

    const nameOk = await execute(
      "plutil",
      ["-replace", "CFBundleName", "-string", "DailyProofNotifier", plistPath],
      options?.execCommand,
    );
    if (!nameOk) {
      return null;
    }

    const uiOk = await execute(
      "plutil",
      ["-replace", "LSUIElement", "-bool", "true", plistPath],
      options?.execCommand,
    );
    if (!uiOk) {
      return null;
    }

    return appletBinary;
  } catch {
    return null;
  }
}

export function getNotificationContent(options: ReportNotificationOptions): {
  title: string;
  message: string;
} {
  const lang = options.language?.toLowerCase() ?? "";
  const isZh = lang.startsWith("zh");
  const isEs = lang.startsWith("es");

  if (options.status === "generated") {
    if (isZh) {
      return {
        title: "每日成就報告",
        message: options.url
          ? `已為您整理好 ${options.date} 的成就日報 (${options.url})`
          : `已為您整理好 ${options.date} 的成就日報。`,
      };
    }
    if (isEs) {
      return {
        title: "Informe de Logros Diarios",
        message: options.url
          ? `Tu informe de logros para ${options.date} está listo (${options.url})`
          : `Tu informe de logros para ${options.date} está listo.`,
      };
    }
    return {
      title: "Daily Achievements Report",
      message: options.url
        ? `Your achievements report for ${options.date} is ready (${options.url})`
        : `Your achievements report for ${options.date} is ready.`,
    };
  }

  // status === "failed"
  if (isZh) {
    return {
      title: "每日成就報告產生失敗",
      message: `無法為您產生 ${options.date} 的成就日報：${options.reason ?? "未知錯誤"}`,
    };
  }
  if (isEs) {
    return {
      title: "Error al generar el informe",
      message: `No se pudo generar el informe para ${options.date}: ${options.reason ?? "error desconocido"}`,
    };
  }
  return {
    title: "Report Generation Failed",
    message: `Could not generate report for ${options.date}: ${options.reason ?? "unknown error"}`,
  };
}

export function buildNotificationScript(
  options: ReportNotificationOptions,
): string {
  const { title, message } = getNotificationContent(options);
  const escapedMessage = escapeAppleScript(message);
  const escapedTitle = escapeAppleScript(title);
  return `display notification "${escapedMessage}" with title "${escapedTitle}" sound name "default"`;
}

export async function sendReportNotification(
  options: ReportNotificationOptions,
  deps?: NotificationDeps,
): Promise<boolean> {
  try {
    const platform = deps?.platform ?? process.platform;
    if (platform !== "darwin") {
      return false;
    }

    const { title, message } = getNotificationContent(options);

    const shouldUseApplet = deps?.useApplet ?? !deps?.execCommand;
    if (shouldUseApplet) {
      try {
        const appletBinary = await ensureNotifierApplet({
          platform,
          repositoryRoot: deps?.repositoryRoot,
          nodePath: deps?.nodePath,
          appletDir: deps?.appletDir,
          force: deps?.force,
          execCommand: deps?.execCommand,
        });

        if (appletBinary) {
          const appletExecuted = await execute(
            appletBinary,
            [message, title],
            deps?.execCommand,
          );
          if (appletExecuted) {
            return true;
          }
        }
      } catch {
        // Applet compilation or execution failed; proceed to osascript fallback below.
      }
    }

    const script = buildNotificationScript(options);
    return await execute("osascript", ["-e", script], deps?.execCommand);
  } catch {
    return false;
  }
}
