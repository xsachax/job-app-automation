import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchCompanyPostings } from "../lib/discovery/adapters";
import { API_COMPANIES, BOARD_SOURCES, DISCOVERY_SOURCES, YC_SOURCE, type ApiCompany } from "../lib/discovery/companies";
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

describe("lever adapter", () => {
  it("maps postings with location, apply URL, id and date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            id: "lev-1",
            text: "Software Engineer",
            hostedUrl: "https://jobs.lever.co/acme/lev-1",
            categories: { location: "San Francisco, CA" },
            createdAt: 1_700_000_000_000,
            descriptionPlain: "Build things.",
          },
          {
            id: "lev-2",
            text: "Backend Engineer",
            applyUrl: "https://jobs.lever.co/acme/lev-2/apply",
            categories: { allLocations: ["Toronto, ON", "Remote - Canada"] },
          },
        ]),
      ),
    );
    const c: ApiCompany = {
      name: "Acme",
      method: "api",
      system: "lever",
      token: "acme",
      countryFilter: "post",
      queryTerms: ["software engineer"],
    };
    const posts = await fetchCompanyPostings(c);
    expect(posts).toHaveLength(2);
    const one = posts.find((p) => p.externalId === "lev-1")!;
    expect(one.title).toBe("Software Engineer");
    expect(one.system).toBe("lever");
    expect(one.country).toBe("US");
    expect(one.applyUrl).toBe("https://jobs.lever.co/acme/lev-1");
    expect(one.postedAt).toBeInstanceOf(Date);
    const two = posts.find((p) => p.externalId === "lev-2")!;
    expect(two.applyUrl).toBe("https://jobs.lever.co/acme/lev-2/apply");
    expect(two.country).toBe("CA");
  });
});

describe("Jibe careers adapter", () => {
  it("paginates through every advertised result", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const page = new URL(String(input)).searchParams.get("page");
      return jsonResponse(
        page === "1"
          ? {
              totalCount: 3,
              jobs: [
                {
                  data: {
                    req_id: "1",
                    title: "Software Engineer",
                    full_location: "Atlanta, Georgia",
                    apply_url: "https://careers-acme.icims.com/jobs/1/login",
                  },
                },
                {
                  data: {
                    req_id: "2",
                    title: "Software Engineer II",
                    full_location: "Vancouver, Canada",
                    apply_url: "https://careers-acme.icims.com/jobs/2/login",
                  },
                },
              ],
            }
          : {
              totalCount: 3,
              jobs: [
                {
                  data: {
                    req_id: "3",
                    title: "Cloud Engineer",
                    full_location: "Atlanta, Georgia",
                    apply_url: "https://careers-acme.icims.com/jobs/3/login",
                  },
                },
              ],
            },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const posts = await fetchCompanyPostings({
      name: "Acme",
      method: "api",
      system: "phenom",
      token: "careers.acme.test",
      countryFilter: "post",
      queryTerms: ["software engineer"],
    });

    expect(posts.map((post) => post.externalId)).toEqual(["1", "2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Workday adapter details", () => {
  it("loads official descriptions for relevant configured roles", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return jsonResponse({
          jobPostings: [
            {
              title: "Software Engineer II",
              externalPath: "/job/software-engineer-ii",
              locationsText: "RTP, North Carolina, US",
              postedOn: "Posted Today",
              bulletFields: ["2001"],
            },
            {
              title: "Hardware Engineer",
              externalPath: "/job/hardware-engineer",
              locationsText: "Austin, Texas, US",
              bulletFields: ["2002"],
            },
          ],
        });
      }
      if (url.endsWith("/job/software-engineer-ii")) {
        return jsonResponse({
          jobPostingInfo: {
            title: "Software Engineer II",
            location: "RTP, North Carolina, US",
            jobReqId: "2001",
            postedOn: "Posted Today",
            externalUrl: "https://acme.wd5.myworkdayjobs.com/Acme/job/software-engineer-ii",
            jobDescription: "Bachelor's degree and 2&#43; years of software engineering experience.",
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const posts = await fetchCompanyPostings({
      name: "Acme",
      method: "api",
      system: "workday",
      countryFilter: "post",
      queryTerms: ["software engineer"],
      workday: {
        host: "acme.wd5.myworkdayjobs.com",
        tenant: "acme",
        site: "Acme",
        searchTerms: ["new grad"],
        fetchDescriptions: true,
      },
    });

    const software = posts.find((post) => post.externalId === "2001");
    expect(software?.description).toContain("2+ years");
    expect(software?.applyUrl).toBe(
      "https://acme.wd5.myworkdayjobs.com/Acme/job/software-engineer-ii",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps list results when one detail request fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return jsonResponse({
          jobPostings: [
            {
              title: "Software Engineer I",
              externalPath: "/job/software-engineer-i",
              locationsText: "San Jose, California, US",
              bulletFields: ["2001"],
            },
            {
              title: "Software Engineer II",
              externalPath: "/job/software-engineer-ii",
              locationsText: "RTP, North Carolina, US",
              bulletFields: ["2002"],
            },
          ],
        });
      }
      if (url.endsWith("/job/software-engineer-i")) {
        return jsonResponse({
          jobPostingInfo: {
            title: "Software Engineer I",
            location: "San Jose, California, US",
            jobReqId: "2001",
            jobDescription: "Build software.",
          },
        });
      }
      if (url.endsWith("/job/software-engineer-ii")) {
        return new Response("", { status: 404 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const posts = await fetchCompanyPostings({
      name: "Acme",
      method: "api",
      system: "workday",
      countryFilter: "post",
      queryTerms: ["software engineer"],
      workday: {
        host: "acme.wd5.myworkdayjobs.com",
        tenant: "acme",
        site: "Acme",
        searchTerms: ["new grad"],
        fetchDescriptions: true,
      },
    });

    expect(posts.map((post) => post.externalId)).toEqual(["2001", "2002"]);
    expect(posts.find((post) => post.externalId === "2001")?.description).toBe("Build software.");
    expect(posts.find((post) => post.externalId === "2002")?.description).toBe("");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Workday detail unavailable for /job/software-engineer-ii"),
    );
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
    expect(bySystem("Together AI")).toBe("greenhouse");
    expect(bySystem("Scale AI")).toBe("greenhouse");
    expect(bySystem("Mercor")).toBe("ashby");
    expect(bySystem("Sierra")).toBe("ashby");
    expect(bySystem("Harvey")).toBe("ashby");
    expect(bySystem("Rivian")).toBe("phenom");
    expect(bySystem("Cisco")).toBe("workday");
  });

  it("registers the quant / trading firms with the expected system", () => {
    const bySystem = (name: string) => API_COMPANIES.find((c) => c.name === name)?.system;
    // Greenhouse
    expect(bySystem("Point72")).toBe("greenhouse");
    expect(bySystem("Optiver")).toBe("greenhouse");
    expect(bySystem("Jump Trading")).toBe("greenhouse");
    expect(bySystem("IMC Trading")).toBe("greenhouse");
    expect(bySystem("Tower Research Capital")).toBe("greenhouse");
    expect(bySystem("Qube Research & Technologies")).toBe("greenhouse");
    expect(bySystem("WorldQuant")).toBe("greenhouse");
    expect(bySystem("AQR Capital")).toBe("greenhouse");
    // Lever + Ashby
    expect(bySystem("Belvedere Trading")).toBe("lever");
    expect(bySystem("Valkyrie Trading")).toBe("lever");
    expect(bySystem("Maven Securities")).toBe("ashby");
    // Every quant board token is a non-empty string.
    const quant = ["Jane Street", "DRW", "Hudson River Trading", "Point72", "Optiver"];
    for (const name of quant) {
      expect(API_COMPANIES.find((c) => c.name === name)?.token).toBeTruthy();
    }
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

  it("registers the Y Combinator expansion source with a directory URL", () => {
    expect(YC_SOURCE.system).toBe("ycombinator");
    expect(YC_SOURCE.yc?.directoryUrl).toMatch(/^https?:\/\//);
    expect(DISCOVERY_SOURCES).toContain(YC_SOURCE);
    // It must run after every named company so native listings win dedup.
    const ycIdx = DISCOVERY_SOURCES.indexOf(YC_SOURCE);
    const lastNamed = DISCOVERY_SOURCES.reduce(
      (acc, c, i) => (c.system !== "ycombinator" && c.system !== "githubboard" ? i : acc),
      -1,
    );
    expect(ycIdx).toBeGreaterThan(lastNamed);
  });

  it("gives every discovery source a fetchable system (no missing fetcher)", async () => {
    // fetchCompanyPostings throws synchronously for an unregistered system.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    for (const c of DISCOVERY_SOURCES) {
      await expect(fetchCompanyPostings(c)).resolves.toBeDefined();
    }
  });
});
