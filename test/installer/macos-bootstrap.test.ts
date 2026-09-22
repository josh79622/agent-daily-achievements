import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

const bootstrap = join(process.cwd(), "installer/macos/bootstrap.sh");
const temporaryDirectories: string[] = [];
const execFile = promisify(execFileCallback);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

test("selects the matching architecture, cleans staging, and hands approved metadata to the managed Node", async () => {
  const fixture = await createFixture("arm64");

  const result = await runBootstrap(fixture, [
    "--source-dir",
    fixture.sourceDirectory,
    "--managed-root",
    fixture.managedRoot,
    "--installer-script",
    fixture.installerScript,
    "--node-arm64-url",
    "https://approved.example/node-arm64.tar.gz",
    "--node-arm64-sha256",
    "arm64-sha",
    "--node-x64-url",
    "https://approved.example/node-x64.tar.gz",
    "--node-x64-sha256",
    "x64-sha",
    "--",
    "--source-archive-url",
    "https://approved.example/app.tar.gz",
    "--source-sha256",
    "app-sha",
  ]);

  expect(result.status).toBe(0);
  expect(await readLog(fixture, "curl")).toContain(
    "https://approved.example/node-arm64.tar.gz",
  );
  expect(await readLog(fixture, "curl")).not.toContain("node-x64");
  expect(await readLog(fixture, "node")).toContain(
    `${join(fixture.managedRoot, "node-arm64", "bin", "node")} ${fixture.installerScript}`,
  );
  expect(await readLog(fixture, "node")).toContain(
    "--source-dir " + fixture.sourceDirectory,
  );
  expect(await readLog(fixture, "node")).toContain(
    "--source-archive-url https://approved.example/app.tar.gz",
  );
  expect(await stagedBootstrapDirectories(fixture)).toEqual([]);
  await expect(readLog(fixture, "sudo")).resolves.toBe("");
  await expect(readLog(fixture, "brew")).resolves.toBe("");
  await expect(readLog(fixture, "ambient-node")).resolves.toBe("");
}, 15000);

test("selects x64 only for Intel Macs", async () => {
  const fixture = await createFixture("x86_64", { checksum: "x64-sha" });

  const result = await runBootstrap(fixture, requiredArguments(fixture));

  expect(result.status).toBe(0);
  expect(await readLog(fixture, "curl")).toContain(
    "https://approved.example/node-x64.tar.gz",
  );
  expect(await readLog(fixture, "curl")).not.toContain("node-arm64");
}, 15000);

test("stops before download when the selected source directory is occupied", async () => {
  const fixture = await createFixture("arm64");
  await mkdir(fixture.sourceDirectory, { recursive: true });

  const result = await runBootstrap(fixture, requiredArguments(fixture));

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/already contains an installation.*update/i);
  await expect(readLog(fixture, "curl")).resolves.toBe("");
}, 15000);

test("stops on a checksum mismatch without activating a runtime or invoking Node", async () => {
  const fixture = await createFixture("arm64", { checksum: "wrong" });

  const result = await runBootstrap(fixture, requiredArguments(fixture));

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/verification failed/i);
  await expect(
    readFile(join(fixture.managedRoot, "node-arm64", "bin", "node"), "utf8"),
  ).rejects.toThrow();
  await expect(readLog(fixture, "node")).resolves.toBe("");
  expect(await stagedBootstrapDirectories(fixture)).toEqual([]);
}, 15000);

test("does not evaluate argument values as shell code", async () => {
  const fixture = await createFixture("arm64");
  const marker = join(fixture.root, "unsafe-marker");
  const sourceDirectory = join(fixture.root, "source;touch " + marker);

  const result = await runBootstrap(fixture, [
    ...requiredArguments(fixture).flatMap((value) =>
      value === fixture.sourceDirectory ? [sourceDirectory] : [value],
    ),
  ]);

  expect(result.status).toBe(0);
  await expect(readFile(marker, "utf8")).rejects.toThrow();
  expect(await readLog(fixture, "node")).toContain(
    `--source-dir ${sourceDirectory}`,
  );
}, 15000);

test("passes a leading-dash approved URL after curl's option terminator", async () => {
  const fixture = await createFixture("arm64", {
    requireOptionTerminator: true,
  });

  const result = await runBootstrap(fixture, [
    ...requiredArguments(fixture).flatMap((value) =>
      value === "https://approved.example/node-arm64.tar.gz"
        ? ["-approved-node-arm64.tar.gz"]
        : [value],
    ),
  ]);

  expect(result.status).toBe(0);
  expect(await readLog(fixture, "curl")).toContain(
    "--\n-approved-node-arm64.tar.gz",
  );
}, 15000);

test("cleans staging and stops instead of resuming when interrupted during download", async () => {
  const fixture = await createFixture("arm64", {
    interruptDuringDownload: true,
  });

  const result = await runBootstrap(fixture, requiredArguments(fixture));

  expect(result.status).not.toBe(0);
  expect(await stagedBootstrapDirectories(fixture)).toEqual([]);
  await expect(readLog(fixture, "node")).resolves.toBe("");
}, 15000);

function requiredArguments(fixture: Fixture): string[] {
  return [
    "--source-dir",
    fixture.sourceDirectory,
    "--managed-root",
    fixture.managedRoot,
    "--installer-script",
    fixture.installerScript,
    "--node-arm64-url",
    "https://approved.example/node-arm64.tar.gz",
    "--node-arm64-sha256",
    "arm64-sha",
    "--node-x64-url",
    "https://approved.example/node-x64.tar.gz",
    "--node-x64-sha256",
    "x64-sha",
  ];
}

type Fixture = {
  root: string;
  binDirectory: string;
  sourceDirectory: string;
  managedRoot: string;
  installerScript: string;
};

async function createFixture(
  architecture: string,
  options: {
    checksum?: string;
    interruptDuringDownload?: boolean;
    requireOptionTerminator?: boolean;
  } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "macos-bootstrap-"));
  temporaryDirectories.push(root);
  const binDirectory = join(root, "bin");
  const logsDirectory = join(root, "logs");
  const sourceDirectory = join(root, "source");
  const managedRoot = join(root, "managed");
  const installerScript = join(root, "installer.mjs");
  await mkdir(binDirectory, { recursive: true });
  await mkdir(logsDirectory, { recursive: true });
  await writeFile(installerScript, "// fake TypeScript installer entry\n");

  await writeExecutable(
    binDirectory,
    "uname",
    `#!/bin/sh\nprintf '%s\\n' '${architecture}'\n`,
  );
  await writeExecutable(
    binDirectory,
    "curl",
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "$TEST_LOGS/curl"\n${options.requireOptionTerminator ? '[ "$4" = "--" ] || exit 88\n' : ""}output=\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "-o" ]; then output=$2; shift 2; continue; fi\n  shift\ndone\n[ -n "$output" ] && touch "$output"\n${options.interruptDuringDownload ? 'kill -TERM "$PPID"\n' : ""}`,
  );
  await writeExecutable(
    binDirectory,
    "shasum",
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "$TEST_LOGS/shasum"\nprintf '%s  %s\\n' '${options.checksum ?? "arm64-sha"}' "$3"\n`,
  );
  await writeExecutable(
    binDirectory,
    "tar",
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "$TEST_LOGS/tar"\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "-C" ]; then destination=$2; shift 2; continue; fi\n  shift\ndone\nmkdir -p "$destination/bin"\nprintf '%s\\n' '#!/bin/sh' 'printf "%s %s\\\\n" "$0" "$*" >> "$TEST_LOGS/node"' > "$destination/bin/node"\nchmod +x "$destination/bin/node"\n`,
  );
  await writeExecutable(
    binDirectory,
    "sudo",
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "$TEST_LOGS/sudo"\nexit 99\n`,
  );
  await writeExecutable(
    binDirectory,
    "brew",
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "$TEST_LOGS/brew"\nexit 99\n`,
  );
  await writeExecutable(
    binDirectory,
    "node",
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "$TEST_LOGS/ambient-node"\nexit 99\n`,
  );
  return {
    root,
    binDirectory,
    sourceDirectory,
    managedRoot,
    installerScript,
  };
}

async function writeExecutable(
  directory: string,
  name: string,
  content: string,
): Promise<void> {
  const path = join(directory, name);
  await writeFile(path, content);
  await chmod(path, 0o755);
}

async function runBootstrap(
  fixture: Fixture,
  arguments_: string[],
): Promise<{ status: number | null; stderr: string }> {
  try {
    await execFile("/bin/sh", [bootstrap, ...arguments_], {
      cwd: fixture.root,
      env: {
        ...process.env,
        PATH: `${fixture.binDirectory}:/usr/bin:/bin`,
        TEST_LOGS: join(fixture.root, "logs"),
        TMPDIR: fixture.root,
      },
    });
    return { status: 0, stderr: "" };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      "code" in error
    ) {
      return {
        status: typeof error.code === "number" ? error.code : null,
        stderr: String(error.stderr),
      };
    }
    throw error;
  }
}

async function readLog(fixture: Fixture, name: string): Promise<string> {
  try {
    return await readFile(join(fixture.root, "logs", name), "utf8");
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return "";
    throw error;
  }
}

async function stagedBootstrapDirectories(fixture: Fixture): Promise<string[]> {
  return (await readdir(fixture.root)).filter((entry) =>
    entry.startsWith("agent-daily-achievements-bootstrap."),
  );
}
