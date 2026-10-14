import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "../app/api/jobs/route";
import { prisma } from "../lib/db";
import type { Job } from "../app/components/jobs/types";

const DAY = 86_400_000;

beforeEach(async () => {
  await prisma.job.deleteMany();
  await prisma.discoveryConfig.deleteMany();
});

async function list(query: string): Promise<Job[]> {
  const response = await GET(new NextRequest(
    `http://localhost/api/jobs?country=US&availability=active&${query}`,
  ));
  expect(response.status).toBe(200);
  return response.json();
}

describe("jobs queue freshness", () => {
  it("includes jobs ingested after 4000 existing rows and never truncates matches at 2000", async () => {
    const old = new Date(Date.now() - 60 * DAY);
    const recent = new Date(Date.now() - 60_000);
    await prisma.job.createMany({
      data: Array.from({ length: 4000 }, (_, index) => ({
        dedupeKey: `old-${index}`,
        title: "Existing Engineer",
        company: "Queue Test",
        applyUrl: `https://example.test/old/${index}`,
        country: "US",
        isEntryLevel: true,
        postedAt: old,
        firstSeenAt: old,
      })),
    });
    await prisma.job.createMany({
      data: Array.from({ length: 116 }, (_, index) => ({
        dedupeKey: `new-${index}`,
        title: `Fresh Engineer ${index}`,
        company: "Queue Test",
        applyUrl: `https://example.test/new/${index}`,
        country: "US",
        isEntryLevel: true,
        postedAt: index % 2 ? recent : null,
        firstSeenAt: recent,
      })),
    });

    const all = await list("sort=posted&since=all");
    expect(all).toHaveLength(4116);
    expect(all.slice(0, 116).every((item) => item.title.startsWith("Fresh"))).toBe(true);
    const daily = await list("sort=posted&since=24h");
    expect(daily).toHaveLength(116);
    expect(await list("q=Fresh")).toHaveLength(116);
    expect(new Set(all.map((item) => item.id)).size).toBe(4116);
  });

  it("lets discovery time surface newly found older postings without changing Golden-first sorts", async () => {
    const now = new Date(Date.now() - 60_000);
    const old = new Date(Date.now() - 60 * DAY);
    await prisma.job.createMany({
      data: [
        {
          dedupeKey: "golden-old", title: "Software Engineer New Grad", company: "Acme",
          applyUrl: "https://example.test/golden", country: "US", isEntryLevel: true,
          firstSeenAt: old, postedAt: old,
        },
        {
          dedupeKey: "fresh-discovery", title: "New Discovery", company: "Acme",
          applyUrl: "https://example.test/discovery", country: "US", isEntryLevel: true,
          firstSeenAt: now, postedAt: old,
        },
        {
          dedupeKey: "re-seen", title: "Seen Again", company: "Acme",
          applyUrl: "https://example.test/seen", country: "US", isEntryLevel: true,
          firstSeenAt: old, lastSeenAt: now, postedAt: now,
        },
        {
          dedupeKey: "closed", title: "Closed", company: "Acme",
          applyUrl: "https://example.test/closed", country: "US", isEntryLevel: true,
          firstSeenAt: now, postedAt: now, availabilityStatus: "closed",
        },
        {
          dedupeKey: "canada", title: "Canada", company: "Acme",
          applyUrl: "https://example.test/ca", country: "CA", isEntryLevel: true,
          firstSeenAt: now, postedAt: now,
        },
      ],
    });
    for (const sort of ["posted", "company", "fit", "salary"]) {
      expect((await list(`sort=${sort}`))[0].title).toBe("Software Engineer New Grad");
    }
    expect((await list("sort=discovered"))[0].title).toBe("New Discovery");
    expect((await list("sort=discovered&since=24h")).map((item) => item.title)).toEqual(["New Discovery"]);
    expect((await list("sort=posted&since=24h")).map((item) => item.title)).toEqual(["Seen Again"]);
  });
});
