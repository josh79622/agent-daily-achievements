import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md), test
// cases L3-11 to L3-14: the stylesheet moved from physical left/right
// properties to logical (inline-start/inline-end) ones, except the
// Constellation view's canvas coordinates, which stay physical on purpose.
// Asserted straight against web/styles.css on disk, the way
// test/web/build-output.test.ts asserts against the built bundle.
const css = readFileSync(
  new URL("../../web/styles.css", import.meta.url),
  "utf8",
);

describe("web/styles.css logical properties (L3-11 to L3-14)", () => {
  test("L3-11: no margin-left/right, padding-left/right, border-left/right or text-align: left|right declaration remains", () => {
    const physicalDeclaration =
      /(?:^|[\s;{])(margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/m;
    expect(css).not.toMatch(physicalDeclaration);

    const physicalTextAlign = /text-align:\s*(left|right)\s*;/;
    expect(css).not.toMatch(physicalTextAlign);
  });

  test("L3-12: the positioned header, menu and badge rules use inset-inline-* rather than left/right", () => {
    for (const selector of [
      ".skip-link",
      ".page-header",
      ".palette-menu",
      ".collector-panel",
      ".language-menu",
    ]) {
      const block = blockFor(css, selector);
      expect(block, `${selector} rule not found`).toBeTruthy();
      expect(block).toMatch(/inset-inline-(start|end)\s*:/);
      expect(block).not.toMatch(/(?:^|[\s;{])(left|right)\s*:/m);
    }
  });

  test("L3-13: the Constellation view's coordinate positioning (left: var(--x), left: 50%) is deliberately still physical", () => {
    expect(css).toMatch(/left:\s*var\(--x\)\s*;/);
    expect(css).toMatch(/left:\s*50%\s*;/);
    // Recorded as a deliberate exemption (not an oversight) so a later
    // logical-properties sweep does not "fix" it.
    expect(css).toMatch(/canvas coordinate, not a reading edge/);
  });

  test("L3-14: every achievement card accent bar (the five state colours) uses border-inline-start", () => {
    for (const selector of [
      ".status-box-available",
      ".status-box-incomplete",
      ".status-box-no-activity",
      ".status-box-not-installed",
      ".status-box-not-authorized",
    ]) {
      const block = blockFor(css, selector);
      expect(block, `${selector} rule not found`).toBeTruthy();
      expect(block).toMatch(/border-inline-start\s*:\s*3px solid/);
    }
  });
});

/** The `{ ... }` body of the first rule whose selector list contains `selector`. */
function blockFor(source: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.[\]]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[,{ \\n][^{}]*\\{([^}]*)\\}`);
  const match = source.match(pattern);
  return match?.[1];
}
