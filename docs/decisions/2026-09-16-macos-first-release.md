# Decision: macOS-only initial public release

Date: 2026-09-16

Josh approved macOS as the initial public-release target. The tool is still intended to be downloadable from GitHub and usable by other people; “macOS-only” limits the first supported platform, not the audience to Josh's Mac.

## Reason and trade-off

The approved first-version behavior includes a scheduled daily report, a Mac notification, and catch-up after sleep/wake. macOS can use its own job scheduler for timed user jobs, including running a missed calendar job on wake. Windows and Linux have different job and notification mechanisms; supporting them now would add separate installers, configuration, permission handling, and verification. This is a sequencing choice, not a claim that the TypeScript report logic could never run elsewhere.

## Release evidence required

Before describing a public macOS release as installable, verify its documented setup in a clean macOS user environment rather than only the developer checkout. Include source detection for Claude Code only, Codex only, and both; optional Chrome add-on absence must not block the main tool. Verify the scheduled job and notification behavior separately. The exact macOS versions, hardware architectures, setup commands, and test environment remain to be designed.

Windows and Linux are not first-release targets. Do not imply they work merely because TypeScript or a runtime can run on those platforms.

References: [macOS timed jobs and sleep/wake behavior](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html), [Windows Task Scheduler](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-waketorun), and [systemd timer configuration](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml).
