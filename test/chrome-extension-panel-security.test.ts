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

  it("does not expose an autofill trigger inside page-owned DOM", () => {
    expect(panelSource).not.toContain("data-fill");
    expect(panelSource).not.toContain("data-off");
    expect(panelSource).not.toContain("data-profile");
    expect(panelSource).toContain(
      "Open the extension from Chrome's toolbar and choose Autofill current page.",
    );
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
