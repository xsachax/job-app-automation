import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface MockElement {
  tagName?: string;
  parentElement?: MockElement | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  closest(selector: string): MockElement | null;
  matches?(selector: string): boolean;
  querySelector(selector: string): MockElement | null;
  querySelectorAll?(selector: string): MockElement[];
}

interface AtsAdapter {
  candidateSelector: string;
  optionSelector: string;
  detectPlatform(
    url: string,
    documentLike?: { querySelector(selector: string): unknown },
  ): { key: string; label: string };
  metadataSignals(element: {
    getAttribute(name: string): string | null;
  }): { text: string; weight: number; source: string }[];
  hasRequiredMetadata(element: MockElement): boolean;
}

const require = createRequire(import.meta.url);
require("../apps/chrome-extension/lib/workday-adapter.js");
const adapter = require(
  "../apps/chrome-extension/lib/ats-adapter.js",
) as AtsAdapter;

function mockElement(
  attributes: Record<string, string> = {},
  tagName = "INPUT",
  children: MockElement[] = [],
): MockElement {
  return {
    tagName,
    parentElement: null,
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    hasAttribute(name) {
      return name in attributes;
    },
    closest() {
      return null;
    },
    matches() {
      return false;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return children;
    },
  };
}

describe("Chrome extension ATS adapter", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/1", "greenhouse"],
    ["https://jobs.lever.co/acme/1", "lever"],
    ["https://jobs.ashbyhq.com/acme/1", "ashby"],
    ["https://acme.wd5.myworkdayjobs.com/jobs/1", "workday"],
    ["https://jobs.smartrecruiters.com/acme/1", "smartrecruiters"],
    ["https://careers-acme.icims.com/jobs/1", "icims"],
    ["https://acme.taleo.net/careersection/1", "oracle"],
    ["https://career5.successfactors.com/jobs/1", "successfactors"],
  ])("detects %s as %s", (url, expected) => {
    expect(adapter.detectPlatform(url).key).toBe(expected);
  });

  it("requires multiple independent markers for white-labeled Workday pages", () => {
    expect(
      adapter.detectPlatform("https://careers.example.com/apply", {
        querySelector(selector) {
          return selector === "[data-automation-id]" ? {} : null;
        },
      }).key,
    ).toBe("generic");
    expect(
      adapter.detectPlatform("https://careers.example.com/apply", {
        querySelector(selector) {
          return [
            "[data-automation-id='applicationPage']",
            "[data-automation-id='progressBar']",
          ].includes(selector)
            ? {}
            : null;
        },
      }).key,
    ).toBe("workday");
  });

  it("extracts high-value semantic metadata", () => {
    const attributes: Record<string, string> = {
      "data-automation-id": "legalNameSection_firstName",
      "data-testid": "candidate-email",
      type: "email",
    };
    const signals = adapter.metadataSignals({
      getAttribute(name) {
        return attributes[name] ?? null;
      },
    });

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "legalNameSection_firstName",
          source: "platform",
        }),
        expect.objectContaining({
          text: "candidate-email",
          source: "platform",
        }),
        expect.objectContaining({ text: "email", source: "metadata" }),
      ]),
    );
    expect(adapter.candidateSelector).toContain("[role='combobox']");
    expect(adapter.optionSelector).toContain("[role='option']");
  });

  it("recognizes explicit ATS required-field metadata", () => {
    const requiredAttributes: Record<string, string> = {
      "data-mandatory": "true",
    };
    expect(
      adapter.hasRequiredMetadata({
        getAttribute(name) {
          return requiredAttributes[name] ?? null;
        },
        hasAttribute(name) {
          return name in requiredAttributes;
        },
        closest() {
          return null;
        },
        querySelector() {
          return null;
        },
      }),
    ).toBe(true);

    const ariaRequiredAttributes: Record<string, string> = {
      "aria-required": "true",
    };
    expect(
      adapter.hasRequiredMetadata({
        getAttribute(name) {
          return ariaRequiredAttributes[name] ?? null;
        },
        hasAttribute(name) {
          return name in ariaRequiredAttributes;
        },
        closest() {
          return null;
        },
        querySelector() {
          return null;
        },
      }),
    ).toBe(true);

    const optionalAttributes: Record<string, string> = {
      "data-required": "false",
    };
    expect(
      adapter.hasRequiredMetadata({
        getAttribute(name) {
          return optionalAttributes[name] ?? null;
        },
        hasAttribute(name) {
          return name in optionalAttributes;
        },
        closest() {
          return null;
        },
        querySelector() {
          return null;
        },
      }),
    ).toBe(false);
  });

  it("scopes ancestor required metadata and honors explicit optional metadata", () => {
    const requiredControl = mockElement();
    const requiredWrapper = mockElement(
      { "data-required": "true" },
      "DIV",
      [requiredControl],
    );
    requiredControl.parentElement = requiredWrapper;
    expect(adapter.hasRequiredMetadata(requiredControl)).toBe(true);

    const scopedControl = mockElement();
    const optionalSibling = mockElement();
    const sharedWrapper = mockElement(
      { "data-required": "true" },
      "DIV",
      [scopedControl, optionalSibling],
    );
    scopedControl.parentElement = sharedWrapper;
    optionalSibling.parentElement = sharedWrapper;
    expect(adapter.hasRequiredMetadata(scopedControl)).toBe(false);

    const explicitlyOptionalControl = mockElement();
    const conflictingWrapper = mockElement(
      { "aria-required": "false", class: "required" },
      "DIV",
      [explicitlyOptionalControl],
    );
    explicitlyOptionalControl.parentElement = conflictingWrapper;
    expect(adapter.hasRequiredMetadata(explicitlyOptionalControl)).toBe(false);
  });
});
