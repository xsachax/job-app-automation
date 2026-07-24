import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchCompanyPostings } from "../lib/discovery/adapters";
import { API_COMPANIES, BOARD_SOURCES, DISCOVERY_SOURCES, type ApiCompany } from "../lib/discovery/companies";
import { jsonResponse } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("microsoft adapter (pcsx)", () => {
  it("maps positions to postings with country + apply URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            count: 2,
            positions: [
              {
                id: 111,
                name: "Software Engineer",
                locations: ["United States", "Washington", "Redmond"],
                positionUrl: "/careers/job/111",
                postedTs: 1_700_000_000,
              },
              {
                id: 222,
                name: "Software Engineer II - Full Stack",
                locations: ["Canada", "British Columbia", "Vancouver"],
                positionUrl: "/careers/job/222",
                postedTs: 1_700_000_000,
              },
            ],
          },
        }),
      ),
    );

    const c = API_COMPANIES.find((x) => x.name === "Microsoft")!;
    const posts = await fetchCompanyPostings(c);
    const us = posts.find((p) => p.externalId === "111")!;
    const ca = posts.find((p) => p.externalId === "222")!;
    expect(us.title).toBe("Software Engineer");
    expect(us.country).toBe("US");
    expect(us.applyUrl).toBe("https://apply.careers.microsoft.com/careers/job/111");
    expect(us.postedAt).toBeInstanceOf(Date);
    expect(ca.country).toBe("CA");
    expect(ca.system).toBe("microsoft");
  });
});

describe("talentbrew adapter (Radancy HTML fragments)", () => {
  it("parses job tiles into postings and classifies country", async () => {
    const html = `
      <ul>
        <li data-intuit-jobid="23021" data-orig-location="">
          <a href="/job/charlotte/software-engineer-i/27595/98110341728" data-job-id="23021"
             class="sr-item" data-title="Software Engineer I - Credit Karma"><h2>Software Engineer I</h2></a>
          <span class="job-location">Charlotte, North Carolina</span>
        </li>
        <li data-intuit-jobid="23022" data-orig-location="">
          <a href="/job/toronto/software-developer-co-op/27595/97231134912" data-job-id="23022"
             class="sr-item" data-title="Software Developer Co-op &amp; Intern"><h2>Software Developer</h2></a>
          <span class="job-location">Toronto, Canada</span>
        </li>
      </ul>`;
    // Page 1 returns the tiles; every later page returns the same tiles, which
    // are all deduped away, so the loop terminates on "no new rows added".
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: html })));

    const c: ApiCompany = {
      name: "Intuit",
      method: "api",
      system: "talentbrew",
      countryFilter: "post",
      queryTerms: ["software engineer"],
      talentbrew: { host: "jobs.intuit.com" },
    };
    const posts = await fetchCompanyPostings(c);
    expect(posts).toHaveLength(2);

    const us = posts.find((p) => p.externalId === "23021")!;
    expect(us.title).toBe("Software Engineer I - Credit Karma");
    expect(us.country).toBe("US");
    expect(us.applyUrl).toBe(
      "https://jobs.intuit.com/job/charlotte/software-engineer-i/27595/98110341728",
    );

    const ca = posts.find((p) => p.externalId === "23022")!;
    expect(ca.country).toBe("CA");
    // HTML entity in the title is decoded.
    expect(ca.title).toBe("Software Developer Co-op & Intern");
  });
});

describe("github board adapter (aggregator listings.json)", () => {
  it("maps rows to postings, sets company per-row, and drops inactive/hidden", async () => {
    const listings = [
      {
        company_name: "Acme",
        title: "Software Engineer, New Grad",
        url: "https://job-boards.greenhouse.io/acme/jobs/123",
        locations: ["San Jose, CA"],
        active: true,
        is_visible: true,
        date_posted: 1_700_000_000,
        id: "row-1",
      },
      {
        company_name: "Beta Labs",
        title: "Backend Engineer",
        url: "https://jobs.lever.co/beta/456",
        locations: ["Toronto, ON, Canada"],
        active: true,
        id: "row-2",
      },
      // Inactive → dropped.
      { company_name: "Gamma", title: "SWE", url: "https://x/1", locations: ["Austin, TX"], active: false, id: "row-3" },
      // Hidden → dropped.
      { company_name: "Delta", title: "SWE", url: "https://x/2", locations: ["Austin, TX"], active: true, is_visible: false, id: "row-4" },
      // Missing url → dropped.
      { company_name: "Epsilon", title: "SWE", url: "", locations: ["Austin, TX"], active: true, id: "row-5" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(listings)));

    const board = BOARD_SOURCES[0];
    const posts = await fetchCompanyPostings(board);
    expect(posts).toHaveLength(2);

    const acme = posts.find((p) => p.externalId === "row-1")!;
    expect(acme.company).toBe("Acme"); // company comes from the row, not the board name
    expect(acme.system).toBe("githubboard");
    expect(acme.country).toBe("US"); // ", CA" now resolves to California
    expect(acme.applyUrl).toBe("https://job-boards.greenhouse.io/acme/jobs/123");
    expect(acme.postedAt).toBeInstanceOf(Date);

    const beta = posts.find((p) => p.externalId === "row-2")!;
    expect(beta.company).toBe("Beta Labs");
    expect(beta.country).toBe("CA");
  });
});

describe("discovery catalog", () => {
  it("registers the newly added companies with the expected system", () => {
    const bySystem = (name: string) => API_COMPANIES.find((c) => c.name === name)?.system;
    expect(bySystem("Microsoft")).toBe("microsoft");
    expect(bySystem("Nuro")).toBe("greenhouse");
    expect(bySystem("Baseten")).toBe("ashby");
    expect(bySystem("DRW")).toBe("greenhouse");
    expect(bySystem("Jane Street")).toBe("greenhouse");
    expect(bySystem("Hudson River Trading")).toBe("greenhouse");
    expect(bySystem("Intuit")).toBe("talentbrew");
    expect(bySystem("Zoom")).toBe("workday");
    expect(bySystem("Waymo")).toBe("greenhouse");
    expect(bySystem("Wealthsimple")).toBe("ashby");
    expect(bySystem("Cursor")).toBe("ashby");
    expect(bySystem("Cognition")).toBe("ashby");
    expect(bySystem("Lovable")).toBe("ashby");
    expect(bySystem("Granola")).toBe("ashby");
  });

  it("registers the GitHub board sources with a repo config", () => {
    expect(BOARD_SOURCES.length).toBeGreaterThanOrEqual(2);
    for (const b of BOARD_SOURCES) {
      expect(b.system).toBe("githubboard");
      expect(b.board?.owner).toBeTruthy();
      expect(b.board?.repo).toBeTruthy();
      expect(b.board?.path).toBeTruthy();
    }
  });

  it("gives every discovery source a fetchable system (no missing fetcher)", async () => {
    // fetchCompanyPostings throws synchronously for an unregistered system.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    for (const c of DISCOVERY_SOURCES) {
      await expect(fetchCompanyPostings(c)).resolves.toBeDefined();
    }
  });
});
