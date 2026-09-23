import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(
  new URL("../../web/styles.css", import.meta.url),
  "utf8",
);

describe("header icon layout contracts (HIC-1, HIC-2, HIC-7, HIC-8)", () => {
  test("uses one equal square hit area that centers every utility icon", () => {
    const button = blockFor(css, ".header-icon-button");
    expect(button).toMatch(/inline-size\s*:\s*2\.75rem\s*;/);
    expect(button).toMatch(/block-size\s*:\s*2\.75rem\s*;/);
    expect(button).toMatch(/display\s*:\s*inline-flex\s*;/);
    expect(button).toMatch(/align-items\s*:\s*center\s*;/);
    expect(button).toMatch(/justify-content\s*:\s*center\s*;/);
  });

  test("uses deliberate non-wrapping desktop groups and a narrow column layout", () => {
    expect(blockFor(css, ".zen-header")).toMatch(/flex-wrap\s*:\s*nowrap\s*;/);
    expect(blockFor(css, ".header-utilities")).toMatch(
      /flex-wrap\s*:\s*nowrap\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*620px\)[\s\S]*?\.zen-header\s*\{[\s\S]*?flex-direction\s*:\s*column\s*;/,
    );
    expect(css).toMatch(/overflow-x\s*:\s*hidden\s*;/);
  });

  test("positions the tooltip with logical inline and block properties", () => {
    const tooltip = blockFor(css, ".header-icon-tooltip");
    expect(tooltip).toMatch(/inset-inline-start\s*:/);
    expect(tooltip).toMatch(/inset-block-start\s*:/);
    expect(tooltip).not.toMatch(/(?:^|[\s;])(left|right)\s*:/m);
  });
});

function blockFor(source: string, selector: string): string {
  const escaped = selector.replace(/[.[\]]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[,{ \\n][^{}]*\\{([^}]*)\\}`);
  return source.match(pattern)?.[1] ?? "";
}
