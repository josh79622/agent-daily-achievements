/**
 * The platform boundary for managed runtime installation. Implementations own
 * filesystem and process details; installer services only coordinate these
 * operations with explicit paths and approved release metadata.
 */
export interface SystemAdapter {
  describeArchitecture(): Promise<string>;
  downloadToStaging(
    archiveUrl: string,
    stagingDirectory: string,
  ): Promise<string>;
  verifySha256(archivePath: string, expectedSha256: string): Promise<boolean>;
  extractArchive(archivePath: string, destination: string): Promise<void>;
  activateAtomically(stagedPath: string, activePath: string): Promise<void>;
  isExecutable(path: string): Promise<boolean>;
}
