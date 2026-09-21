# Task L2 — on-demand language packs: design and test cases (for approval)

Status: awaiting Josh's approval. No code until then (AGENTS.md).

## What cannot be seen now → what will be visible when done

Now: 38 of the 41 catalog languages are greyed out as "Not available yet".
Done: each of them (except right-to-left ones) carries an **Add** button. Pressing it
has the already-chosen summarizer provider translate the English pack; once the result
passes validation it is cached on disk and the language becomes selectable, with the
whole page switching to it — no rebuild, no server restart.

## Design decided

- Josh, 2026-09-21: **prepare first, offer later**. A not-yet-built language is not
  selectable; it shows **Add**. It becomes selectable only after a validated pack exists.
- Earlier decisions (unchanged): the user never types a language, only picks from the
  catalog; built-ins stay `en`, `zh-TW`, `es`; the pack is served to the browser at runtime.

## Assumptions to confirm or veto at approval

1. **Provider**: uses the provider already chosen in settings, with the same
   fallback rule as a summary run.
2. **Permission**: building a pack does *not* require the summarizer permission, because
   only the English UI strings are sent — no conversation records. It does require a
   usable provider CLI.
3. **Cache**: `data/locales/<code>.json`, written once, reused forever; deleting the file
   makes the language addable again. (`data/` is already git-ignored.)
4. **Right-to-left** (`ar`, `he`, `fa`, `ur`): still not offered — no Add button, and a
   build request for them is refused. Layout is a separate decision.
5. **Validation**: the pack must have exactly the English pack's keys, and every
   `{placeholder}` in an English string must survive in the translation. Otherwise the
   whole pack is rejected; nothing partial is kept.

## Test cases

### Validation of a returned pack (pure functions)

- **L2-1** A pack with every English key, all placeholders intact → accepted unchanged.
- **L2-2** A pack missing one key → rejected; the reason names the missing key.
- **L2-3** A pack with an extra key not in English → the extra key is dropped, the
  rest accepted.
- **L2-4** A string that dropped `{n}` or `{date}` → rejected; the reason names the key.
- **L2-5** A string that kept the placeholders but reordered them → accepted.
- **L2-6** A value of the wrong type (number, null, nested object where English has a
  string) → rejected.
- **L2-7** A reply wrapped in prose or a code fence → the JSON inside is parsed and
  judged on its content (same extraction as a summary reply).
- **L2-8** A reply that is not JSON at all → rejected with a short reason, no throw.

### Building and caching (server)

- **L2-9** No cached pack for `ja` → `GET /api/locales/ja` reports it as absent and
  returns no pack.
- **L2-10** A successful build writes `data/locales/ja.json` and a following
  `GET /api/locales/ja` serves it.
- **L2-11** A second build request for `ja` when the file exists does not invoke the
  provider; the cached pack is returned.
- **L2-12** A rejected pack (any of L2-2, L2-4, L2-6, L2-8) leaves no file on disk and
  the response carries the reason.
- **L2-13** The provider failing or timing out → the request reports the failure, no file
  is written, and `ja` stays addable.
- **L2-14** A code outside the catalog → refused before the provider is invoked.
- **L2-15** A built-in code (`en`, `zh-TW`, `es`) → refused; a built-in is never generated.
- **L2-16** A right-to-left code (`ar`) → refused, with "not supported yet" as the reason.
- **L2-17** Two build requests for `ja` at once → the provider runs once and both requests
  get the same result.
- **L2-18** The prompt sent to the provider contains the English pack and the catalog's
  English name for the target language, and no conversation content.

### Dropdown and page (frontend)

- **L2-19** The dropdown lists built-in languages first, then already-added ones as
  selectable, then the remaining catalog languages with an **Add** button; right-to-left
  ones keep today's "Not available yet".
- **L2-20** Pressing **Add** marks that row as preparing; the rest of the dropdown stays
  usable and the page's language does not change.
- **L2-21** On success the row stops preparing and becomes selectable; choosing it
  switches the whole page, and the choice is saved like a built-in one.
- **L2-22** On failure the row shows a short failure note and **Add** can be pressed again.
- **L2-23** On a fresh page load, a saved added language loads its cached pack at runtime
  and the page opens in it.
- **L2-24** A saved language whose cached file has since been deleted → the page opens in
  English and that language is offered as addable again.
- **L2-25** A pack missing a key at display time still renders, with English for that key
  (existing `withEnglishFallback`).
