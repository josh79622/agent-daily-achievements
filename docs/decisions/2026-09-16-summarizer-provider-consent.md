# Decision: summarizer provider priority and explicit consent

Date: 2026-09-16

Josh approved external AI summarization, with explicit consent by each user during setup. If only Claude is usable for summarization, use Claude. If only ChatGPT/OpenAI is usable, use OpenAI. If both are usable, prefer OpenAI. This priority is independent of whether the day's records came from Claude Code, Codex, or an optional web source: the selected provider may receive records originally produced by the other provider, but only within the user's approved data scope.

## Privacy boundary

- Before any conversation content is sent, setup must disclose the actual recipient and the scope of data to be transmitted, and obtain an affirmative choice. One setup choice can authorize later scheduled runs; it does not require approval every night.
- Do not treat finding a local history folder, an installed CLI, or a browser sign-in as consent to transmit. Do not silently fall back to another provider if the preferred one fails or becomes unavailable.
- The user must be able to withdraw consent; the exact control and behavior after withdrawal remain to be designed. Until scope, recipient, and consent are implemented, use synthetic records for provider experiments and keep real conversation content local.

## Access and failure questions still open

"Has Claude/ChatGPT" is not yet a technical detection rule. A web subscription alone is not proof that the nightly worker can call a model. Claude Code supports non-interactive `claude -p` runs; Codex supports non-interactive `codex exec` runs and can use a saved ChatGPT sign-in. Those are candidate routes, not yet a chosen integration. Their current entitlement, usage limits, authentication, input-size behavior, and unattended reliability must be checked before setup declares either usable. API-key paths would introduce separate billing and credential handling and are not chosen by this priority decision.

Define what source records enter a day's summarization request, how complete inputs are handled if they exceed model limits, the model and output contract, and the report's status when no approved or working provider exists. Do not label a missing or failed model response as a complete daily report.

References: [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage), [Claude Code authentication](https://code.claude.com/docs/en/team), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), and [Codex authentication](https://learn.chatgpt.com/docs/auth).
