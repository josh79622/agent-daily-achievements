# Synthetic set 02: fictional conversation payloads

Status: **draft, awaiting Josh's approval.** No model has been run against them.

## Why these exist

[Synthetic set 02](synthetic-set-02.md) and
`test/fixtures/report-eval/synthetic-set-02.json` hold each case's evidence
manifest and its predetermined expectations, but no conversation text. The case
descriptions summarise what happened rather than showing records, so there was
nothing a model could actually read. Running the prompt against the set needed
the payloads to be written, which is authoring test input and therefore needs
approval before any run.

Machine-readable: `test/fixtures/report-eval/synthetic-set-02-payloads.json`,
in the exact shape `buildReportDayPayload` produces.

## Authoring rules followed

1. **Nothing states the expected answer.** No payload says an activity is
   progress, a decision, a duplicate, or forbidden, and no expectation text
   appears in any payload or in the prompt.
2. **Identifiers match the approved manifests exactly** — every payload record's
   source, recordId and message IDs are checked against
   `synthetic-set-02.json`, so a citation of anything else is the model's own
   invention and must fail validation.
3. **Evidence is shown, not asserted.** Where a case turns on something having
   run, the payload carries the tool placeholders and output a real record would
   carry, in the same form the collector produces.
4. **Nothing is added beyond the case description**, so the fixed expectations
   stay correct.

## Known limitation

Each approved manifest allows exactly one message per record, so a payload record
cannot show a two-sided exchange. Two case descriptions mention the other side:
case 04's model confirmation of Josh's explanation, and case 06's CI output. The
confirmation is therefore absent, and the CI output is included as text pasted
inside Josh's own message, which is how it would realistically appear.

If Josh prefers these cases to carry a real exchange, the approved manifests need
extra message IDs, which changes the fixture and is his decision.
