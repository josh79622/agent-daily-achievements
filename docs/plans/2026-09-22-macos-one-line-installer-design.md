# macOS one-line installer design

Status: approved design, not implemented. This records Josh's 2026-09-22
decisions for the public macOS setup and update experience. It does not broaden
the first release to Windows or Linux.

## What cannot be seen now → what will be visible when done

Now: a new Mac user must already have Node and manually perform several setup
steps; the current scheduling setup is tied to the development machine's Node
path.

Done: a macOS user can manually paste exactly one GitHub-provided bootstrap
command. The bootstrap completes the supported local installation without an
existing Node runtime, then presents the local page and an installed daily job.

No implementation, release asset, bootstrap command, or real installation has
occurred as part of this design.

## Scope and constraints

- macOS is the only supported platform for this first release. Windows support
  is a future extension and must not be implied by this document.
- The user deliberately starts installation by pasting one command from GitHub;
  installation is not silently initiated by the app.
- The bootstrap must work when Node is absent or the system Node is unusable.
- It must not require `sudo`, alter a system-installed Node, or install
  Homebrew.
- Lack of a usable Codex, Claude Code, or other supported summarizer CLI does
  not prevent installation. The local interface must instead clearly show that
  no summarizer is connected and guide the user to connect one.

## Installation components and data flow

1. The GitHub bootstrap command downloads and runs a small macOS bootstrapper.
   It detects Apple Silicon versus Intel and selects the matching official Node
   24 `arm64` or `x64` distribution.
2. The bootstrapper obtains the corresponding official SHA-256 checksum and
   verifies the downloaded runtime before use. It installs the verified runtime
   under `~/Library/Application Support/Agent Daily Achievements/`, where it is
   managed by this tool rather than the operating system.
3. The bootstrapper chooses the source installation directory: a visible
   user-selected location when supplied, otherwise a documented visible default.
   It downloads a fixed project release into that directory. If an installation
   is already present, it never overwrites it; it stops with an actionable
   message directing the user to the update flow.
4. It invokes `npm ci` and the production build using the managed runtime. It
   saves the report timezone, using the approved timezone setup behavior.
5. It resolves and records the managed runtime's absolute `node` path. The
   installed `launchd` job uses that exact path, rather than a developer-machine
   path or a shell-dependent `PATH` lookup.
6. It installs or replaces the one daily 07:00 `launchd` job, then opens the
   local web page. Missing summarizer CLIs are displayed there as absent rather
   than reported as an installation failure.

The implementation must keep source, managed runtime, reports, and user data
boundaries explicit. This design does not authorize deleting existing source
installations or user data during setup.

## Failure handling and recovery

Each failed stage reports the failed prerequisite or operation and a concrete
next action: unsupported macOS/architecture, download or checksum failure,
insufficient writable space, source directory already occupied, dependency or
build failure, timezone failure, or `launchd` installation failure.

The bootstrapper preserves a working installation when a later operation fails.
In particular, it does not replace a prior source/runtime/job with a partial
download or failed build. It must not claim the 07:00 job or local page is ready
unless their respective setup steps actually succeeded.

## Updates

- Updates are manual by default. Settings shows the installed version, the last
  availability check, and an explicit update action.
- A user may opt in to automatic updates. When enabled, the tool checks after a
  daily report finishes, rather than interrupting report generation.
- Every update fetches a fixed-version GitHub release archive and verifies its
  checksum before use. It stages the release, installs dependencies, and builds
  it before atomically switching the active application only after all those
  steps succeed.
- A failed check, verification, installation, or build leaves the existing
  version operating. Settings shows the latest check time and any update error.
- Updates never change summarizer consent, source permissions, timezone, or any
  other user setting.

The repository currently has no configured GitHub remote or public release URL.
Release artifact naming, a signed/verified release manifest, checksum publication,
and the exact bootstrap/update URLs remain implementation-plan work; no command
may be presented as public-installable until those are designed and verified.

## Removal

Removal stops and unloads the tool's `launchd` job, then removes only the
tool-managed application and managed Node runtime. It never removes a
user-installed Node, any agent CLI, or collected reports and other user data
unless a separately explicit data-removal choice is designed and confirmed.

## Verification boundaries

Implementation must first cover the bootstrap logic with focused tests for
architecture selection, checksum verification, existing-install protection,
absolute Node-path handoff, stage-before-switch updates, and no-change recovery
after every failed update stage. Platform-facing commands should be isolated so
their inputs and output/error interpretation can be tested without modifying a
developer machine.

Before calling this feature installable, run the documented one-line flow in a
clean macOS user environment with no usable Node, verify the installed runtime
and source locations, confirm the built local page opens, inspect the one 07:00
`launchd` job and its absolute Node path, and exercise at least one safe failure
and recovery path. Separately verify the no-summarizer state and a machine with
at least one usable summarizer CLI. This is an installation boundary only; it
does not replace the first-version source, notification, add-on, or report
acceptance checks in `BRIEF.md`.
