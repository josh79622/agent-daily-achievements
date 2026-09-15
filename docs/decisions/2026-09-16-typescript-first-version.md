# Decision: TypeScript for first-version application code

Date: 2026-09-16

Josh chose TypeScript for now, meaning the first-version local worker, local web interface, and optional Chrome add-on. This is a language decision, **not** approval of a complete architecture or toolchain. TypeScript is compiled to JavaScript for execution; HTML, CSS, manifests, macOS job configuration, and installation metadata are not expected to be TypeScript.

## Why this fits the revised product goal

- The main tool must be downloadable from GitHub and usable by people with Claude Code only, Codex only, or both. The Chrome add-on is separately optional. One application language lowers the number of runtimes and cross-language contracts we would otherwise need to distribute and maintain.
- The chosen interface and Chrome extension both require browser-side JavaScript; TypeScript can provide checked source code for those pieces and the local worker. Josh's JavaScript reading familiarity is helpful but was not the deciding reason.
- Collection, daily scheduling, report storage, and source coverage must remain independent of the report page. Choosing one language does not remove the need for local background work or macOS integration.

## Trade-offs and alternatives

- **Python core plus TypeScript browser code:** strong text/data tooling and a useful Python learning opportunity, but a second runtime and a contract between the browser pieces and the core complicate public installation. It remains a possible later change if real source processing demonstrates a substantial need.
- **Swift core plus TypeScript browser code:** would align with a later native Mac app, but adds a second language while the first interface is local web. It also would not remove the Chrome JavaScript component.
- **TypeScript throughout:** simpler shared source language, but still needs a runtime, build step, dependency policy, and a concrete way to install and run Mac jobs/notifications. A future native Mac app would not be an automatic conversion.

## Still open

Do not infer Node.js versus another TypeScript runtime, a specific Node version, package manager, web framework, database, installer, Chrome distribution path, summarization provider/privacy boundary, or initial operating-system support from this decision. Design and verify those separately before implementation or public release.

References: [TypeScript's compiled JavaScript model](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch), [Chrome extension development](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world), and [macOS timed jobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html).
