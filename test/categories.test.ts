import { describe, it, expect } from "vitest";
import {
  categorizeCompany,
  categorizeJob,
  fallbackForSystem,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type JobCategory,
} from "../lib/discovery/categories";
import { API_COMPANIES, BROWSER_COMPANIES } from "../lib/discovery/companies";

describe("categorizeCompany", () => {
  const cases: [string, JobCategory][] = [
    ["Amazon", "bigtech"],
    ["Microsoft", "bigtech"],
    ["Apple", "bigtech"],
    ["Waymo", "bigtech"],
    ["Robinhood", "bigtech"],
    ["OpenAI", "ai"],
    ["Anthropic", "ai"],
    ["Cursor", "ai"],
    ["Scale AI", "ai"],
    ["DeepMind", "ai"],
    ["Jane Street", "quant"],
    ["Hudson River Trading", "quant"],
    ["Qube Research & Technologies", "quant"],
    ["Optiver", "quant"],
    ["Stripe", "startup"],
    ["Ramp", "startup"],
    ["Wealthsimple", "startup"],
    ["Notion", "startup"],
  ];

  it.each(cases)("maps %s -> %s", (name, expected) => {
    expect(categorizeCompany(name)).toBe(expected);
  });

  it("is insensitive to spacing, case and punctuation", () => {
    expect(categorizeCompany("jane street")).toBe("quant");
    expect(categorizeCompany("QUBE RESEARCH & TECHNOLOGIES")).toBe("quant");
    expect(categorizeCompany("Scale  AI")).toBe("ai");
  });

  it("resolves common board / legal-name aliases", () => {
    expect(categorizeCompany("HRT")).toBe("quant");
    expect(categorizeCompany("Citadel")).toBe("quant");
    expect(categorizeCompany("Anysphere")).toBe("ai"); // Cursor
    expect(categorizeCompany("Facebook")).toBe("bigtech");
    expect(categorizeCompany("Amazon Web Services")).toBe("bigtech");
  });

  it("honors the fallback for unknown employers", () => {
    expect(categorizeCompany("Some Unknown Co")).toBe("startup"); // default
    expect(categorizeCompany("Some Unknown Co", "other")).toBe("other");
    expect(categorizeCompany("")).toBe("startup");
  });
});

describe("fallbackForSystem", () => {
  it("routes aggregator-board employers to 'other', everything else to 'startup'", () => {
    expect(fallbackForSystem("githubboard")).toBe("other");
    expect(fallbackForSystem("greenhouse")).toBe("startup");
    expect(fallbackForSystem("ycombinator")).toBe("startup");
    expect(fallbackForSystem(null)).toBe("startup");
  });
});

describe("categorizeJob", () => {
  it("classifies a native posting by name", () => {
    expect(categorizeJob({ company: "Jane Street", discoverySystem: "greenhouse" })).toBe("quant");
  });

  it("falls back to 'other' for an unknown board employer", () => {
    expect(categorizeJob({ company: "Mystery Startup XYZ", discoverySystem: "githubboard" })).toBe("other");
  });

  it("falls back to 'startup' for an unknown native/YC employer", () => {
    expect(categorizeJob({ company: "Mystery Startup XYZ", discoverySystem: "ycombinator" })).toBe("startup");
  });
});

describe("category metadata", () => {
  it("labels every category in the order", () => {
    for (const c of CATEGORY_ORDER) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
    expect(CATEGORY_ORDER).toContain("other");
  });
});

// Drift guard: every company in the live catalog must resolve to a real bucket
// (never "other"), so adding a firm without tagging it fails loudly here.
describe("catalog category drift guard", () => {
  const catalog = [...API_COMPANIES.map((c) => c.name), ...BROWSER_COMPANIES.map((c) => c.name)];

  it.each(catalog)("%s resolves to a concrete category", (name) => {
    const category = categorizeCompany(name, "other");
    expect(category).not.toBe("other");
  });
});
