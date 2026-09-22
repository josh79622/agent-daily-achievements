/** Explicit paths selected by the installation command or its caller. */
export interface InstallerLayoutConfig {
  /** Absolute home directory used to derive the managed macOS root. */
  homeDirectory: string;
  /**
   * Absolute, visible source-install destination. Its public default remains
   * a release decision, so callers must supply it rather than this module
   * choosing one.
   */
  sourceInstallPath: string;
}

/** Immutable locations used by installer, updater, and removal services. */
export interface InstallerLayout {
  managedRoot: string;
  sourceInstallPath: string;
  runtimePath(version: string): string;
  runtimeStagingPath(version: string): string;
  releasePath(version: string): string;
  releaseStagingPath(version: string): string;
  activeReleasePath: string;
  userDataRoot: string;
  reportsPath: string;
  settingsPath: string;
}
