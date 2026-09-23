# Task M1 — Latest Provider Models: Design and Test Cases

## What cannot be seen now → what will be visible when done

- **Now**:
  - Codex: `createLocalCommandExecutor` searches only along `$PATH`. When macOS has a newer bundled Codex CLI inside `/Applications/ChatGPT.app/Contents/Resources/codex` (or configured via `~/.codex/config.toml`'s `CODEX_CLI_PATH`), it is ignored if an older CLI exists on `$PATH` (e.g. NVM 0.154.0). As a result, newer models like `GPT-6-Sol` and `GPT-6-Luna` are not discovered.
  - Claude Code: `parseClaudeModels` uses `displayName` (`"Opus"`, `"Sonnet"`, `"Fable"`, `"Haiku"`). In the web UI, models are shown without their version numbers (`"Opus"` instead of `"Opus 5.5"`, `"Sonnet"` instead of `"Sonnet 5"`).
- **Done**:
  - Codex: `executor.locate("codex")` checks `CODEX_CLI_PATH` in `~/.codex/config.toml` and standard app bundles (`/Applications/ChatGPT.app/Contents/Resources/codex`) before `$PATH`, discovering `GPT-6-Sol` and `GPT-6-Luna`.
  - Claude Code: `parseClaudeModels` prefers the model title from `description` (e.g. `"Opus 5.5 · ..."` -> `"Opus 5.5"`, `"Sonnet 5 · ..."` -> `"Sonnet 5"`), falling back to `displayName`.
  - In Settings, both `GPT-6-Sol` and `Opus 5.5` are selectable and displayed with versioned labels.

## Design

1. **`createLocalCommandExecutor` in `src/summarizer/provider-login.ts`**:
   - Accepts injectable `readCodexConfig?: () => Promise<string | undefined>` and `knownPaths?: Record<string, string[]>`.
   - Default `readCodexConfig` reads `~/.codex/config.toml` (or `$CODEX_HOME/config.toml`) and extracts `CODEX_CLI_PATH = "..."`.
   - Default `knownPaths` on macOS (`darwin`) includes `["/Applications/ChatGPT.app/Contents/Resources/codex"]` for `codex`.
   - When locating `executable`:
     - If `executable === "codex"`, first check `readCodexConfig()`. If executable, return it.
     - Check `knownPaths[executable]`. If executable, return it.
     - Fall back to standard `$PATH` traversal.
2. **`parseClaudeModels` in `src/summarizer/model-catalog.ts`**:
   - For each model, derive the label by inspecting `model.description`.
   - If `description` starts with a name before `" · "`, use that prefix (e.g. `"Opus 5.5"`).
   - Otherwise fall back to `model.displayName`.
3. **`builtInModels` in `src/summarizer/model-catalog.ts`**:
   - Update fallback list for `codex` to include `GPT-6-Sol` and `GPT-6-Luna`.
   - Update fallback list for `claude-code` to reflect versioned names (`Opus 5.5`, `Sonnet 5`, `Fable 5.1`, `Haiku 4.5`).

## Test Cases

Given/When/Then:

### Codex Executable Discovery (`test/summarizer/provider-login.test.ts`)

- **M1-1**: Given `~/.codex/config.toml` specifies a valid `CODEX_CLI_PATH`, when `executor.locate("codex")` is called, then it returns the configured path ahead of `$PATH`.
- **M1-2**: Given no config exists but a known application bundle path (`/Applications/ChatGPT.app/Contents/Resources/codex`) exists and is executable, when `executor.locate("codex")` is called, then it returns the known bundle path.
- **M1-3**: Given neither config nor bundle path exists, when `executor.locate("codex")` is called, then it falls back to `$PATH`.

### Claude Model Label Parsing (`test/summarizer/model-catalog.test.ts`)

- **M1-4**: Given a Claude model description containing `"Opus 5.5 · Best for everyday tasks"`, when parsed, then the option label is `"Opus 5.5"`.
- **M1-5**: Given a Claude model with no description, when parsed, then the option label falls back to `displayName`.
- **M1-6**: Given the updated built-in catalog, when loaded without CLIs, then all entries contain safe values and non-empty labels.

## Verification beyond unit tests

1. Run full `npm run check` (format, lint, typecheck for server and web, vitest tests, vite build).
2. Query `/api/summarizer/models` on the running server to verify that:
   - `codex` contains `GPT-6-Sol` and `GPT-6-Luna`.
   - `claude-code` contains `Opus 5.5`, `Sonnet 5`, `Fable 5.1`, `Haiku 4.5`.
