# Whitespace-First Demo Design

## Goal

Make the Stage 2 landing state feel calm and almost empty: it should show only the action needed to create a fictional daily report.

## Layout

The header contains only the product name. The main area has generous top spacing and one compact action group: the fixed sample date and the generate button. A single muted disclosure reads `Fictional sample · local only`.

There is no headline, explanatory paragraph, dashboard label, local-preview badge, footer copy, or empty-state prose. Before generation, the rest of the page is intentionally blank. Once a report is available, its existing evidence-backed content remains visible below the action group.

## Behavior

The local API, persisted report loading, error handling, source links, disabled sample date, and responsive behavior remain unchanged. The empty-state element stays in the DOM for application behavior but has no visible copy.

## Verification

The built-page test will require the compact disclosure and the retained report controls while excluding the removed explanatory language. The full quality gate and desktop/narrow browser inspection will verify the result.

## Implementation status

Implemented on `codex/ui-skeleton`. The full quality gate passed with ten tests. The local demo was inspected with its persisted report at desktop and 390-pixel widths, and the generate action still rendered the report successfully.
