import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("builds the achievement constellation", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  expect(build.status, build.stderr).toBe(0);
  const html = await readFile("dist/web/index.html", "utf8");
  const app = await readFile("dist/web/app.js", "utf8");
  const reportView = await readFile("dist/web/report-view.js", "utf8");
  const css = await readFile("dist/web/styles.css", "utf8");
  expect(html).toMatch(/id="constellation"/);
  expect(html).toMatch(/id="constellation-status"/);
  expect(html).toMatch(/id="report-date"/);
  expect(html).toMatch(/id="collector-toggle"/);
  expect(html).toMatch(/id="collector-panel"/);
  expect(html).toMatch(/id="source-consent-form"/);
  expect(html).toMatch(/id="source-claude-code"/);
  expect(html).toMatch(/id="source-codex"/);
  expect(html).not.toMatch(/checked/);
  expect(html).toMatch(/No conversation text leaves this machine/);
  expect(html).toMatch(/separate consent/);
  expect(app).toMatch(/api\/collector\/consent/);
  expect(app).toMatch(/function replaceCollection/);
  // The constellation is now built from a real fetched report, not a
  // hardcoded sample: no fictional achievement titles, and the mapping
  // function (which is where the "achievement" kind literal lives) is
  // imported from the separate, unit-tested report-view module.
  expect(app).toMatch(/\/api\/reports\/latest/);
  expect(app).not.toMatch(/Made the report generator reliable/);
  expect(reportView).toMatch(/kind: "achievement"/);
  expect(app).toMatch(/Expand/);
  expect(app).toMatch(/Related/);
  expect(app).toMatch(/Preview locally/);
  expect(html).not.toMatch(/Generate sample report/);
  expect(css).toMatch(/\.constellation-node/);
  // Source trace-back: reuses the same local, consent-gated collector route
  // as the "Local activity" panel's own preview, with an explicit date so a
  // past day is traced back as it was that day, not as of today.
  expect(app).toMatch(/Show source/);
  expect(app).toMatch(/api\/collector\/sessions\//);
  expect(app).toMatch(/&date=/);
  expect(app).toMatch(/isLocallyTraceable/);
  expect(css).toMatch(/\.evidence/);
});

test("builds the report sign-in panel without credential or command surfaces", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  expect(build.status, build.stderr).toBe(0);
  const html = await readFile("dist/web/index.html", "utf8");
  const app = await readFile("dist/web/app.js", "utf8");
  const panel =
    html.match(/<aside[^>]*id="signin-panel"[\s\S]*?<\/aside>/)?.[0] ?? "";

  expect(html).toMatch(/id="signin-toggle"/);
  expect(panel).toMatch(/Report sign-in/);
  expect(panel).toMatch(/Codex/);
  expect(panel).toMatch(/Claude Code/);
  for (const provider of ["codex", "claude-code"]) {
    expect(panel).toMatch(
      new RegExp(`id="signin-status-${provider}"[^>]*role="status"`),
    );
    expect(panel).toMatch(
      new RegExp(`<button[^>]*id="signin-button-${provider}"`),
    );
    expect(panel).toMatch(
      new RegExp(`<a[^>]*id="signin-install-${provider}"[^>]*href="https://`),
    );
  }
  expect(panel).toMatch(/id="signin-refresh"/);
  expect(panel).not.toMatch(/<input|<textarea|password/i);
  expect(panel).not.toMatch(/api[ -]?key|token/i);
  expect(panel).not.toMatch(/codex login|auth login|osascript/i);
  expect(panel).not.toMatch(/conversation preview/i);
  expect(app).toMatch(/api\/summarizer\/providers/);
  expect(app).toMatch(/\/login`/);
  expect(app).toMatch(/Not ready: /);
});

test("PR-17: each provider has a Check readiness control wired only to the readiness endpoint", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  expect(build.status, build.stderr).toBe(0);
  const html = await readFile("dist/web/index.html", "utf8");
  const app = await readFile("dist/web/app.js", "utf8");
  const panel =
    html.match(/<aside[^>]*id="signin-panel"[\s\S]*?<\/aside>/)?.[0] ?? "";

  for (const provider of ["codex", "claude-code"]) {
    expect(panel).toMatch(
      new RegExp(
        `<button[^>]*id="signin-readiness-${provider}"[^>]*disabled[^>]*>\\s*Check readiness`,
      ),
    );
  }
  expect(app).toMatch(/\/readiness`/);
  expect(app).toMatch(/signedIn/);
  expect(app).toMatch(/Ready \(checked /);
  expect(app).toMatch(/Checking readiness/);
  for (const label of [
    "could not start",
    "timed out",
    "exited with error",
    "empty reply",
    "unreadable reply",
    "reply too large",
    "lowest-cost model",
    "summary model",
  ]) {
    expect(app).toContain(label);
  }
  expect(panel).not.toMatch(/<input|<textarea|password|api[ -]?key|token/i);
});

test("SP-1: each provider has a summary model dropdown with no free-text entry, saved only through the model endpoint", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  expect(build.status, build.stderr).toBe(0);
  const html = await readFile("dist/web/index.html", "utf8");
  const app = await readFile("dist/web/app.js", "utf8");
  const panel =
    html.match(/<aside[^>]*id="signin-panel"[\s\S]*?<\/aside>/)?.[0] ?? "";

  for (const provider of ["codex", "claude-code"]) {
    expect(panel).toMatch(
      new RegExp(
        `<label[^>]*for="signin-model-${provider}"[^>]*>\\s*Summary model`,
      ),
    );
    expect(panel).toMatch(
      new RegExp(
        `<select[^>]*id="signin-model-${provider}"[^>]*>\\s*<option value="default">Default</option>`,
      ),
    );
    expect(panel).toMatch(new RegExp(`id="signin-model-note-${provider}"`));
  }
  expect(panel).not.toMatch(/<input|<textarea|contenteditable/i);
  expect(app).toMatch(/\/api\/summarizer\/models/);
  expect(app).toMatch(/method: "PUT"/);
  expect(app).toContain("Saved model is no longer available; using Default.");
  expect(app).toContain("Model list unavailable; using the built-in list.");
  expect(app).toContain("Model settings could not be read; using Default.");
});

test("EU-1: each provider has an effort dropdown saved only through the model endpoint", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  expect(build.status, build.stderr).toBe(0);
  const html = await readFile("dist/web/index.html", "utf8");
  const app = await readFile("dist/web/app.js", "utf8");
  const panel =
    html.match(/<aside[^>]*id="signin-panel"[\s\S]*?<\/aside>/)?.[0] ?? "";

  for (const provider of ["codex", "claude-code"]) {
    expect(panel).toMatch(
      new RegExp(
        `<label[^>]*for="signin-effort-${provider}"[^>]*>\\s*Summary effort`,
      ),
    );
    expect(panel).toMatch(
      new RegExp(
        `<select[^>]*id="signin-effort-${provider}"[^>]*disabled[^>]*>\\s*<option value="default">Default</option>`,
      ),
    );
  }
  expect(panel).not.toMatch(/<input|<textarea|contenteditable/i);
  expect(app).toMatch(/\{ effort: change\.effort \}/);
  expect(app).toContain("effortOptions");
  expect(app).toContain("Saved effort is no longer supported; using Default.");
});

test("PR-19: Ready shows which attempt passed with its check time", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  expect(build.status, build.stderr).toBe(0);
  const app = await readFile("dist/web/app.js", "utf8");
  expect(app).toContain("Ready via ");
  expect(app).toContain("readyVia");
  expect(app).toContain("lowest-cost model");
  expect(app).toContain("summary model");
});
