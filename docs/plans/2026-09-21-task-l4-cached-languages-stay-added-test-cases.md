# Task L4 — cached languages stay added: design and test cases (for approval)

Status: awaiting Josh's approval. No code until then (AGENTS.md).

Found during the real Arabic run on 2026-09-21 (`PROGRESS.md`, under the L3 entry).

## What cannot be seen now → what will be visible when done

Now: after a reload, a language you already built shows `Add` again. Only the saved
language's pack is fetched at startup.
Done: every language with a pack on disk is selectable, with no `Add` button.

## Design

- New route `GET /api/locales` returns the cached codes: `{ "codes": ["ar", "ja"] }`.
  It reads the cache directory. It never calls a provider.
- `LanguagePackStore` gains `list()`, beside `read` and `write`.
- The web app fetches that list at startup and marks those codes as added.
- A pack is downloaded only when its language is chosen. The list does not fetch 40 packs.
- So "cached" (on disk) and "loaded" (in memory) are now two different things.
  `web/language-options.ts` asks the first; `getTranslations` still asks the second.

## Test cases

Given/When/Then. "Cached" means a pack file is on disk.

### The listing route

- **L4-1** Given nothing is cached, when the list is requested, then it is empty.
- **L4-2** Given `ar` and `ja` are cached, when the list is requested, then it holds exactly
  those two codes, and no provider runs.
- **L4-3** Given the cache holds a file that is not a language pack, when the list is
  requested, then that file is left out.
- **L4-4** Given the cache directory is missing, when the list is requested, then the list is
  empty and no error is raised.

### The dropdown

- **L4-5** Given `ja` is cached but not loaded, when the dropdown opens, then `ja` is
  selectable, has no `Add` button, and sits after the built-in languages.
- **L4-6** Given `ja` is cached but not loaded, when `ja` is chosen, then its pack is fetched
  first and the page switches only after the pack arrives.
- **L4-7** Given a cached pack file is deleted while the page is open, when the list is
  fetched again, then that language goes back to `Add`.
- **L4-8** Given the list request fails, when the dropdown opens, then it looks exactly as it
  does today, and no error is shown.

## Verification beyond unit tests

Checked by me in the browser against the real server. `ar`, `ja` and `zh-CN` are already
cached, so no provider call is needed: reload in `zh-TW`, confirm all three are selectable
with no `Add`, switch into Japanese and back.
