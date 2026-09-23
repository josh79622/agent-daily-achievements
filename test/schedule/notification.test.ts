import { describe, expect, it } from "vitest";
import {
  buildAppletScript,
  buildNotificationScript,
  ensureNotifierApplet,
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

  // N1-7: Applet script generation, compilation, and notification routing
  describe("N1-7: DailyProofNotifier applet and click routing", () => {
    it("builds applet script with custom and default paths", () => {
      const script = buildAppletScript({
        nodePath: "NODE_PATH",
        scriptPath: "REPO_ROOT/scripts/open-app.mjs",
      });

      expect(script).toBe(
        `on run argv
  if (count of argv) > 0 then
    set msg to item 1 of argv
    set ttl to item 2 of argv
    display notification msg with title ttl sound name "default"
  else
    do shell script "NODE_PATH REPO_ROOT/scripts/open-app.mjs"
  end if
end run

on reopen
  do shell script "NODE_PATH REPO_ROOT/scripts/open-app.mjs"
end reopen`,
      );

      // Default paths
      const defaultScript = buildAppletScript();
      expect(defaultScript).toContain("on run argv");
      expect(defaultScript).toContain("on reopen");
      expect(defaultScript).toContain("scripts/open-app.mjs");
    });

    it("escapes and quotes paths with spaces in buildAppletScript", () => {
      const script = buildAppletScript({
        nodePath: "/Applications/Node JS/bin/node",
        scriptPath: "/Users/test user/app/scripts/open-app.mjs",
      });

      expect(script).toContain(
        'do shell script "\\"/Applications/Node JS/bin/node\\" \\"/Users/test user/app/scripts/open-app.mjs\\""',
      );
    });

    it("ensureNotifierApplet compiles with osacompile and configures with plutil", async () => {
      const executedCommands: Array<{
        command: string;
        args: readonly string[];
      }> = [];
      const appletDir = "/mock/path/dist/notifier/DailyProofNotifier.app";

      const binaryPath = await ensureNotifierApplet({
        platform: "darwin",
        appletDir,
        nodePath: "/usr/local/bin/node",
        repositoryRoot: "/mock/repo",
        force: true,
        execCommand: async (command, args) => {
          executedCommands.push({ command, args });
          return { exitCode: 0 };
        },
      });

      expect(binaryPath).toBe(
        "/mock/path/dist/notifier/DailyProofNotifier.app/Contents/MacOS/applet",
      );
      expect(executedCommands).toHaveLength(4);

      const [compileCmd, idCmd, nameCmd, uiCmd] = executedCommands;

      // 1: osacompile
      expect(compileCmd?.command).toBe("osacompile");
      expect(compileCmd?.args[0]).toBe("-o");
      expect(compileCmd?.args[1]).toBe(appletDir);
      expect(compileCmd?.args[2]).toBe("-e");
      expect(compileCmd?.args[3]).toContain("on run argv");

      // 2: plutil CFBundleIdentifier
      expect(idCmd?.command).toBe("plutil");
      expect(idCmd?.args).toEqual([
        "-replace",
        "CFBundleIdentifier",
        "-string",
        "com.antigravity.agent-daily-achievements.notifier",
        "/mock/path/dist/notifier/DailyProofNotifier.app/Contents/Info.plist",
      ]);

      // 3: plutil CFBundleName
      expect(nameCmd?.command).toBe("plutil");
      expect(nameCmd?.args).toEqual([
        "-replace",
        "CFBundleName",
        "-string",
        "DailyProofNotifier",
        "/mock/path/dist/notifier/DailyProofNotifier.app/Contents/Info.plist",
      ]);

      // 4: plutil LSUIElement
      expect(uiCmd?.command).toBe("plutil");
      expect(uiCmd?.args).toEqual([
        "-replace",
        "LSUIElement",
        "-bool",
        "true",
        "/mock/path/dist/notifier/DailyProofNotifier.app/Contents/Info.plist",
      ]);
    });

    it("ensureNotifierApplet returns null on non-darwin platform", async () => {
      const res = await ensureNotifierApplet({
        platform: "linux",
      });
      expect(res).toBeNull();
    });

    it("ensureNotifierApplet returns null if osacompile fails", async () => {
      const res = await ensureNotifierApplet({
        platform: "darwin",
        appletDir: "/mock/nonexistent/DailyProofNotifier.app",
        force: true,
        execCommand: async (cmd) => {
          if (cmd === "osacompile") {
            return { exitCode: 1, stderr: "compile error" };
          }
          return { exitCode: 0 };
        },
      });
      expect(res).toBeNull();
    });

    it("ensureNotifierApplet returns null if plutil fails", async () => {
      const res = await ensureNotifierApplet({
        platform: "darwin",
        appletDir: "/mock/nonexistent/DailyProofNotifier.app",
        force: true,
        execCommand: async (cmd) => {
          if (cmd === "plutil") {
            return { exitCode: 1, stderr: "plutil error" };
          }
          return { exitCode: 0 };
        },
      });
      expect(res).toBeNull();
    });

    it("routes notification to applet binary when useApplet is true", async () => {
      const executedCommands: Array<{
        command: string;
        args: readonly string[];
      }> = [];
      const appletDir = "/mock/notifier/DailyProofNotifier.app";

      const success = await sendReportNotification(
        {
          status: "generated",
          date: "2026-09-23",
          url: "http://127.0.0.1:4317/",
          language: "zh-TW",
        },
        {
          platform: "darwin",
          useApplet: true,
          appletDir,
          execCommand: async (command, args) => {
            executedCommands.push({ command, args });
            return { exitCode: 0 };
          },
        },
      );

      expect(success).toBe(true);
      const lastCall = executedCommands.at(-1);
      expect(lastCall?.command).toBe(
        "/mock/notifier/DailyProofNotifier.app/Contents/MacOS/applet",
      );
      expect(lastCall?.args).toEqual([
        "已為您整理好 2026-09-23 的成就日報 (http://127.0.0.1:4317/)",
        "每日成就報告",
      ]);
    });

    it("falls back to osascript -e when applet compilation fails", async () => {
      const executedCommands: Array<{
        command: string;
        args: readonly string[];
      }> = [];

      const success = await sendReportNotification(
        {
          status: "generated",
          date: "2026-09-23",
          url: "http://127.0.0.1:4317/",
          language: "en",
        },
        {
          platform: "darwin",
          useApplet: true,
          appletDir: "/mock/fail-applet/DailyProofNotifier.app",
          execCommand: async (command, args) => {
            executedCommands.push({ command, args });
            if (command === "osacompile") {
              return { exitCode: 1, stderr: "compile error" };
            }
            return { exitCode: 0 };
          },
        },
      );

      expect(success).toBe(true);
      const lastCall = executedCommands.at(-1);
      expect(lastCall?.command).toBe("osascript");
      expect(lastCall?.args?.[0]).toBe("-e");
      expect(lastCall?.args?.[1]).toContain("display notification");
    });

    it("falls back to osascript -e when applet execution fails", async () => {
      const executedCommands: Array<{
        command: string;
        args: readonly string[];
      }> = [];

      const success = await sendReportNotification(
        {
          status: "generated",
          date: "2026-09-23",
          url: "http://127.0.0.1:4317/",
          language: "en",
        },
        {
          platform: "darwin",
          useApplet: true,
          appletDir: "/mock/notifier/DailyProofNotifier.app",
          execCommand: async (command, args) => {
            executedCommands.push({ command, args });
            if (command.includes("applet")) {
              return { exitCode: 1, stderr: "applet crashed" };
            }
            return { exitCode: 0 };
          },
        },
      );

      expect(success).toBe(true);
      const lastCall = executedCommands.at(-1);
      expect(lastCall?.command).toBe("osascript");
      expect(lastCall?.args?.[0]).toBe("-e");
    });
  });
});
