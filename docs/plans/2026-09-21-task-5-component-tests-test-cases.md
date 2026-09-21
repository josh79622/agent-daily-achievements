# Task 5 — component tests: design and test cases (for approval)

Status: awaiting Josh's approval. No code until then (AGENTS.md).

## What cannot be seen now → what will be visible when done

Now: `test/web/build-output.test.ts` greps the built JavaScript bundle for strings.
It passes as long as a word appears somewhere in the bundle, so it cannot tell a
working button from a broken one.
Done: the language dropdown and the date stepper are rendered and clicked in tests,
and the bundle-string assertions are gone.

## Design

- Library: `@testing-library/react` with `jsdom`, chosen by Josh on 2026-09-21.
- `vitest.config.ts` gets `environment: "jsdom"`, and `include` widens to `*.test.tsx`.
- New component tests live beside the existing ones in `test/web/`.
- `test/web/build-output.test.ts` keeps one check: the build produces an HTML page with
  a root element and a script. Every string assertion in it goes.
- Scope is the two components with real behavior: `LanguageSelector` and `DateSelector`.
  `ZenJournal` is out of scope — it fetches, and mocking all of it is its own task.
- jsdom has no layout engine, so these tests cannot catch a CSS or layout fault.
  Josh's decision, 2026-09-21: that is acceptable here; CSS and layout coverage waits for
  a future end-to-end layer (a real browser), and is not part of Task 5.

## Test cases

Given/When/Then.

### Language dropdown

- **T5-1** Given the dropdown is closed, when the language button is clicked, then the
  search box and the language list appear.
- **T5-2** Given the dropdown is open, when "espanol" is typed, then only Spanish is listed.
- **T5-3** Given the dropdown is open, when a search matches nothing, then the "no results"
  line is shown.
- **T5-4** Given a built-in language is listed, when it is clicked, then `onLanguageChange`
  is called with its code and the dropdown closes.
- **T5-5** Given a language is not cached, when the dropdown is open, then its row has an
  `Add` button and its name cannot be clicked.
- **T5-6** Given a cached language, when the dropdown is open, then its row has no `Add`
  button and its name can be clicked.
- **T5-7** Given an `Add` button, when it is clicked, then the row shows "preparing" and
  the other rows stay usable.
- **T5-8** Given a build that fails, when it finishes, then the row shows the failure note
  and offers `Add` again.
- **T5-9** Given a build that succeeds, when it finishes, then the row loses its `Add`
  button and becomes clickable.
- **T5-10** Given the dropdown is open, when Escape is pressed, then it closes.

### Date stepper

- **T5-11** Given a left-to-right language, when the stepper renders, then "previous day"
  shows `←` and "next day" shows `→`.
- **T5-12** Given a right-to-left language, when the stepper renders, then the two glyphs
  are swapped.
- **T5-13** Given any direction, when "previous day" is clicked, then `onDateChange` is
  called with the day before the selected one.
- **T5-14** Given today is selected, when the stepper renders, then "next day" is disabled.
- **T5-15** Given the stepper is disabled, when a control is clicked, then `onDateChange`
  is not called.

### Build output

- **T5-16** Given the production build runs, when its HTML is read, then it has a root
  element and loads a script. No string assertions on the bundle.

## Verification beyond unit tests

`npm run check` must stay green, and its run time must not grow noticeably. I will report
the before and after test counts and durations.
