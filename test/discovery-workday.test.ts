import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db";
import { ingestPostings } from "../lib/discovery/run";
import { resetDb } from "./helpers";
import type { DiscoveryPosting } from "../lib/discovery/adapters";

function posting(over: Partial<DiscoveryPosting>): DiscoveryPosting {
  return {
    company: "Acme",
    title: "Software Engineer",
    location: "San Francisco, CA",
    country: "US",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
    externalId: "1",
    description: "",
    postedAt: null,
    system: "greenhouse",
    ...over,
  };
}

beforeEach(resetDb);

describe("Workday flagging (discovery persist)", () => {
  it("flags a native Workday scrape into the Workday list", async () => {
    await ingestPostings(
      [
        posting({
          company: "Nvidia",
          system: "workday",
          externalId: "wd-1",
          applyUrl: "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/123",
        }),
      ],
      true,
    );
    const job = await prisma.job.findFirstOrThrow();
    expect(job.isWorkday).toBe(true);
    expect(job.atsType).toBe("workday");
  });

  it("flags a role whose apply URL is Workday even when relisted by a board", async () => {
    await ingestPostings(
      [
        posting({
          company: "Adobe",
          system: "githubboard",
          externalId: "board-9",
          applyUrl: "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/999",
        }),
      ],
      true,
    );
    const job = await prisma.job.findFirstOrThrow();
    expect(job.isWorkday).toBe(true);
  });

  it("keeps non-Workday roles out of the flagged list", async () => {
    await ingestPostings([posting({})], true);
    const job = await prisma.job.findFirstOrThrow();
    expect(job.isWorkday).toBe(false);
  });

  it("routes Workday roles away from the main list and into the flagged one", async () => {
    await ingestPostings(
      [
        posting({ externalId: "gh-1" }), // greenhouse → main list
        posting({
          company: "Zoom",
          system: "workday",
          externalId: "wd-2",
          applyUrl: "https://zoom.wd5.myworkdayjobs.com/en-US/Zoom/job/42",
        }),
      ],
      true,
    );
    const main = await prisma.job.count({ where: { isWorkday: false, isEntryLevel: true } });
    const flagged = await prisma.job.count({ where: { isWorkday: true } });
    expect(main).toBe(1);
    expect(flagged).toBe(1);
  });
});
