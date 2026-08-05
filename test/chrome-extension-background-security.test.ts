import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  new URL("../apps/chrome-extension/background.js", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(
    new URL("../apps/chrome-extension/manifest.json", import.meta.url),
    "utf8",
  ),
) as {
  externally_connectable?: { matches?: string[] };
  options_page?: string;
};

describe("Chrome extension background security", () => {
  it("revalidates enablement and the live tab before autofill", () => {
    expect(backgroundSource).toContain("activateSessionForInjection(");
    expect(backgroundSource).toMatch(
      /enablementVersion !== expectedEnablementVersion[\s\S]*JOB_AUTOFILL_FILL/,
    );
    expect(backgroundSource).toMatch(
      /chrome\.tabs\.get\(tabId\)[\s\S]*sessionScope\.isAllowedUrl\(currentSession, currentTab\.url\)/,
    );
  });

  it("terminates tracked sessions after any disallowed completed navigation", () => {
    expect(backgroundSource).toMatch(
      /transitionSessionForNavigation[\s\S]*!isHttpUrl\(url\) \|\|[\s\S]*status: "left-application"/,
    );
  });

  it("does not let stale navigation callbacks revive terminal sessions", () => {
    expect(backgroundSource).toMatch(
      /async function transitionSessionForNavigation[\s\S]*current\.tabId !== tabId[\s\S]*"paused", "dismissed", "closed", "left-application"[\s\S]*status: "loading"/,
    );
    expect(backgroundSource).toMatch(
      /const transition = await transitionSessionForNavigation[\s\S]*await injectPanel\(transition\.session\)/,
    );
  });

  it("guards disable and dismiss transitions against stale session state", () => {
    expect(backgroundSource).toMatch(
      /async function dismissSession[\s\S]*current\.tabId !== tabId[\s\S]*"paused", "dismissed", "closed", "left-application"/,
    );
    expect(backgroundSource).toMatch(
      /async function applyEnabledState[\s\S]*enablementVersion !== expectedEnablementVersion[\s\S]*\["dismissed", "closed", "left-application"\]\.includes\(session\.status\)/,
    );
  });

  it("uses Chrome's manifest allowlist without a second configured origin", () => {
    expect(manifest.externally_connectable?.matches).toEqual([
      "http://localhost/*",
      "https://localhost/*",
      "http://127.0.0.1/*",
      "https://127.0.0.1/*",
    ]);
    expect(backgroundSource).not.toContain("dashboardOrigin");
    expect(backgroundSource).not.toContain("isAllowedDashboardSender");
    expect(manifest.options_page).toBeUndefined();
  });
});
