import { expect, test } from "vitest";

import {
  installManagedNodeRuntime,
  selectNodeRuntime,
  type NodeRuntimeDescriptor,
} from "../../src/installer/node-runtime.js";
import type { SystemAdapter } from "../../src/installer/system-adapter.js";

const arm64Runtime: NodeRuntimeDescriptor = {
  version: "24.12.0",
  architecture: "arm64",
  archiveUrl: "https://approved.example/node-v24.12.0-darwin-arm64.tar.gz",
  sha256: "arm64-approved-checksum",
};

const x64Runtime: NodeRuntimeDescriptor = {
  version: "24.12.0",
  architecture: "x64",
  archiveUrl: "https://approved.example/node-v24.12.0-darwin-x64.tar.gz",
  sha256: "x64-approved-checksum",
};

test("selects only the approved Node 24 arm64 descriptor on Apple Silicon", () => {
  expect(selectNodeRuntime("arm64", [x64Runtime, arm64Runtime])).toBe(
    arm64Runtime,
  );
});

test("selects the approved x64 descriptor on Intel macOS", () => {
  expect(selectNodeRuntime("x86_64", [arm64Runtime, x64Runtime])).toBe(
    x64Runtime,
  );
});

test("rejects an unsupported architecture before starting a download", async () => {
  const adapter = createAdapter({ architecture: "ppc64" });

  await expect(
    installManagedNodeRuntime(
      {
        descriptors: [arm64Runtime, x64Runtime],
        stagingDirectory: "/staging/node-v24.12.0",
        activeDirectory: "/runtimes/node-v24.12.0",
      },
      adapter,
    ),
  ).rejects.toThrow(/unsupported architecture/i);
  expect(adapter.downloads).toEqual([]);
});

test("does not activate a candidate whose checksum fails verification", async () => {
  const adapter = createAdapter({ checksumMatches: false });

  await expect(
    installManagedNodeRuntime(
      {
        descriptors: [arm64Runtime, x64Runtime],
        stagingDirectory: "/staging/node-v24.12.0",
        activeDirectory: "/runtimes/node-v24.12.0",
      },
      adapter,
    ),
  ).rejects.toThrow(/verification failed/i);
  expect(adapter.activations).toEqual([]);
  expect(adapter.extractions).toEqual([]);
});

test("returns the verified extracted runtime's absolute node executable", async () => {
  const adapter = createAdapter();

  await expect(
    installManagedNodeRuntime(
      {
        descriptors: [arm64Runtime, x64Runtime],
        stagingDirectory: "/staging/node-v24.12.0",
        activeDirectory: "/runtimes/node-v24.12.0",
      },
      adapter,
    ),
  ).resolves.toEqual({
    descriptor: arm64Runtime,
    nodePath: "/runtimes/node-v24.12.0/bin/node",
  });
  expect(adapter.activations).toEqual([
    ["/staging/node-v24.12.0", "/runtimes/node-v24.12.0"],
  ]);
});

test.each([
  ["missing", false],
  ["non-executable", false],
])(
  "rejects a %s node executable after extraction",
  async (_label, executable) => {
    const adapter = createAdapter({ executable });

    await expect(
      installManagedNodeRuntime(
        {
          descriptors: [arm64Runtime, x64Runtime],
          stagingDirectory: "/staging/node-v24.12.0",
          activeDirectory: "/runtimes/node-v24.12.0",
        },
        adapter,
      ),
    ).rejects.toThrow(/node executable/i);
    expect(adapter.activations).toEqual([]);
  },
);

function createAdapter(
  options: {
    architecture?: string;
    checksumMatches?: boolean;
    executable?: boolean;
  } = {},
): SystemAdapter & {
  downloads: Array<[string, string]>;
  extractions: Array<[string, string]>;
  activations: Array<[string, string]>;
} {
  const downloads: Array<[string, string]> = [];
  const extractions: Array<[string, string]> = [];
  const activations: Array<[string, string]> = [];

  return {
    downloads,
    extractions,
    activations,
    describeArchitecture: async () => options.architecture ?? "arm64",
    downloadToStaging: async (url, stagingDirectory) => {
      downloads.push([url, stagingDirectory]);
      return `${stagingDirectory}/node.tar.gz`;
    },
    verifySha256: async () => options.checksumMatches ?? true,
    extractArchive: async (archivePath, destination) => {
      extractions.push([archivePath, destination]);
    },
    activateAtomically: async (stagedPath, activePath) => {
      activations.push([stagedPath, activePath]);
    },
    isExecutable: async () => options.executable ?? true,
  };
}
