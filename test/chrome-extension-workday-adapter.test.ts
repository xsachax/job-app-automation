import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const adapter = require(
  "../apps/chrome-extension/lib/workday-adapter.js",
) as {
  detect(url: string, documentLike?: DocumentLike): boolean;
  isKnownHost(url: string): boolean;
  pageInfo(documentLike: DocumentLike): {
    key: string;
    label: string;
    scanOnly: boolean;
  };
  questionDetails(element: ElementLike): {
    collection: string;
    fieldKey: string;
    index: number;
    datePartFormat?: string;
    signals: { text: string }[];
  };
  augmentDefinitions(
    definitions: { key: string; aliases: string[] }[],
  ): { key: string; aliases: string[] }[];
  resolveValue(
    definitionKey: string,
    profile: Record<string, unknown>,
    details: { collection: string; index: number },
    inputType?: string,
  ): { value: string; safe: boolean; available: boolean } | null;
  allowsSingleCheckbox(
    details: { fieldKey: string },
    definitionKey: string,
    value: string,
  ): boolean;
  prepareRepeatedSections(options: {
    documentLike: DocumentLike;
    profile: Record<string, unknown>;
    assertActive(): void;
    wait(milliseconds: number): Promise<void>;
  }): Promise<number>;
};
const profileSchema = require(
  "../apps/chrome-extension/lib/profile-schema.js",
) as {
  sanitizeStoredProfile(
    value: Record<string, unknown>,
  ): Record<string, unknown>;
  profileAvailability(
    value: Record<string, unknown>,
  ): Record<string, boolean>;
};

interface DocumentLike {
  querySelector(selector: string): unknown;
  querySelectorAll?(selector: string): unknown[];
}

interface ElementLike {
  parentElement: ElementLike | null;
  getAttribute(name: string): string | null;
  closest(selector: string): ElementLike | null;
  querySelectorAll?(selector: string): ElementLike[];
}

function documentWith(selectors: string[]): DocumentLike {
  const present = new Set(selectors);
  return {
    querySelector(selector) {
      return present.has(selector) ? {} : null;
    },
  };
}

function repeatedElement(
  automationId: string,
  collection: string,
  index: number,
): ElementLike {
  const item = {
    parentElement: {
      querySelectorAll() {
        return [item];
      },
    } as unknown as ElementLike,
    getAttribute(name: string) {
      if (name === "data-workday-collection") return collection;
      if (name === "data-workday-index") return String(index);
      return null;
    },
    closest(selector: string) {
      return selector.includes("data-workday") ? item : null;
    },
  } as ElementLike;
  return {
    parentElement: item,
    getAttribute(name: string) {
      return name === "data-automation-id" ? automationId : null;
    },
    closest(selector: string) {
      return selector.includes("data-workday") ? item : null;
    },
  };
}

function numberedRepeatedElement(
  itemPrefix = "workExperience",
  fieldAutomationId = "jobTitle",
): ElementLike {
  let items: ElementLike[] = [];
  const container: ElementLike = {
    parentElement: null,
    getAttribute() {
      return null;
    },
    closest() {
      return null;
    },
    querySelectorAll() {
      return items;
    },
  };
  const makeItem = (automationId: string) =>
    ({
      parentElement: container,
      getAttribute(name: string) {
        return name === "data-automation-id" ? automationId : null;
      },
      closest() {
        return null;
      },
    }) as ElementLike;
  items = [makeItem(`${itemPrefix}-1`), makeItem(`${itemPrefix}-2`)];
  return {
    parentElement: items[1],
    getAttribute(name: string) {
      return name === "data-automation-id" ? fieldAutomationId : null;
    },
    closest() {
      return null;
    },
  };
}

function splitDateRepeatedElement(): ElementLike {
  const item: ElementLike = {
    parentElement: null,
    getAttribute(name: string) {
      return name === "data-automation-id" ? "workExperience-1" : null;
    },
    closest() {
      return null;
    },
  };
  const field: ElementLike = {
    parentElement: item,
    getAttribute(name: string) {
      return name === "data-automation-id" ? "formField-startDate" : null;
    },
    closest() {
      return null;
    },
  };
  return {
    parentElement: field,
    getAttribute(name: string) {
      return name === "data-automation-id"
        ? "dateSectionMonth-input"
        : null;
    },
    closest() {
      return null;
    },
  };
}

describe("Workday adapter", () => {
  it("detects known hosts without hydration and rejects lone white-label markers", () => {
    expect(
      adapter.detect("https://acme.wd5.myworkdayjobs.com/en-US/jobs/1"),
    ).toBe(true);
    expect(
      adapter.detect("https://wd1.myworkdaysite.com/recruiting/acme/jobs/1"),
    ).toBe(true);
    expect(adapter.isKnownHost("https://example.com")).toBe(false);
    expect(
      adapter.detect(
        "https://careers.example.com/apply",
        documentWith(["[data-automation-id='applicationPage']"]),
      ),
    ).toBe(false);
    expect(
      adapter.detect(
        "https://careers.example.com/apply",
        documentWith([
          "[data-automation-id='applicationPage']",
          "[data-automation-id='progressBar']",
        ]),
      ),
    ).toBe(true);
    expect(
      adapter.detect(
        "https://careers.example.com/apply",
        documentWith([
          "[data-automation-id='applyFlowPage']",
          "[data-automation-id='progressBar']",
        ]),
      ),
    ).toBe(true);
  });

  it("classifies fillable and scan-only pages from stable markers", () => {
    expect(
      adapter.pageInfo(
        documentWith(["[data-automation-id='contactInformationPage']"]),
      ),
    ).toMatchObject({ key: "contact", scanOnly: false });
    expect(
      adapter.pageInfo(
        documentWith(["[data-automation-id='selfIdentificationPage']"]),
      ),
    ).toMatchObject({ key: "self-identification", scanOnly: false });
    expect(
      adapter.pageInfo(documentWith(["[data-automation-id='reviewPage']"])),
    ).toMatchObject({ key: "review", scanOnly: true });
    expect(
      adapter.pageInfo(documentWith(["[data-automation-id='createAccount']"])),
    ).toMatchObject({ key: "account", scanOnly: true });
  });

  it("maps stable scalar metadata and indexed repeat fields through definitions", () => {
    const scalar = repeatedElement(
      "legalNameSection_firstName",
      "",
      0,
    );
    expect(adapter.questionDetails(scalar)).toMatchObject({
      fieldKey: "firstName",
      collection: "",
    });

    const repeated = repeatedElement(
      "workExperience-jobTitle",
      "workExperiences",
      1,
    );
    const details = adapter.questionDetails(repeated);
    expect(details).toMatchObject({
      fieldKey: "workExperienceTitle",
      collection: "workExperiences",
      index: 1,
    });
    expect(details.signals[0]?.text).toBe(
      "workday field workExperienceTitle",
    );

    const definitions = adapter.augmentDefinitions([
      { key: "firstName", aliases: ["first name"] },
    ]);
    expect(
      definitions.find((definition) => definition.key === "firstName")?.aliases,
    ).toContain("workday field firstName");
    expect(
      definitions.some(
        (definition) => definition.key === "workExperienceTitle",
      ),
    ).toBe(true);

    expect(adapter.questionDetails(numberedRepeatedElement())).toMatchObject({
      fieldKey: "workExperienceTitle",
      collection: "workExperiences",
      index: 1,
    });
    expect(
      adapter.questionDetails(
        numberedRepeatedElement("websiteSection", "websiteURL"),
      ),
    ).toMatchObject({
      fieldKey: "websiteUrl",
      collection: "additionalWebsites",
      index: 1,
    });

    const splitDate = adapter.questionDetails(splitDateRepeatedElement());
    expect(splitDate).toMatchObject({
      fieldKey: "workExperienceStartMonth",
      collection: "workExperiences",
      index: 0,
      datePartFormat: "numeric-month",
    });
    expect(
      adapter.resolveValue(
        splitDate.fieldKey,
        { workExperiences: [{ startDate: "2023-07" }] },
        splitDate,
      ),
    ).toMatchObject({ value: "07", available: true });
  });

  it("resolves structured values, date parts, and explicit checkbox values", () => {
    const profile = {
      workExperiences: [
        {
          title: "Engineer",
          startDate: "2023-07",
          currentRole: "yes",
        },
      ],
      educationEntries: [
        {
          school: "University of Ottawa",
          graduationDate: "2025-05",
        },
      ],
    };
    expect(
      adapter.resolveValue(
        "workExperienceTitle",
        profile,
        { collection: "workExperiences", index: 0 },
      ),
    ).toMatchObject({ value: "Engineer", safe: true, available: true });
    expect(
      adapter.resolveValue(
        "workExperienceDescription",
        profile,
        { collection: "workExperiences", index: 0 },
      ),
    ).toMatchObject({ value: "", available: false });
    expect(
      adapter.resolveValue(
        "workExperienceStartMonth",
        profile,
        { collection: "workExperiences", index: 0 },
      ),
    ).toMatchObject({ value: "July" });
    expect(
      adapter.resolveValue(
        "educationEndYear",
        profile,
        { collection: "educationEntries", index: 0 },
      ),
    ).toMatchObject({ value: "2025" });
    expect(
      adapter.resolveValue(
        "workExperienceCurrentRole",
        profile,
        { collection: "workExperiences", index: 0 },
      ),
    ).toMatchObject({ value: "yes" });
    expect(
      adapter.allowsSingleCheckbox(
        { fieldKey: "workExperienceCurrentRole" },
        "workExperienceCurrentRole",
        "yes",
      ),
    ).toBe(true);
    expect(
      adapter.allowsSingleCheckbox(
        { fieldKey: "workExperienceCurrentRole" },
        "workExperienceCurrentRole",
        "no",
      ),
    ).toBe(false);
  });

  it("adds only required, allowlisted repeat sections backed by saved entries", async () => {
    const items: unknown[] = [{}];
    let clickCount = 0;
    const requiredSection = {
      getAttribute(name: string) {
        return name === "data-required" ? "true" : null;
      },
      querySelector() {
        return null;
      },
    };
    const button = {
      disabled: false,
      getAttribute() {
        return null;
      },
      closest() {
        return requiredSection;
      },
      click() {
        clickCount += 1;
        items.push({});
      },
    };
    const documentLike = {
      querySelector(selector: string) {
        return selector.includes('data-automation-id="addWorkExperience"')
          ? button
          : null;
      },
      querySelectorAll(selector: string) {
        return selector.includes('data-workday-collection="workExperiences"')
          ? items
          : [];
      },
    };

    await expect(
      adapter.prepareRepeatedSections({
        documentLike,
        profile: { workExperiences: [{}, {}] },
        assertActive() {},
        wait: async () => {},
      }),
    ).resolves.toBe(1);
    expect(clickCount).toBe(1);
  });

  it("bounds and validates structured profile data at the extension boundary", () => {
    const profile = profileSchema.sanitizeStoredProfile({
      workExperiences: Array.from({ length: 25 }, (_, index) => ({
        company: `Company ${index}`,
        startDate: index === 0 ? "not-a-month" : "2024-01",
        currentRole: index === 0 ? "maybe" : index === 2 ? "yes" : "no",
        endDate: [1, 2].includes(index) ? "2025-01" : "",
      })),
      credentialEntries: [
        "AWS Certified Developer",
        {
          name: "Permanent credential",
          expirationDate: "2028-01",
          doesNotExpire: "yes",
        },
      ],
      willingToTravel: "no",
      maxTravelPercentage: "25",
    }) as {
      workExperiences: {
        startDate: string;
        endDate: string;
        currentRole: string;
      }[];
      credentialEntries: {
        name: string;
        expirationDate: string;
        doesNotExpire: string;
      }[];
      maxTravelPercentage: string;
    };
    expect(profile.workExperiences).toHaveLength(20);
    expect(profile.workExperiences[0]).toMatchObject({
      startDate: "",
      currentRole: "",
    });
    expect(profile.workExperiences[1]?.endDate).toBe("2025-01");
    expect(profile.workExperiences[2]?.endDate).toBe("");
    expect(profile.credentialEntries).toEqual([
      expect.objectContaining({ name: "AWS Certified Developer" }),
      expect.objectContaining({
        name: "Permanent credential",
        expirationDate: "",
        doesNotExpire: "yes",
      }),
    ]);
    expect(profile.maxTravelPercentage).toBe("");
  });

  it("exposes only structured availability during passive scans", () => {
    const availability = profileSchema.profileAvailability({
      workExperiences: [{ company: "Secret Company" }],
      credentialEntries: [],
      additionalWebsites: [{ label: "Portfolio", url: "https://example.com" }],
    });

    expect(availability).toMatchObject({
      workExperiences: true,
      credentialEntries: false,
      additionalWebsites: true,
    });
    expect(JSON.stringify(availability)).not.toContain("Secret Company");
    expect(Object.values(availability).every((value) => typeof value === "boolean")).toBe(
      true,
    );
  });
});
