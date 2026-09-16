# Decision: Node.js LTS with GitHub-source setup first

Date: 2026-09-16

Josh approved Node.js LTS as the first-version main tool's runtime and a GitHub-source installation guided by setup commands. A standalone executable or bundled Mac app is not required for the first public release. This is an installation direction, not a claim that a working installer or short setup already exists.

## Why

- Users can ask their AI agent to follow a small, documented set of commands to obtain the source and configure the local tool. This matches the goal of an installable GitHub project without making binary packaging a prerequisite to building the first working version.
- Setup must check for the required runtime, explain how to obtain it if missing, install the project's dependencies, and configure the local background job. Merely checking prerequisites would leave a new user unable to run the tool.
- The optional Chrome add-on remains separate; its absence must not prevent main-tool setup or local-source reports.

## Alternatives and trade-offs

- **Deno:** runs TypeScript directly and includes tools such as a test runner and linter, but would make Deno the required runtime for users. It can create an executable later; that benefit does not require choosing it now.
- **Bun:** combines a TypeScript-capable runtime, package manager, testing, and bundling. Its executable packaging is useful, but not necessary for the chosen source-and-commands path.
- **Bundled executable now:** can reduce user prerequisites, but adds packaging, macOS distribution, and fresh-install verification work before core behavior has been tested. Revisit if the source setup proves too difficult.

## Still open and verification gate

Choose the exact supported Node.js LTS version range, package manager and lockfile, dependency/build commands, setup and uninstall behavior, and macOS job/notification configuration as part of the architecture design. Do not silently add a command that installs system software or requires elevated privileges. Before calling the public release installable, run the documented setup in a clean macOS user environment and verify the local tool, scheduling, and notifications. Keep Chrome add-on installation a separate path.

References: [Node.js downloads and LTS status](https://nodejs.org/en/download), [Deno runtime](https://docs.deno.com/runtime/), and [Bun toolkit](https://bun.com/docs).
