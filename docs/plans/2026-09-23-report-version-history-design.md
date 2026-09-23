# Report Version History and Localized Model Controls Design

## Goal

Keep every manually regenerated report for a date, show all of those versions
on the date page, and ensure the settings model controls use the active UI
language rather than hard-coded bilingual text.

## Confirmed product decisions

- A manual regeneration creates a new report version; it never replaces an
  earlier version for that date.
- The selected date page shows every version, newest first, rather than making
  the user choose one from a selector.
- A report's generated content remains in the language used when that version
  was generated. Switching the application language changes surrounding UI
  chrome only, not historical report text.
- The existing legacy report file for a date must remain readable as that
  date's first version. Existing private report data must not be discarded.

## Storage and compatibility

The current store writes one report to `data/reports/<date>.json`; its atomic
rename intentionally replaces the prior report. New writes will instead add a
version envelope under `data/reports/<date>/<version-id>.json`. The envelope
contains a generated UUID, the storage-time ISO timestamp, and the report.

The store will continue to read an existing flat `<date>.json` as a synthetic
legacy version, using the file modification time as its display timestamp.
It will not move or delete that file. A date can therefore contain its legacy
version plus any number of new immutable versions. The ordinary `read(date)`
method remains a compatibility view of the newest version; new version-aware
methods list and read individual versions, and replace only the version being
edited.

## Server and UI flow

`POST /api/reports/generate` continues to invoke the existing summarizer, but
the report store appends the result. A version-list endpoint returns all
version envelopes for one date, newest first. Version-specific achievement
edit/delete routes include the version id, so actions on one displayed report
cannot alter another version.

The selected-date page fetches that list and renders a labelled section for
each version, including its generation time. Empty dates preserve the existing
empty state. The main header date controls remain the only date navigation;
there is no separate version picker.

## Localization

`SettingsModal` will use translation keys for the preferred-provider badge and
the default-model option. Version headings and generated-time labels will also
be translation keys. English, Traditional Chinese, and Spanish supply native
strings; runtime language packs retain the existing English fallback for newly
added keys.

## Verification

Tests will first prove that repeated saves for one date retain distinct,
readable versions and that the legacy flat file is included. Server tests will
prove version-specific reads and edits target only the named version. Browser
tests will prove multiple versions render newest-first and settings strings
change with the active language. The ordered `npm run check` gate remains the
final verification.
