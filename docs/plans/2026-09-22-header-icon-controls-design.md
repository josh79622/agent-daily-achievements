# Header icon controls — approved design and test cases

Status: approved by Josh on 2026-09-22. This document defines the compact header
change only; it does not alter date-navigation behaviour.

## What cannot be seen now → what will be visible when done

Now: translated text in the header utility controls changes their widths and can make
the header grow vertically or lose its alignment.

Done: the five non-date utility actions use equal-size, icon-only controls. Their
meaning is available through localized tooltips and accessible names, so changing the
language does not change their layout footprint.

## Design

- Keep the date navigator's **previous day → date input → next day** controls and
  their existing actions. Previous and next remain meaningful arrow icons.
- Make **Today**, **Local Activity**, **Settings**, **Language**, and **Theme**
  icon-only buttons. No visible text remains inside those five buttons.
- Give all five utility controls the same fixed square hit area. Select icons whose
  meaning is recognizable: today/calendar, folder, gear, globe, and sun/moon.
- Each icon-only button has a localized accessible name. A localized tooltip appears
  on both pointer hover and keyboard focus; it is additional help, never the only way
  to discover the action. The language tooltip includes the currently selected
  language (for example, `Language: 繁體中文`).
- On ordinary desktop widths, keep the header in one non-wrapping row. Fixed utility
  control widths ensure longer translations cannot cause vertical expansion.
- At a narrow viewport threshold, use an intentional responsive layout: place the
  date navigator and utility group on separate rows (or an equivalently explicit
  compact layout), preserving all controls, their hit areas, and their actions. Do
  not allow accidental per-button wrapping, clipping, overlap, or horizontal page
  overflow.
- Preserve disabled, focus-visible, pressed/menu-open, theme, and RTL behaviour. The
  tooltip must be positioned with logical layout properties so it remains usable in
  right-to-left languages.

## Given / When / Then acceptance cases

| ID | Given | When | Then |
| --- | --- | --- | --- |
| HIC-1 | The header is shown in English, Traditional Chinese, Japanese, or another installed language. | The language is changed. | Today, Local Activity, Settings, Language, and Theme remain icon-only and each keeps the same square rendered dimensions in every language. |
| HIC-2 | A desktop-width viewport. | The header renders in a language with long labels. | It stays on one deliberate non-wrapping row; no header control becomes taller, wraps internally, overlaps another control, or is clipped. |
| HIC-3 | The selected date is not today. | The user activates previous day, next day, or the Today icon. | Previous selects the earlier date, next selects the later date, and Today selects the current local date; the date input remains available. |
| HIC-4 | An icon-only control is rendered. | A mouse pointer hovers it. | A localized tooltip states its action; the language control's tooltip also states the current language. |
| HIC-5 | An icon-only control is rendered. | The user reaches it with the keyboard. | Its localized accessible name is announced and the same tooltip is visible on focus, without requiring pointer hover. |
| HIC-6 | The control's action is unavailable or its panel/menu is open. | Its state changes. | The existing disabled and expanded/pressed semantics remain exposed; icon-only presentation does not make an unavailable action appear enabled. |
| HIC-7 | A narrow viewport below the responsive threshold. | The header renders or the viewport is resized. | The layout changes deliberately into its compact arrangement; every date and utility action remains reachable with its full hit area, and there is no accidental wrapping, overlap, clipping, or page-level horizontal overflow. |
| HIC-8 | The page uses an RTL language. | The header and a focused tooltip render. | Logical ordering, arrow direction, focus handling, and tooltip placement follow the existing RTL rules while all five utilities remain icon-only. |

## Verification

- Add component tests for localized accessible names, tooltip-on-hover and
  tooltip-on-focus behaviour, language-tooltip content, date action preservation,
  and utility control dimensions/classes.
- Add layout-level coverage for a desktop width and the selected narrow breakpoint,
  including an RTL language.
- Manually inspect English, Traditional Chinese, Japanese, and one RTL language in
  both themes, using mouse and keyboard navigation.
