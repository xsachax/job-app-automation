import { describe, it, expect, afterEach, vi } from "vitest";
import { greenhouse } from "../lib/sources/adapters/greenhouse";
import { lever } from "../lib/sources/adapters/lever";
import { ashby } from "../lib/sources/adapters/ashby";
import { json } from "../lib/sources/adapters/json";
import { COMPANY_CATALOG, catalogSources } from "../lib/sources/catalog";
import { mockFetchJson, jsonResponse } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("greenhouse adapter", () => {
  it("normalizes the boards API payload", async () => {
    mockFetchJson({
      jobs: [
        {
          id: 123,
          title: "Software Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/123",
          location: { name: "Remote - US" },
          content: "desc",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
    const [j] = await greenhouse.fetch({ company: "acme", companyName: "Acme" });
    expect(j.title).toBe("Software Engineer");
    expect(j.company).toBe("Acme");
    expect(j.atsType).toBe("greenhouse");
    expect(j.externalId).toBe("123");
    expect(j.remote).toBe(true);
  });

  it("throws on non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 404)));
    await expect(greenhouse.fetch({ company: "nope" })).rejects.toThrow(/HTTP 404/);
  });

  it("requires a company token", async () => {
    await expect(greenhouse.fetch({})).rejects.toThrow(/company/);
  });
});

describe("lever adapter", () => {
  it("normalizes the postings payload", async () => {
    mockFetchJson([
      {
        id: "abc",
        text: "Backend Engineer",
        hostedUrl: "https://jobs.lever.co/acme/abc",
        categories: { location: "New York" },
        workplaceType: "remote",
        createdAt: 1700000000000,
      },
    ]);
    const [j] = await lever.fetch({ company: "acme" });
    expect(j.title).toBe("Backend Engineer");
    expect(j.atsType).toBe("lever");
    expect(j.externalId).toBe("abc");
    expect(j.remote).toBe(true);
  });
});

describe("ashby adapter", () => {
  it("normalizes and skips unlisted roles", async () => {
    mockFetchJson({
      jobs: [
        { id: "1", title: "Listed", applyUrl: "https://jobs.ashbyhq.com/acme/1", isListed: true },
        { id: "2", title: "Hidden", applyUrl: "https://jobs.ashbyhq.com/acme/2", isListed: false },
      ],
    });
    const jobs = await ashby.fetch({ company: "acme" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Listed");
    expect(jobs[0].atsType).toBe("ashby");
  });
});

describe("json adapter", () => {
  it("maps generic items and drops entries without url/title", async () => {
    mockFetchJson([
      { title: "Role A", url: "https://x.com/a", company_name: "X", locations: "Remote" },
      { title: "", url: "https://x.com/blank" },
      { title: "No URL", url: "" },
    ]);
    const jobs = await json.fetch({ url: "https://x.com/listings.json" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Role A");
    expect(jobs[0].company).toBe("X");
  });

  it("follows a nested itemsPath", async () => {
    mockFetchJson({ data: { jobs: [{ title: "Nested", url: "https://x.com/n" }] } });
    const jobs = await json.fetch({ url: "https://x.com", itemsPath: "data.jobs" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Nested");
  });
});

describe("curated source catalog", () => {
  it.each([
    ["Zipline", "greenhouse", "flyzipline"],
    ["Cursor (Anysphere)", "ashby", "cursor"],
  ] as const)("registers %s with its live ATS board", (name, kind, token) => {
    expect(COMPANY_CATALOG).toContainEqual(
      expect.objectContaining({ name, kind, token, region: "US" }),
    );
    expect(catalogSources()).toContainEqual(
      expect.objectContaining({
        name: `${name} (${kind === "greenhouse" ? "Greenhouse" : "Ashby"})`,
        kind,
        config: expect.objectContaining({ company: token, companyName: name }),
      }),
    );
  });
});
