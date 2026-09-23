import net from "node:net";
import { describe, expect, test, vi } from "vitest";

import {
  ensureServerAndOpen,
  isPortListening,
  openBrowser,
  waitForServer,
} from "../../src/server/launcher.js";

describe("Server Launcher & Auto-Wake Utility (AW-2, AW-3, AW-4)", () => {
  describe("isPortListening", () => {
    test("returns true when a server is listening, false when closed", async () => {
      const server = net.createServer();
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      expect(await isPortListening(port, "127.0.0.1")).toBe(true);

      await new Promise<void>((resolve) => server.close(() => resolve()));

      expect(await isPortListening(port, "127.0.0.1")).toBe(false);
    });
  });

  describe("waitForServer", () => {
    test("waits and resolves true when server starts before timeout", async () => {
      // Find an available port first
      const tempServer = net.createServer();
      await new Promise<void>((resolve) =>
        tempServer.listen(0, "127.0.0.1", resolve),
      );
      const port = (tempServer.address() as net.AddressInfo).port;
      await new Promise<void>((resolve) => tempServer.close(() => resolve()));

      const server = net.createServer();
      // Start server after a short delay
      setTimeout(() => {
        server.listen(port, "127.0.0.1");
      }, 50);

      const ready = await waitForServer(port, "127.0.0.1", 1000, 20);
      expect(ready).toBe(true);

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    test("resolves false when timeout expires and port is never listening", async () => {
      // Pick an unused port
      const tempServer = net.createServer();
      await new Promise<void>((resolve) =>
        tempServer.listen(0, "127.0.0.1", resolve),
      );
      const port = (tempServer.address() as net.AddressInfo).port;
      await new Promise<void>((resolve) => tempServer.close(() => resolve()));

      const ready = await waitForServer(port, "127.0.0.1", 100, 20);
      expect(ready).toBe(false);
    });
  });

  describe("openBrowser (AW-4)", () => {
    test("darwin platform invokes 'open'", async () => {
      const execCommand = vi.fn().mockResolvedValue({ exitCode: 0 });
      const result = await openBrowser(
        "http://127.0.0.1:4317/",
        "darwin",
        execCommand,
      );

      expect(result).toBe(true);
      expect(execCommand).toHaveBeenCalledWith("open", [
        "http://127.0.0.1:4317/",
      ]);
    });

    test("win32 platform invokes 'cmd.exe /c start \"\"'", async () => {
      const execCommand = vi.fn().mockResolvedValue({ exitCode: 0 });
      const result = await openBrowser(
        "http://127.0.0.1:4317/",
        "win32",
        execCommand,
      );

      expect(result).toBe(true);
      expect(execCommand).toHaveBeenCalledWith("cmd.exe", [
        "/c",
        "start",
        '""',
        "http://127.0.0.1:4317/",
      ]);
    });

    test("linux platform invokes 'xdg-open'", async () => {
      const execCommand = vi.fn().mockResolvedValue({ exitCode: 0 });
      const result = await openBrowser(
        "http://127.0.0.1:4317/",
        "linux",
        execCommand,
      );

      expect(result).toBe(true);
      expect(execCommand).toHaveBeenCalledWith("xdg-open", [
        "http://127.0.0.1:4317/",
      ]);
    });

    test("returns false when execCommand fails or exits non-zero", async () => {
      const execFailing = vi.fn().mockResolvedValue({ exitCode: 1 });
      expect(
        await openBrowser("http://127.0.0.1:4317/", "darwin", execFailing),
      ).toBe(false);

      const execRejecting = vi
        .fn()
        .mockRejectedValue(new Error("Command not found"));
      expect(
        await openBrowser("http://127.0.0.1:4317/", "darwin", execRejecting),
      ).toBe(false);
    });
  });

  describe("ensureServerAndOpen", () => {
    test("AW-2: detects already listening server and opens browser without starting new server", async () => {
      const server = net.createServer();
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const port = (server.address() as net.AddressInfo).port;

      const startServer = vi.fn();
      const execCommand = vi.fn().mockResolvedValue({ exitCode: 0 });

      const result = await ensureServerAndOpen({
        port,
        host: "127.0.0.1",
        scriptPath: "/repo/dist/src/server/index.js",
        cwd: "/repo",
        platform: "darwin",
        execCommand,
        startServer,
      });

      expect(result.serverStarted).toBe(false);
      expect(result.browserOpened).toBe(true);
      expect(startServer).not.toHaveBeenCalled();
      expect(execCommand).toHaveBeenCalledWith("open", [
        `http://127.0.0.1:${port}/`,
      ]);

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    test("AW-3: auto-wakes stopped server and opens browser once listening", async () => {
      const tempServer = net.createServer();
      await new Promise<void>((resolve) =>
        tempServer.listen(0, "127.0.0.1", resolve),
      );
      const port = (tempServer.address() as net.AddressInfo).port;
      await new Promise<void>((resolve) => tempServer.close(() => resolve()));

      let startedServerInstance: net.Server | undefined;
      const startServer = vi.fn(() => {
        startedServerInstance = net.createServer();
        startedServerInstance.listen(port, "127.0.0.1");
      });
      const execCommand = vi.fn().mockResolvedValue({ exitCode: 0 });

      const result = await ensureServerAndOpen({
        port,
        host: "127.0.0.1",
        scriptPath: "/repo/dist/src/server/index.js",
        cwd: "/repo",
        platform: "darwin",
        execCommand,
        startServer,
      });

      expect(result.serverStarted).toBe(true);
      expect(result.browserOpened).toBe(true);
      expect(startServer).toHaveBeenCalledWith({
        nodePath: undefined,
        scriptPath: "/repo/dist/src/server/index.js",
        cwd: "/repo",
      });
      expect(execCommand).toHaveBeenCalledWith("open", [
        `http://127.0.0.1:${port}/`,
      ]);

      if (startedServerInstance) {
        await new Promise<void>((resolve) =>
          startedServerInstance!.close(() => resolve()),
        );
      }
    });
  });
});
