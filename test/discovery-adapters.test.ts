import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchCompanyPostings } from "../lib/discovery/adapters";
import { API_COMPANIES, BOARD_SOURCES, DISCOVERY_SOURCES, YC_SOURCE, type ApiCompany } from "../lib/discovery/companies";
import { prisma } from "../lib/db";
import { jsonResponse } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("curated Greenhouse and Ashby career sources", () => {
  it.each([
    ["Vercel", "greenhouse", "vercel", "https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true"],
    ["Zipline", "greenhouse", "flyzipline", "https://boards-api.greenhouse.io/v1/boards/flyzipline/jobs?content=true"],
    ["Replit", "ashby", "replit", "https://api.ashbyhq.com/posting-api/job-board/replit"],
    ["Cursor", "ashby", "cursor", "https://api.ashbyhq.com/posting-api/job-board/cursor"],
  ] as const)(
    "uses the official %s %s board",
    async (name, system, token, expectedUrl) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          system === "greenhouse"
            ? jsonResponse({
                jobs: [
                  {
                    id: 123,
                    title: "Software Engineer I",
                    absolute_url: "https://job-boards.greenhouse.io/vercel/jobs/123",
                    location: { name: "San Francisco, California" },
                    content: "<p>Build developer tools.</p>",
                    updated_at: "2026-08-01T00:00:00Z",
                  },
                ],
              })
            : jsonResponse({
                jobs: [
                  {
                    id: "replit-123",
                    title: "Software Engineer I",
                    applyUrl: "https://jobs.ashbyhq.com/replit/replit-123/application",
                    location: "Foster City, CA",
                    descriptionPlain: "Build developer tools.",
                    publishedAt: "2026-08-01T00:00:00Z",
                  },
                ],
              }),
        ),
      );
      const company = API_COMPANIES.find((candidate) => candidate.name === name);

      expect(company).toMatchObject({ system, token, countryFilter: "post" });
      expect(DISCOVERY_SOURCES).toContain(company);
      const postings = await fetchCompanyPostings(company!);

      expect(fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
      expect(postings).toMatchObject([
        {
          company: name,
          title: "Software Engineer I",
          system,
          country: "US",
        },
      ]);
    },
  );
});

describe("Canada-first ATS adapters", () => {
  it("maps Workable account jobs and preserves structured experience metadata", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        jobs: [
          {
            title: "Software Developer",
            shortcode: "ABC123",
            url: "https://apply.workable.com/j/ABC123",
            published_on: "2026-08-18",
            experience: "Associate",
            education: "Bachelor's Degree",
            locations: [
              {
                city: "Montréal",
                region: "Quebec",
                country: "Canada",
                countryCode: "CA",
                hidden: false,
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const company = API_COMPANIES.find((candidate) => candidate.name === "Genetec")!;

    const posts = await fetchCompanyPostings(company);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://apply.workable.com/api/v1/widget/accounts/genetec-inc",
      expect.any(Object),
    );
    expect(posts).toMatchObject([
      {
        company: "Genetec",
        system: "workable",
        externalId: "ABC123",
        location: "Montréal, Quebec, Canada",
        country: "CA",
        description: "Experience level: Associate. Education: Bachelor's Degree.",
      },
    ]);
  });

  it("hydrates Teamtailor feed rows with structured job locations", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs.json")) {
        return jsonResponse({
          items: [
            {
              id: "vention-1",
              title: "Junior Software Developer",
              url: "https://vention.na.teamtailor.com/jobs/vention-1",
              date_published: "2026-08-14T08:35:28-04:00",
              content_html: "<p>Build industrial automation software.</p>",
            },
          ],
        });
      }
      return new Response(
        `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "JobPosting",
          jobLocation: [
            {
              "@type": "Place",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Montréal",
                addressRegion: "Quebec",
                addressCountry: "CA",
              },
            },
          ],
        })}</script>`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const company = API_COMPANIES.find((candidate) => candidate.name === "Vention")!;

    const posts = await fetchCompanyPostings(company);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(posts).toMatchObject([
      {
        company: "Vention",
        system: "teamtailor",
        externalId: "vention-1",
        location: "Montréal, Quebec, Canada",
        country: "CA",
        description: "Build industrial automation software.",
      },
    ]);
  });
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

  it("keeps partial results and reports repeated rate limiting", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse({
          data: {
            count: 20,
            positions: Array.from({ length: 10 }, (_, index) => ({
              id: 1_000 + index,
              name: `Software Engineer ${index}`,
              locations: ["United States", "Washington", "Redmond"],
              positionUrl: `/careers/job/${1_000 + index}`,
            })),
          },
        });
      }
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "0" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onWarning = vi.fn();
    const company = API_COMPANIES.find((candidate) => candidate.name === "Microsoft")!;

    const posts = await fetchCompanyPostings(company, { onWarning });

    expect(posts).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringMatching(/pagination stopped after 10 postings: HTTP 429/),
    );
  });

  it("uses the fallback delay when Retry-After is missing", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchMock = vi.fn(async () => {
        calls++;
        if (calls === 1) return new Response("", { status: 429 });
        return jsonResponse({ data: { count: 0, positions: [] } });
      });
      vi.stubGlobal("fetch", fetchMock);
      const company = API_COMPANIES.find(
        (candidate) => candidate.name === "Microsoft",
      )!;

      const pending = fetchCompanyPostings(company);
      await vi.advanceTimersByTimeAsync(1_499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(200);

      await expect(pending).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("uber careers adapter", () => {
  it("uses the current one-shot jobs API and maps its response", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        jobs: [
          {
            Id: "301184",
            Title: "iOS Engineer II",
            Description: "<p>Build rider experiences.</p>",
            DisplayDate: "2026-08-09T06:10:02Z",
            Locations: [
              {
                City: "San Francisco",
                Region: "California",
                Country: "United States",
              },
            ],
            Urls: [
              {
                Url: "/en/jobs/301184/",
                IsDefault: true,
              },
            ],
          },
          {
            Id: "301185",
            Title: "Software Engineer II",
            Locations: [
              {
                City: "Toronto",
                Region: "Ontario",
                Country: "Canada",
              },
            ],
            Urls: [],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const company = API_COMPANIES.find(
      (candidate) => candidate.name === "Uber",
    )!;

    const posts = await fetchCompanyPostings(company);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://jobs.uber.com/api/jobs/search?query=software%20engineer",
    );
    expect(posts).toMatchObject([
      {
        externalId: "301184",
        country: "US",
        applyUrl: "https://jobs.uber.com/en/jobs/301184/",
        description: "Build rider experiences.",
      },
      {
        externalId: "301185",
        country: "CA",
        applyUrl: "https://jobs.uber.com/en/jobs/301185/",
      },
    ]);
  });

  it("retries one transient response but not endpoint drift", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("", {
            status: 503,
            headers: { "Retry-After": "0" },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ jobs: [] }));
      vi.stubGlobal("fetch", fetchMock);
      const company = API_COMPANIES.find(
        (candidate) => candidate.name === "Uber",
      )!;

      const pending = fetchCompanyPostings(company);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response("", { status: 404 }));
      await expect(fetchCompanyPostings(company)).rejects.toThrow("HTTP 404");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed success responses instead of faking an empty run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ jobs: null })));
    const company = API_COMPANIES.find(
      (candidate) => candidate.name === "Uber",
    )!;

    await expect(fetchCompanyPostings(company)).rejects.toThrow(
      "Uber response did not contain a jobs array",
    );
  });
});

describe("netflix careers adapter", () => {
  it("paginates native country searches and hydrates job descriptions", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const detailId = url.pathname.match(/\/jobs\/(\d+)$/)?.[1];
      if (detailId) {
        return jsonResponse({
          id: Number(detailId),
          display_job_id: `JR${detailId}`,
          name: "Software Engineer 3",
          location: "Los Angeles,California,United States of America",
          job_description: "<p>2 years of software engineering experience.</p>",
          canonicalPositionUrl: `https://explore.jobs.netflix.net/careers/job/${detailId}?microsite=netflix.com`,
        });
      }

      const location = url.searchParams.get("location");
      const start = Number(url.searchParams.get("start"));
      if (location === "Canada") {
        return jsonResponse({ count: 0, positions: [] });
      }
      const id = start === 0 ? 101 : 102;
      return jsonResponse({
        count: 2,
        positions: [
          {
            id,
            display_job_id: `JR${id}`,
            name: start === 0 ? "Software Engineer 3" : "Software Engineer Intern",
            location: "Los Angeles,California,United States of America",
            job_description:
              start === 0 ? "" : "<p>Build streaming products.</p>",
            canonicalPositionUrl: `https://explore.jobs.netflix.net/careers/job/${id}`,
            t_create: 1_700_000_000,
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const company = API_COMPANIES.find(
      (candidate) => candidate.name === "Netflix",
    )!;

    const posts = await fetchCompanyPostings(company);

    expect(posts).toHaveLength(2);
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input));
        return (
          url.searchParams.get("location") === "United States" &&
          url.searchParams.get("start") === "1"
        );
      }),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://explore.jobs.netflix.net/api/apply/v2/jobs/101?domain=netflix.com",
      expect.any(Object),
    );
    expect(posts[0]).toMatchObject({
      externalId: "JR101",
      country: "US",
      description: "2 years of software engineering experience.",
      applyUrl:
        "https://explore.jobs.netflix.net/careers/job/101?microsite=netflix.com",
    });
    expect(posts[1]).toMatchObject({
      externalId: "JR102",
      country: "US",
      description: "Build streaming products.",
    });
  });

  it("rejects malformed list responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ positions: null })));
    const company = API_COMPANIES.find(
      (candidate) => candidate.name === "Netflix",
    )!;

    await expect(fetchCompanyPostings(company)).rejects.toThrow(
      "Netflix response did not contain a positions array",
    );
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

  it("parses open roles from a Canada-focused Markdown board", async () => {
    const markdown = `
| Company | Role | Location | Application / Link | Status |
| --- | --- | --- | --- | --- |
| **Acme** | Software Engineer - New Grad | Montreal, QC | <a href="https://jobs.example.com/acme-1">Apply</a> | Open |
| ↳ | Backend Engineer | Toronto, Canada | [Apply](https://jobs.example.com/acme-2) | Open |
| **Closed Co** | Software Developer | Vancouver, Canada | [Apply](https://jobs.example.com/closed) | Closed |
`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(markdown)));
    const board = BOARD_SOURCES.find(
      (candidate) => candidate.name === "Canada New-Grad 2026",
    )!;

    const posts = await fetchCompanyPostings(board);

    expect(posts).toHaveLength(2);
    expect(posts).toMatchObject([
      {
        company: "Acme",
        title: "Software Engineer - New Grad",
        country: "CA",
        applyUrl: "https://jobs.example.com/acme-1",
      },
      {
        company: "Acme",
        title: "Backend Engineer",
        country: "CA",
        applyUrl: "https://jobs.example.com/acme-2",
      },
    ]);
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

describe("authoritative ATS response validation", () => {
  it.each([
    {
      system: "greenhouse" as const,
      payload: {
        jobs: [
          {
            id: 123,
            title: "Software Engineer",
            absolute_url: "",
          },
        ],
      },
    },
    {
      system: "lever" as const,
      payload: [
        {
          id: "lev-1",
          text: "",
          hostedUrl: "https://jobs.lever.co/acme/lev-1",
        },
      ],
    },
    {
      system: "ashby" as const,
      payload: {
        jobs: [
          {
            id: "",
            title: "Software Engineer",
            jobUrl: "https://jobs.ashbyhq.com/acme/ash-1",
          },
        ],
      },
    },
  ])("rejects malformed $system job rows", async ({ system, payload }) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(payload)));
    const company: ApiCompany = {
      name: "Acme",
      method: "api",
      system,
      token: "acme",
      countryFilter: "post",
      queryTerms: ["software engineer"],
    };

    await expect(fetchCompanyPostings(company)).rejects.toThrow(
      /structurally invalid job row/,
    );
  });
});

describe("Y Combinator adapter", () => {
  it("keeps transient ATS discovery failures from degrading the source run", async () => {
    const slug = "adapter-transient-probe";
    await prisma.ycAtsCache.deleteMany({ where: { slug } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === YC_SOURCE.yc?.directoryUrl) {
        return jsonResponse([
          {
            name: "Transient Probe",
            slug,
            website: "https://transient-probe.example",
            batch: "Summer 2026",
            status: "Active",
            team_size: 50,
            isHiring: true,
            regions: ["United States of America"],
            all_locations: "Remote, United States",
          },
        ]);
      }
      return new Response("", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onWarning = vi.fn();

    const postings = await fetchCompanyPostings(YC_SOURCE, {
      onWarning,
      countries: ["US", "CA"],
      yc: {
        yearsBack: 5,
        minTeamSize: 1,
        maxTeamSize: 2_000,
        maxCompanies: 10,
        concurrency: 1,
      },
    });

    expect(postings).toEqual([]);
    expect(onWarning).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/YC ATS discovery unavailable for Transient Probe: HTTP 503/),
    );
    expect(
      await prisma.ycAtsCache.findUnique({ where: { slug } }),
    ).toBeNull();
  });

  it("invalidates stale cached boards without degrading the source run", async () => {
    const slug = "adapter-stale-board";
    await prisma.ycAtsCache.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name: "Stale Board",
        website: "https://stale-board.example",
        batch: "Summer 2026",
        system: "ashby",
        token: "stale-board",
      },
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === YC_SOURCE.yc?.directoryUrl) {
        return jsonResponse([
          {
            name: "Stale Board",
            slug,
            website: "https://stale-board.example",
            batch: "Summer 2026",
            status: "Active",
            team_size: 50,
            isHiring: true,
            regions: ["United States of America"],
            all_locations: "Remote, United States",
          },
        ]);
      }
      if (
        url ===
        "https://api.ashbyhq.com/posting-api/job-board/stale-board"
      ) {
        return new Response("", { status: 404 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onWarning = vi.fn();

    const postings = await fetchCompanyPostings(YC_SOURCE, {
      onWarning,
      countries: ["US", "CA"],
      yc: {
        yearsBack: 5,
        minTeamSize: 1,
        maxTeamSize: 2_000,
        maxCompanies: 10,
        concurrency: 1,
      },
    });

    expect(postings).toEqual([]);
    expect(onWarning).not.toHaveBeenCalled();
    expect(
      await prisma.ycAtsCache.findUnique({ where: { slug } }),
    ).toBeNull();
  });

  it("reports transient failures from a known board as partial results", async () => {
    const slug = "adapter-transient-board";
    await prisma.ycAtsCache.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name: "Transient Board",
        website: "https://transient-board.example",
        batch: "Summer 2026",
        system: "ashby",
        token: "transient-board",
      },
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === YC_SOURCE.yc?.directoryUrl) {
        return jsonResponse([
          {
            name: "Transient Board",
            slug,
            website: "https://transient-board.example",
            batch: "Summer 2026",
            status: "Active",
            team_size: 50,
            isHiring: true,
            regions: ["United States of America"],
            all_locations: "Remote, United States",
          },
        ]);
      }
      if (
        url ===
        "https://api.ashbyhq.com/posting-api/job-board/transient-board"
      ) {
        return new Response("", { status: 503 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onWarning = vi.fn();

    const postings = await fetchCompanyPostings(YC_SOURCE, {
      onWarning,
      countries: ["US", "CA"],
      yc: {
        yearsBack: 5,
        minTeamSize: 1,
        maxTeamSize: 2_000,
        maxCompanies: 10,
        concurrency: 1,
      },
    });

    expect(postings).toEqual([]);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringMatching(/YC board Transient Board .*HTTP 503/),
    );
    expect(
      await prisma.ycAtsCache.findUnique({ where: { slug } }),
    ).toMatchObject({ system: "ashby", token: "transient-board" });
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
    const onWarning = vi.fn();
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

    const posts = await fetchCompanyPostings(
      {
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
      },
      { onWarning },
    );

    expect(posts.map((post) => post.externalId)).toEqual(["2001", "2002"]);
    expect(posts.find((post) => post.externalId === "2001")?.description).toBe("Build software.");
    expect(posts.find((post) => post.externalId === "2002")?.description).toBe("");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Workday detail unavailable for /job/software-engineer-ii"),
    );
    expect(onWarning).toHaveBeenCalledWith(
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
    expect(bySystem("Zipline")).toBe("greenhouse");
    expect(bySystem("Mercor")).toBe("ashby");
    expect(bySystem("Sierra")).toBe("ashby");
    expect(bySystem("Harvey")).toBe("ashby");
    expect(bySystem("Rivian")).toBe("phenom");
    expect(bySystem("Cisco")).toBe("workday");
    expect(bySystem("Behaviour Interactive")).toBe("lever");
    expect(bySystem("Genetec")).toBe("workable");
    expect(bySystem("Vention")).toBe("teamtailor");
    expect(bySystem("Hopper")).toBe("ashby");
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
    expect(BOARD_SOURCES.length).toBeGreaterThanOrEqual(5);
    for (const b of BOARD_SOURCES) {
      expect(b.system).toBe("githubboard");
      expect(b.board?.owner).toBeTruthy();
      expect(b.board?.repo).toBeTruthy();
      expect(b.board?.path).toBeTruthy();
    }
    expect(
      BOARD_SOURCES.find((source) => source.name === "Canada New-Grad 2026")?.board,
    ).toMatchObject({
      owner: "JeelTikiwala",
      repo: "New-Grad-2026",
      format: "markdown",
    });
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
    // The empty fixture is intentionally invalid for strict full-board adapters;
    // this assertion only distinguishes those validation errors from a missing
    // system registration.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    for (const c of DISCOVERY_SOURCES) {
      try {
        await fetchCompanyPostings(c);
      } catch (error) {
        expect(String(error)).not.toContain("no discovery fetcher");
      }
    }
  });
});
