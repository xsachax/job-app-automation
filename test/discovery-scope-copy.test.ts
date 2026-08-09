import { describe, expect, it } from "vitest";
import { DEFAULT_DISCOVERY_CONFIG } from "../lib/discovery/config";
import { formatDiscoveryScope } from "../lib/discovery/scope-copy";
import { DEFAULT_CRITERIA, DEFAULT_PROFILE } from "../lib/settings";

describe("discovery scope copy", () => {
  it("describes the default scope from persisted settings", () => {
    const copy = formatDiscoveryScope({
      config: DEFAULT_DISCOVERY_CONFIG,
      criteria: DEFAULT_CRITERIA,
      profile: DEFAULT_PROFILE,
    });

    expect(copy.summary).toBe(
      "Open roles matching Software Engineer in United States and Canada. Required experience is capped at 2 years. Roles that require an advanced degree are excluded. Internships and co-ops are excluded.",
    );
  });

  it("combines customized target roles, criteria, queries, and role keywords", () => {
    const copy = formatDiscoveryScope({
      config: {
        ...DEFAULT_DISCOVERY_CONFIG,
        countries: ["GB"],
        maxYoE: 1,
        excludeAdvancedDegree: false,
        includeInternships: true,
        queryTerms: ["data scientist"],
        roleKeywords: ["security"],
      },
      criteria: { titles: ["Account Executive", "data scientist"] },
      profile: { targetRoles: ["Product Manager", "account executive"] },
    });

    expect(copy.roleTerms).toEqual([
      "Product Manager",
      "account executive",
      "data scientist",
      "security",
    ]);
    expect(copy.summary).toBe(
      "Open roles matching Product Manager, account executive, data scientist, and security in United Kingdom. Required experience is capped at 1 year. Advanced-degree requirements are allowed. Internships and co-ops are included.",
    );
  });

  it("uses generic wording for empty criteria and hides sentinels", () => {
    const copy = formatDiscoveryScope({
      config: {
        ...DEFAULT_DISCOVERY_CONFIG,
        countries: ["OTHER", "unknown"],
        maxYoE: 0,
        queryTerms: ["any"],
        roleKeywords: [],
      },
      criteria: { titles: [] },
      profile: { targetRoles: [] },
    });

    expect(copy.summary).toBe(
      "Open roles matching your saved role preferences across your configured locations. No prior experience may be required. Roles that require an advanced degree are excluded. Internships and co-ops are excluded.",
    );
    expect(copy.summary).not.toMatch(/OTHER|UNKNOWN|ANY/);
  });
});
