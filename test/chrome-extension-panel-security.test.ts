import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  new URL("../apps/chrome-extension/content/application-panel.js", import.meta.url),
  "utf8",
);

describe("Chrome extension panel security", () => {
  it("keeps panel controls out of page-script reach", () => {
    expect(panelSource).toContain('attachShadow({ mode: "closed" })');
  });

  it("keeps the panel autofill trigger inside the closed shadow root", () => {
    expect(panelSource).toContain('data-autofill type="button"');
    expect(panelSource).toContain(
      '.querySelector("[data-autofill]")',
    );
    expect(panelSource).toContain("await fillKnownFields();");
    expect(panelSource).not.toContain("data-off");
    expect(panelSource).not.toContain("data-profile");
  });

  it("retries unanswered failures without dropping their diagnostics", () => {
    const fillSource = panelSource.slice(
      panelSource.indexOf("async function fillKnownFields"),
      panelSource.indexOf("async function handlePanelAutofill"),
    );
    expect(fillSource).not.toContain("state.fillIssues.clear();");
    expect(panelSource).toMatch(
      /function shouldAttemptQuestion[\s\S]*question\.status === "failed"[\s\S]*!question\.answered[\s\S]*state\.fillIssues\.has\(question\.key\)/,
    );
    expect(fillSource).toContain("!shouldAttemptQuestion(question)");
  });

  it("revalidates the same live session after loading the profile", () => {
    expect(panelSource).toMatch(
      /function assertAutofillSession[\s\S]*state\.sessionGeneration !== sessionGeneration/,
    );
    expect(panelSource).toMatch(/await sendMessage[\s\S]*assertActive\(\)/);
    expect(panelSource).toMatch(
      /waitForComboboxOptions[\s\S]*await wait\(75\);\s*assertActive\(\)/,
    );
    expect(panelSource).toContain("state.sessionGeneration += 1;");
  });

  it("adds nearby section headings to field matching signals", () => {
    expect(panelSource).toContain("function sectionPrompt(element)");
    expect(panelSource).toContain(
      'add(sectionPrompt(first), 0.55, "section");',
    );
  });

  it("keeps uncertain matches out of autofill and marks them for review", () => {
    expect(panelSource).toContain('analysis.status === "uncertain"');
    expect(panelSource).toContain('"data-job-autofill-review"');
    expect(panelSource).toMatch(
      /for \(const question of questions\)[\s\S]*!shouldAttemptQuestion\(question\)[\s\S]*continue/,
    );
  });
});
