import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

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
  hasRequiredMetadata(element: {
    getAttribute(name: string): string | null;
    hasAttribute(name: string): boolean;
    closest(selector: string): unknown;
    querySelector(selector: string): unknown;
  }): boolean;
}

const require = createRequire(import.meta.url);
require("../apps/chrome-extension/lib/workday-adapter.js");
const adapter = require(
  "../apps/chrome-extension/lib/ats-adapter.js",
) as AtsAdapter;

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
});
