# Achievement Constellation Demo Design

## Goal

Replace the reading-oriented report demo with a quiet, exploratory view of the day's most important achievements.

## Landing view

The page shows a small date in the upper-left corner and no generate control. Three fictional achievements float in the center of a dark canvas with generous space around them. The app deliberately caps this primary view at three achievements; future AI selection will choose the three most important when more qualify.

## Interaction

Each achievement has a restrained pointer-follow effect. Hovering or focusing a node reveals two small controls: `Expand` and `Related`.

- `Expand` toggles a larger, readable version of the node with its description.
- `Related` toggles a local mind map: connecting lines and fictional event nodes associated with that achievement.
- Event nodes use the same two controls, allowing their own description or related event group to be explored.

Only one achievement may be expanded at a time. A mind map may remain visible while a node is expanded. The demo uses fixed fictional graph data; it does not imply that scheduled generation or real conversation ingestion exists yet.

## Accessibility and responsiveness

The interactions work with mouse, keyboard focus, and buttons. On narrow screens the same constellation becomes a vertical, non-overlapping composition while retaining all controls and relationships.

## Verification

The built output will assert the date, three achievement nodes, and both node actions. Browser inspection will exercise expanding an achievement and revealing related events at desktop and narrow widths.

## Implementation status

Implemented on `codex/ui-skeleton`. The full quality gate passed with ten tests. Desktop inspection verified achievement expansion, related-event lines, and a nested event relationship. At 390 pixels, the same constellation was inspected before and after related events appeared; the narrow layout uses vertically separated nodes and scrolls to deeper event groups without overlap.
