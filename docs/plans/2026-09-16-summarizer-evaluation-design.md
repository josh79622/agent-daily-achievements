# Summarizer evaluation design

## Purpose

Compare Claude and an OpenAI model on the same English daily-report task before selecting a summarizer. The first test uses only fictional records. Real histories must not be sent to either provider until Josh approves the recipient and data boundary.

## Staged approach

1. Use a synthetic day with known expected and forbidden claims. This checks the product rules without exposing private records.
2. Later, after source collection and provider approval, repeat the comparison on an explicitly approved real day. Josh judges the expected results from the source records. Do not treat the synthetic test alone as a model-quality verdict.

## Synthetic day

The sample contains five source classes with stable source IDs: Codex evidence that a bug fix passed a test; Claude Code discussion of the same fix; ChatGPT evidence of Josh explaining a concept in his own words; Claude web evidence of a reasoned decision and a separate uncompleted email plan; and a Gemini collection failure.

The correct English report has three achievement items: the bug fix (counted once, with both relevant sources), the demonstrated learning, and the decision. It must not claim the planned email was sent. It must explicitly mark Gemini data incomplete rather than no activity. Every item names its supporting source IDs. No unsupported praise or invented completion is permitted.

## Comparison

Use the same source text and instructions for each model. Score required items, false completion claims, duplicate counting, source IDs, and failure disclosure before considering prose quality. Preserve the exact model and CLI route used, raw outputs, and a short review of the differences. CLI results are a route test as well as a model test; agent wrappers may influence output.

## Limits

One fictional day does not test long-volume behavior, actual log parsing, Chrome collection, privacy terms, or unattended scheduling. Those require later source-specific and real-day checks.
