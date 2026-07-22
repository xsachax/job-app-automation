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

describe("cross-source dedup (discovery persist)", () => {
  it("keeps the company-site card and suppresses the same role from a board", async () => {
    await ingestPostings([posting({})], true);
    expect(await prisma.job.count()).toBe(1);

    // A board re-lists the SAME role (same company + title + country) under a
    // different id / apply URL and the githubboard system.
    await ingestPostings(
      [posting({ system: "githubboard", externalId: "board-1", applyUrl: "https://simplify.jobs/acme/1" })],
      true,
    );

    expect(await prisma.job.count()).toBe(1); // deduped — still one card
    const job = await prisma.job.findFirstOrThrow();
    expect(job.discoverySystem).toBe("greenhouse"); // the native listing won
    expect(job.applyUrl).toContain("greenhouse");
  });

  it("does NOT collapse an employer's distinct same-title reqs from one system", async () => {
    await ingestPostings(
      [
        posting({ externalId: "1", location: "Seattle, WA" }),
        posting({ externalId: "2", location: "New York, NY" }),
      ],
      true,
    );
    // Same company + title + US, same system, distinct ids → two separate reqs.
    expect(await prisma.job.count()).toBe(2);
  });

  it("dedupes the same role appearing on two different boards", async () => {
    await ingestPostings(
      [posting({ system: "githubboard", externalId: "a", applyUrl: "https://board-a/acme/1" })],
      true,
    );
    await ingestPostings(
      [posting({ system: "githubboard", externalId: "b", applyUrl: "https://board-b/acme/1" })],
      true,
    );
    expect(await prisma.job.count()).toBe(1);
  });
});
