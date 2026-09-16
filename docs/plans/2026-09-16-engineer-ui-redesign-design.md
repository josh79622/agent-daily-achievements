# Engineer UI Redesign

## Goal

Restyle the Stage 2 Daily Proof demo for its expected early audience: software engineers. The interface should feel related to Josh Tsai's portfolio without becoming a personal portfolio page or a terminal imitation.

## Approved direction

Use a **Portfolio × Developer Console** visual language:

- near-black surfaces with restrained teal accents;
- clean sans-serif typography for reading and monospace for metadata;
- generous spacing, thin borders, subtle glow and grid details;
- compact, information-rich status and source presentation;
- no cream palette, serif display type, paper illustration, or rotated note card.

## Page structure

The top bar identifies Daily Proof as a local developer tool and keeps the localhost status visible. A compact hero introduces the current daily report and provides the primary generation action. A concise preview notice states that the demo uses fictional data.

Source coverage becomes an integration-status row for Claude Code, Codex, and the optional web add-on. Before generation, a console-like empty state explains what the action will produce. After generation, the report appears as a structured developer dashboard with clear section numbers, source identifiers, status, and evidence trail.

## Interaction and data flow

The existing behavior remains unchanged:

1. The page loads the most recently persisted report when available.
2. Generate requests a fictional report from the localhost API.
3. The API saves and reads the report back before returning it.
4. The page renders the returned report and scrolls it into view.
5. Errors remain visible and actionable.

## Responsive behavior

Desktop uses a wide, data-dense layout. At narrow widths, the hero, integrations, and report sections collapse into one column without hiding source IDs or report status. Controls remain easy to tap and body text remains readable.

## Verification

Automated checks will confirm the engineer-facing copy and structural hooks in the built page. The complete project gate must pass. The rendered interface will be inspected at desktop and approximately 390-pixel widths, including generation and report rendering.

## Implementation status

Implemented on `codex/ui-skeleton`. The complete quality gate passed with all ten tests. The initial and generated report states were inspected at 1440 × 900 and 390 × 844; the navigation, preview disclosure, source status, report sections, source IDs, and evidence trail remained readable. The generation control successfully completed the persisted report flow in the browser.
