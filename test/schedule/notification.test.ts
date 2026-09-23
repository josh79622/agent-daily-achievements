import { describe, expect, it } from "vitest";
import {
  buildNotificationScript,
  escapeAppleScript,
  sendReportNotification,
} from "../../src/schedule/notification.js";

describe("macOS native report notification", () => {
  // N1-1: Successful report notification (macOS) invokes osascript with -e and matching script
  it("N1-1: invokes osascript on macOS with -e and correct script", async () => {
    let executedCommand = "";
    let executedArgs: readonly string[] = [];

    const success = await sendReportNotification(
      {
        status: "generated",
        date: "2026-09-23",
        provider: "codex",
        language: "zh-TW",
        url: "http://127.0.0.1:4317/",
      },
      {
        platform: "darwin",
        execCommand: async (command, args) => {
          executedCommand = command;
          executedArgs = args;
          return { exitCode: 0 };
        },
      },
    );

    expect(success).toBe(true);
    expect(executedCommand).toBe("osascript");
    expect(executedArgs).toEqual([
      "-e",
      'display notification "已為您整理好 2026-09-23 的成就日報 (http://127.0.0.1:4317/)" with title "每日成就報告" sound name "default"',
    ]);
  });

  // N1-2: Localized messages for zh-TW, es, and en
  it("N1-2: produces localized notification messages for zh-TW, es, and en", () => {
    // zh-TW / zh
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
        language: "zh-TW",
        url: "http://127.0.0.1:4317/",
      }),
    ).toBe(
      'display notification "已為您整理好 2026-09-23 的成就日報 (http://127.0.0.1:4317/)" with title "每日成就報告" sound name "default"',
    );
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
        language: "zh-TW",
      }),
    ).toBe(
      'display notification "已為您整理好 2026-09-23 的成就日報。" with title "每日成就報告" sound name "default"',
    );
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
        language: "zh",
      }),
    ).toBe(
      'display notification "已為您整理好 2026-09-23 的成就日報。" with title "每日成就報告" sound name "default"',
    );

    // es
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
        language: "es",
        url: "http://127.0.0.1:4317/",
      }),
    ).toBe(
      'display notification "Tu informe de logros para 2026-09-23 está listo (http://127.0.0.1:4317/)" with title "Informe de Logros Diarios" sound name "default"',
    );
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
        language: "es",
      }),
    ).toBe(
      'display notification "Tu informe de logros para 2026-09-23 está listo." with title "Informe de Logros Diarios" sound name "default"',
    );

    // en (explicit and default fallback)
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
        language: "en",
        url: "http://127.0.0.1:4317/",
      }),
    ).toBe(
      'display notification "Your achievements report for 2026-09-23 is ready (http://127.0.0.1:4317/)" with title "Daily Achievements Report" sound name "default"',
    );
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
        language: "en",
      }),
    ).toBe(
      'display notification "Your achievements report for 2026-09-23 is ready." with title "Daily Achievements Report" sound name "default"',
    );
    expect(
      buildNotificationScript({
        status: "generated",
        date: "2026-09-23",
      }),
    ).toBe(
      'display notification "Your achievements report for 2026-09-23 is ready." with title "Daily Achievements Report" sound name "default"',
    );
  });

  // N1-3: Non-darwin platform returns false and executes nothing
  it("N1-3: returns false and executes nothing on non-darwin platforms", async () => {
    let callCount = 0;
    const fakeExec = async () => {
      callCount++;
      return { exitCode: 0 };
    };

    const linuxResult = await sendReportNotification(
      { status: "generated", date: "2026-09-23" },
      { platform: "linux", execCommand: fakeExec },
    );
    expect(linuxResult).toBe(false);
    expect(callCount).toBe(0);

    const winResult = await sendReportNotification(
      { status: "generated", date: "2026-09-23" },
      { platform: "win32", execCommand: fakeExec },
    );
    expect(winResult).toBe(false);
    expect(callCount).toBe(0);
  });

  // N1-4: Subprocess failure or rejection returns false without throwing
  it("N1-4: safely returns false on subprocess failure or rejection", async () => {
    // Non-zero exit code
    const exitFailure = await sendReportNotification(
      { status: "generated", date: "2026-09-23" },
      {
        platform: "darwin",
        execCommand: async () => ({
          exitCode: 1,
          stderr: "execution error: 1000",
        }),
      },
    );
    expect(exitFailure).toBe(false);

    // Rejection / exception thrown
    const thrownFailure = await sendReportNotification(
      { status: "generated", date: "2026-09-23" },
      {
        platform: "darwin",
        execCommand: async () => {
          throw new Error("osascript process killed");
        },
      },
    );
    expect(thrownFailure).toBe(false);
  });

  // N1-5: Quotes and backslashes in date/reason are safely escaped in AppleScript
  it("N1-5: escapes quotes and backslashes in AppleScript content", () => {
    expect(escapeAppleScript('C:\\Path\\To "Folder"')).toBe(
      'C:\\\\Path\\\\To \\"Folder\\"',
    );

    const script = buildNotificationScript({
      status: "failed",
      date: "2026-09-23",
      reason: 'Provider "codex" failed with \\timeout\\ error',
      language: "en",
    });

    expect(script).toBe(
      'display notification "Could not generate report for 2026-09-23: Provider \\"codex\\" failed with \\\\timeout\\\\ error" with title "Report Generation Failed" sound name "default"',
    );
  });

  // N1-6: Failure notification sends expected failure script
  it("N1-6: sends expected localized failure script", async () => {
    // zh-TW failure with reason
    expect(
      buildNotificationScript({
        status: "failed",
        date: "2026-09-23",
        reason: "API 逾時",
        language: "zh-TW",
      }),
    ).toBe(
      'display notification "無法為您產生 2026-09-23 的成就日報：API 逾時" with title "每日成就報告產生失敗" sound name "default"',
    );

    // zh-TW failure without reason
    expect(
      buildNotificationScript({
        status: "failed",
        date: "2026-09-23",
        language: "zh-TW",
      }),
    ).toBe(
      'display notification "無法為您產生 2026-09-23 的成就日報：未知錯誤" with title "每日成就報告產生失敗" sound name "default"',
    );

    // es failure with reason
    expect(
      buildNotificationScript({
        status: "failed",
        date: "2026-09-23",
        reason: "Fallo de conexión",
        language: "es",
      }),
    ).toBe(
      'display notification "No se pudo generar el informe para 2026-09-23: Fallo de conexión" with title "Error al generar el informe" sound name "default"',
    );

    // es failure without reason
    expect(
      buildNotificationScript({
        status: "failed",
        date: "2026-09-23",
        language: "es",
      }),
    ).toBe(
      'display notification "No se pudo generar el informe para 2026-09-23: error desconocido" with title "Error al generar el informe" sound name "default"',
    );

    // en failure with reason
    expect(
      buildNotificationScript({
        status: "failed",
        date: "2026-09-23",
        reason: "Network timeout",
        language: "en",
      }),
    ).toBe(
      'display notification "Could not generate report for 2026-09-23: Network timeout" with title "Report Generation Failed" sound name "default"',
    );

    // en failure without reason
    expect(
      buildNotificationScript({
        status: "failed",
        date: "2026-09-23",
        language: "en",
      }),
    ).toBe(
      'display notification "Could not generate report for 2026-09-23: unknown error" with title "Report Generation Failed" sound name "default"',
    );

    // Dispatching failure notification via sendReportNotification
    let executedArgs: readonly string[] = [];
    const success = await sendReportNotification(
      {
        status: "failed",
        date: "2026-09-23",
        reason: "Network error",
        language: "en",
      },
      {
        platform: "darwin",
        execCommand: async (_cmd, args) => {
          executedArgs = args;
          return { exitCode: 0 };
        },
      },
    );

    expect(success).toBe(true);
    expect(executedArgs[1]).toBe(
      'display notification "Could not generate report for 2026-09-23: Network error" with title "Report Generation Failed" sound name "default"',
    );
  });
});
