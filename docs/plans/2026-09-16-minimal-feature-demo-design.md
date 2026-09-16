# Minimal Feature Demo Design

## Goal

Make the Stage 2 demo reveal only the product's actual daily-report workflow, so future features can be added deliberately rather than justified by decorative UI.

## Single-screen workflow

The page contains one compact workspace:

1. Choose the target date.
2. Generate a daily report.
3. Read the report's progress, decisions, and learning sections.
4. Inspect the source identifiers attached to each item when needed.

The demo keeps one quiet disclosure that all records are fictional and local. It must not include a hero, greeting, metrics, integrations dashboard, source overview, status dashboard, or visual elements that do not represent a product feature.

## Behavior

The existing local API, generated sample report, persistence, source links, error state, and responsive behavior remain unchanged. The date control is presentational in this Stage 2 slice: sample generation continues to use the approved sample day until real ingestion is implemented.

## Verification

The built-page test checks the date control, generation control, report view, fictional-data disclosure, and absence of prior dashboard language. The complete quality gate passes, and desktop plus narrow browser layouts are inspected with a generated report.
