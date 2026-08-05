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

  it("allows failed controls to be retried on the next explicit fill", () => {
    expect(panelSource).toMatch(
      /state\.fillIssues\.clear\(\);\s*const questions = collectQuestions\(\)/,
    );
  });

  it("revalidates the same live session after loading the profile", () => {
    expect(panelSource).toMatch(
      /const sessionGeneration = state\.sessionGeneration;[\s\S]*await sendMessage[\s\S]*state\.sessionGeneration !== sessionGeneration/,
    );
    expect(panelSource).toContain("state.sessionGeneration += 1;");
  });

  it("adds nearby section headings to field matching signals", () => {
    expect(panelSource).toContain("function sectionPrompt(element)");
    expect(panelSource).toContain(
      'add(sectionPrompt(first), 0.55, "section");',
    );
  });
});
