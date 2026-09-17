# Decision: summarizer provider priority and explicit consent

Date: 2026-09-16

Josh approved external AI summarization, with explicit consent by each user during setup. He clarified that the target users work with Claude Code, Codex, or both—not browser-only Claude or ChatGPT subscriptions. If only one agent CLI is usable for summarization, use that one. If both Claude Code and Codex are usable, the user chooses one during setup. The selected agent may receive records originally produced by the other provider, but only within the user's approved data scope; source origin does not determine the summarizer.

Josh initially proposed Codex as the default when both agents are present, then revised that choice: neither agent is the default when both are usable. On 2026-09-17, Josh decided to use Codex as the installation-time default when both are usable and to request maximum external-summarization permission once, so a selected agent that fails can automatically fall back to the other usable CLI. The user can later choose Claude Code in the interface or adjust that permission; changing the choice within already granted permission does not require new consent.

## Privacy boundary

- Before any conversation content is sent, installation must obtain affirmative maximum external-summarization permission. Its detailed disclosure must explain that the tool can send the approved conversation scope to either usable Claude Code or Codex CLI when fallback is needed. One installation choice can authorize later scheduled runs; it does not require approval every night or again when the usable CLI changes within that permission.
- For each daily report, send complete conversations that had activity on the report date, with their context available up to the end of that date. Do not select only apparently relevant excerpts before summarization, resend the unrelated lifetime archive every night, or include later-day activity in a catch-up report. The exact enabled source categories still need to be disclosed in the setup consent.
- Do not treat finding a local history folder, an installed CLI, or a browser sign-in as permission to transmit. With maximum permission, fall back automatically to the other usable CLI if the initial choice fails or becomes unavailable.
- The user must be able to adjust permission through the interface; the exact controls and behavior after restriction or withdrawal remain to be designed. Until scope, recipient, and permission are implemented, use synthetic records for provider experiments and keep real conversation content local.

## Access and failure questions still open

"Has Claude Code/Codex" means an agent CLI ready for summarization, not merely a browser subscription or an old local history folder. An installed command by itself is not enough if authentication or unattended use fails. Claude Code supports non-interactive `claude -p` runs; Codex supports non-interactive `codex exec` runs and can use a saved ChatGPT sign-in. Those are candidate routes, not yet a chosen integration. Their current entitlement, usage limits, authentication, input-size behavior, and unattended reliability must be checked before setup declares either usable. API-key paths would introduce separate billing and credential handling and are not chosen by this priority decision.

Define source-specific day-activity detection, how complete conversations are split without omission if they exceed model limits, the model and output contract, and the report's status when no approved or working agent exists. Do not label a missing or failed model response as a complete daily report.

References: [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage), [Claude Code authentication](https://code.claude.com/docs/en/team), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), and [Codex authentication](https://learn.chatgpt.com/docs/auth).
