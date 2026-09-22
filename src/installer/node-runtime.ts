import { isAbsolute, join } from "node:path";

import type { SystemAdapter } from "./system-adapter.js";

export type SupportedNodeArchitecture = "arm64" | "x64";

/** Approved Node release data supplied by release metadata. */
export interface NodeRuntimeDescriptor {
  version: string;
  architecture: SupportedNodeArchitecture;
  archiveUrl: string;
  sha256: string;
}

export interface ManagedNodeRuntimeRequest {
  descriptors: readonly NodeRuntimeDescriptor[];
  stagingDirectory: string;
  activeDirectory: string;
}

export interface ManagedNodeRuntime {
  descriptor: NodeRuntimeDescriptor;
  nodePath: string;
}

/**
 * Selects exactly one approved Node 24 runtime for the macOS architecture.
 * URL and checksum values remain caller-supplied release metadata.
 */
export function selectNodeRuntime(
  architecture: string,
  descriptors: readonly NodeRuntimeDescriptor[],
): NodeRuntimeDescriptor {
  const targetArchitecture = macosNodeArchitecture(architecture);
  const candidates = descriptors.filter(
    (descriptor) =>
      descriptor.architecture === targetArchitecture &&
      isNode24Version(descriptor.version),
  );

  if (candidates.length !== 1) {
    throw new Error(
      `expected one approved Node 24 ${targetArchitecture} runtime descriptor`,
    );
  }
  return candidates[0]!;
}

/** Downloads, verifies, extracts, validates, and atomically activates Node. */
export async function installManagedNodeRuntime(
  request: ManagedNodeRuntimeRequest,
  system: SystemAdapter,
): Promise<ManagedNodeRuntime> {
  requireAbsolutePath("runtime staging directory", request.stagingDirectory);
  requireAbsolutePath("active runtime directory", request.activeDirectory);

  const descriptor = selectNodeRuntime(
    await system.describeArchitecture(),
    request.descriptors,
  );
  const archivePath = await system.downloadToStaging(
    descriptor.archiveUrl,
    request.stagingDirectory,
  );
  const checksumMatches = await system.verifySha256(
    archivePath,
    descriptor.sha256,
  );
  if (!checksumMatches) {
    throw new Error("Node runtime verification failed: SHA-256 mismatch");
  }

  await system.extractArchive(archivePath, request.stagingDirectory);
  const stagedNodePath = join(request.stagingDirectory, "bin", "node");
  if (!(await system.isExecutable(stagedNodePath))) {
    throw new Error("verified Node runtime has no usable node executable");
  }

  await system.activateAtomically(
    request.stagingDirectory,
    request.activeDirectory,
  );
  return { descriptor, nodePath: join(request.activeDirectory, "bin", "node") };
}

function macosNodeArchitecture(
  architecture: string,
): SupportedNodeArchitecture {
  if (architecture === "arm64") return "arm64";
  if (architecture === "x86_64") return "x64";
  throw new Error(`unsupported architecture: ${architecture}`);
}

function isNode24Version(version: string): boolean {
  return /^24\./.test(version);
}

function requireAbsolutePath(label: string, path: string): void {
  if (!isAbsolute(path)) throw new Error(`${label} must be absolute`);
}
