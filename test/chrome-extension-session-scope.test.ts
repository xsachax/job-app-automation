import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface SessionScope {
  originOf(value: string): string;
  approvedOriginsFor(value: string): string[];
  applicationOrigin(session: {
    applicationOrigin?: string;
    applicationOrigins?: string[];
    url?: string;
  }): string;
  isAllowedUrl(
    session: {
      applicationOrigin?: string;
      applicationOrigins?: string[];
      url?: string;
    },
    nextUrl: string,
  ): boolean;
}

const require = createRequire(import.meta.url);
const sessionScope = require(
  "../apps/chrome-extension/lib/session-scope.js",
) as SessionScope;

describe("Chrome extension application session scope", () => {
  const session = {
    applicationOrigin: "https://jobs.example.com",
    url: "https://jobs.example.com/apply/123",
  };

  it("allows path changes on the original HTTP origin", () => {
    expect(
      sessionScope.isAllowedUrl(session, "https://jobs.example.com/apply/123/step/2"),
    ).toBe(true);
  });

  it("rejects cross-origin and non-HTTP navigations", () => {
    expect(
      sessionScope.isAllowedUrl(session, "https://accounts.example.com/login"),
    ).toBe(false);
    expect(sessionScope.isAllowedUrl(session, "https://example.org/")).toBe(false);
    expect(sessionScope.isAllowedUrl(session, "chrome://extensions")).toBe(false);
  });

  it("allows the explicit Greenhouse host redirect without widening the scope", () => {
    const greenhouseSession = {
      applicationOrigins: sessionScope.approvedOriginsFor(
        "https://boards.greenhouse.io/acme/jobs/1",
      ),
    };
    expect(greenhouseSession.applicationOrigins).toEqual([
      "https://boards.greenhouse.io",
      "https://job-boards.greenhouse.io",
    ]);
    expect(
      sessionScope.isAllowedUrl(
        greenhouseSession,
        "https://job-boards.greenhouse.io/acme/jobs/1",
      ),
    ).toBe(true);
    expect(
      sessionScope.isAllowedUrl(
        greenhouseSession,
        "https://accounts.greenhouse.io/login",
      ),
    ).toBe(false);
  });

  it("rejects legacy sessions that were not bound to their original origin", () => {
    const legacySession = {
      url: "https://boards.greenhouse.io/acme/jobs/1",
    };
    expect(sessionScope.applicationOrigin(legacySession)).toBe("");
    expect(
      sessionScope.isAllowedUrl(
        legacySession,
        "https://boards.greenhouse.io/acme/jobs/1",
      ),
    ).toBe(false);
  });
});
