import { describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/db";
import {
  careerUrlCandidates,
  companyMatchesCountries,
  detectAtsFromHtml,
  parseBatchYear,
  resolveCompanyAts,
  resolveYcBoards,
  selectYcCompanies,
  type YcDirectoryCompany,
} from "../lib/discovery/yc";

function company(overrides: Partial<YcDirectoryCompany>): YcDirectoryCompany {
  return {
    name: "Acme",
    slug: "acme",
    website: "https://acme.com",
    batch: "Winter 2023",
    status: "Active",
    team_size: 50,
    isHiring: true,
    regions: ["United States of America"],
    all_locations: "San Francisco, CA, USA",
    ...overrides,
  };
}

describe("parseBatchYear", () => {
  it("extracts a 4-digit year from a batch label", () => {
    expect(parseBatchYear("Winter 2023")).toBe(2023);
    expect(parseBatchYear("Summer 2019")).toBe(2019);
    expect(parseBatchYear("S21")).toBe(0); // no 4-digit year
    expect(parseBatchYear(null)).toBe(0);
    expect(parseBatchYear(undefined)).toBe(0);
  });
});

describe("companyMatchesCountries", () => {
  it("matches US via region/location text", () => {
    expect(companyMatchesCountries(company({ all_locations: "Austin, TX, United States" }), ["US"])).toBe(true);
  });
  it("matches CA via 'canada'", () => {
    expect(
      companyMatchesCountries(company({ regions: ["Canada"], all_locations: "Toronto" }), ["US", "CA"]),
    ).toBe(true);
  });
  it("keeps country-less remote (could be US/CA)", () => {
    expect(
      companyMatchesCountries(company({ regions: [], all_locations: "Remote" }), ["US", "CA"]),
    ).toBe(true);
  });
  it("rejects clearly-foreign remote", () => {
    expect(
      companyMatchesCountries(company({ regions: ["Europe"], all_locations: "Remote (Europe)" }), ["US", "CA"]),
    ).toBe(false);
  });
  it("rejects a non-matching country", () => {
    expect(
      companyMatchesCountries(company({ regions: ["India"], all_locations: "Bangalore, India" }), ["US", "CA"]),
    ).toBe(false);
  });
});

describe("selectYcCompanies", () => {
  const now = new Date("2026-01-15T00:00:00Z");
  const base = { yearsBack: 5, minTeamSize: 10, maxTeamSize: 2000, countries: ["US", "CA"], now };

  it("drops companies older than the year cutoff", () => {
    const list = [
      company({ slug: "old", batch: "Winter 2020" }), // 2020 < 2021 cutoff
      company({ slug: "new", batch: "Summer 2022" }),
    ];
    const picked = selectYcCompanies(list, base);
    expect(picked.map((c) => c.slug)).toEqual(["new"]);
  });

  it("enforces the team-size floor and ceiling", () => {
    const list = [
      company({ slug: "tiny", team_size: 3 }),
      company({ slug: "ok", team_size: 40 }),
      company({ slug: "huge", team_size: 9000 }),
    ];
    expect(selectYcCompanies(list, base).map((c) => c.slug)).toEqual(["ok"]);
  });

  it("drops not-hiring, inactive, website-less, and off-region companies", () => {
    const list = [
      company({ slug: "nothiring", isHiring: false }),
      company({ slug: "inactive", status: "Inactive" }),
      company({ slug: "nosite", website: null }),
      company({ slug: "foreign", regions: ["Europe"], all_locations: "Berlin, Germany" }),
      company({ slug: "keep" }),
    ];
    expect(selectYcCompanies(list, base).map((c) => c.slug)).toEqual(["keep"]);
  });

  it("sorts most-established (largest team) first", () => {
    const list = [
      company({ slug: "small", team_size: 15 }),
      company({ slug: "big", team_size: 900 }),
      company({ slug: "mid", team_size: 100 }),
    ];
    expect(selectYcCompanies(list, base).map((c) => c.slug)).toEqual(["big", "mid", "small"]);
  });
});

describe("detectAtsFromHtml", () => {
  it("detects a Greenhouse embed widget", () => {
    const html = `<script src="https://boards.greenhouse.io/embed/job_board?for=acmeco"></script>`;
    expect(detectAtsFromHtml(html)).toEqual({ system: "greenhouse", token: "acmeco" });
  });
  it("detects a Greenhouse hosted board", () => {
    const html = `<a href="https://job-boards.greenhouse.io/acmeco/jobs/1">Jobs</a>`;
    expect(detectAtsFromHtml(html)).toEqual({ system: "greenhouse", token: "acmeco" });
  });
  it("detects the Greenhouse API host", () => {
    const html = `fetch("https://boards-api.greenhouse.io/v1/boards/acmeco/jobs")`;
    expect(detectAtsFromHtml(html)).toEqual({ system: "greenhouse", token: "acmeco" });
  });
  it("detects Lever", () => {
    const html = `<iframe src="https://jobs.lever.co/acme-co"></iframe>`;
    expect(detectAtsFromHtml(html)).toEqual({ system: "lever", token: "acme-co" });
  });
  it("detects Ashby", () => {
    const html = `<a href="https://jobs.ashbyhq.com/acme-co">Careers</a>`;
    expect(detectAtsFromHtml(html)).toEqual({ system: "ashby", token: "acme-co" });
  });
  it("rejects blocklisted asset-path tokens", () => {
    // A greenhouse asset URL whose captured segment is a marketing path, not a board.
    const html = `<img src="https://boards.greenhouse.io/embed/image.png">`;
    expect(detectAtsFromHtml(html)).toBeNull();
  });
  it("returns null for HTML with no ATS reference", () => {
    expect(detectAtsFromHtml("<html><body>Hello</body></html>")).toBeNull();
    expect(detectAtsFromHtml("")).toBeNull();
  });
});

describe("careerUrlCandidates", () => {
  it("derives origin-based candidates, cheapest first", () => {
    const urls = careerUrlCandidates("https://acme.com/some/path");
    expect(urls[0]).toBe("https://acme.com");
    expect(urls).toContain("https://acme.com/careers");
    expect(urls).toContain("https://acme.com/jobs");
  });
});

describe("resolveCompanyAts", () => {
  it("returns the first board found across candidate pages", async () => {
    const pages: Record<string, string> = {
      "https://acme.com": "<html>nothing here</html>",
      "https://acme.com/careers": `<a href="https://jobs.ashbyhq.com/acme">Jobs</a>`,
    };
    const hit = await resolveCompanyAts(company({}), async (url) => pages[url] ?? "");
    expect(hit).toEqual({ system: "ashby", token: "acme" });
  });

  it("returns null when no page references a board", async () => {
    const hit = await resolveCompanyAts(company({}), async () => "<html>no board</html>");
    expect(hit).toBeNull();
  });

  it("returns null when the company has no website", async () => {
    const hit = await resolveCompanyAts(company({ website: null }), async () => "boom");
    expect(hit).toBeNull();
  });

  it("continues after one failed probe when another page exposes the board", async () => {
    const hit = await resolveCompanyAts(company({}), async (url) => {
      if (url === "https://acme.com") throw new Error("HTTP 429");
      if (url === "https://acme.com/careers") {
        return `<a href="https://jobs.ashbyhq.com/acme">Jobs</a>`;
      }
      return "";
    });

    expect(hit).toEqual({ system: "ashby", token: "acme" });
  });

  it("does not cache a negative result when ATS probes fail", async () => {
    const slug = "transient-probe-failure";
    await prisma.ycAtsCache.deleteMany({ where: { slug } });
    const upsert = vi.spyOn(prisma.ycAtsCache, "upsert");

    const boards = await resolveYcBoards(
      [company({ slug })],
      {
        prisma,
        fetchText: async () => {
          throw new Error("HTTP 503");
        },
        concurrency: 1,
      },
    );

    expect(boards).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(
      await prisma.ycAtsCache.findUnique({ where: { slug } }),
    ).toBeNull();
  });
});
