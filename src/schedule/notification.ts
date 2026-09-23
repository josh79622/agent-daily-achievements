import { spawn } from "node:child_process";

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
  execCommand?: (
    command: string,
    args: readonly string[],
  ) => Promise<{ exitCode: number; stderr?: string }>;
}

export function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
    const script = buildNotificationScript(options);
    if (deps?.execCommand) {
      const res = await deps.execCommand("osascript", ["-e", script]);
      return res.exitCode === 0;
    }
    return await new Promise<boolean>((resolve) => {
      try {
        const child = spawn("osascript", ["-e", script], { stdio: "ignore" });
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
  } catch {
    return false;
  }
}
