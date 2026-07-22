import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../lib/db";
import { runSource } from "../lib/sources/run";
import { draftApplication, approveAndSubmit, rejectMatch } from "../lib/applications/service";
import { saveProfile, saveCriteria } from "../lib/settings";
import { resetDb, mockFetchJson } from "./helpers";

// A JSON feed mixing two easy-apply ATS jobs and one Workday job.
const LISTINGS = [
  {
    title: "Software Engineer",
    url: "https://boards.greenhouse.io/acme/jobs/1001",
    company_name: "Acme",
    locations: "Remote",
  },
  {
    title: "Backend Engineer",
    url: "https://jobs.lever.co/acme/12345678-1234-1234-1234-1234567890ab",
    company_name: "Acme",
    locations: "New York",
  },
  {
    title: "Platform Engineer",
    url: "https://acme.wd5.myworkdayjobs.com/careers/job/9",
    company_name: "Acme",
    locations: "Remote",
  },
];

async function makeJsonSource(name = "Test JSON") {
  return prisma.source.create({
    data: { name, kind: "json", config: JSON.stringify({ url: "https://x/listings.json" }) },
  });
}

async function fullProfile() {
  await saveProfile({
    firstName: "Jordan",
    lastName: "Rivera",
    email: "jordan@example.com",
    resumePath: "resume.txt",
  });
}

beforeEach(async () => {
  await resetDb();
  await saveCriteria({
    titles: ["Software Engineer", "Backend Engineer", "Platform Engineer"],
    keywords: [],
    excludeKeywords: [],
    locations: [],
    remoteOnly: false,
    seniority: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ingest: dedup + workday flagging", () => {
  it("is idempotent — a second scan creates nothing", async () => {
    mockFetchJson(LISTINGS);
    const src = await makeJsonSource();

    const r1 = await runSource(src.id);
    expect(r1.created).toBe(3);
    expect(r1.workday).toBe(1);

    const r2 = await runSource(src.id);
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(3);
  });

  it("flags Workday jobs and never creates a match for them", async () => {
    mockFetchJson(LISTINGS);
    const src = await makeJsonSource();
    await runSource(src.id);

    const wd = await prisma.job.findMany({ where: { isWorkday: true } });
    expect(wd).toHaveLength(1);
    expect(wd[0].title).toBe("Platform Engineer");
    expect(await prisma.match.findUnique({ where: { jobId: wd[0].id } })).toBeNull();

    // Only the two non-Workday jobs get matches.
    expect(await prisma.match.count()).toBe(2);
  });

  it("collapses the same posting from two sources into one job with two sightings", async () => {
    mockFetchJson(LISTINGS);
    const src1 = await makeJsonSource("Source One");
    const src2 = await makeJsonSource("Source Two");
    await runSource(src1.id);
    await runSource(src2.id);

    const job = await prisma.job.findUnique({
      where: { dedupeKey: "greenhouse:1001" },
      include: { sightings: true },
    });
    expect(job).not.toBeNull();
    expect(job!.sightings).toHaveLength(2); // one canonical job, seen by both
    // Still just 3 canonical jobs total despite two scans of the same feed.
    expect(await prisma.job.count()).toBe(3);
  });
});

describe("application human gate + never-apply-twice", () => {
  it("drafts to pending_approval, sends on approval (dry-run), and is idempotent", async () => {
    mockFetchJson(LISTINGS);
    const src = await makeJsonSource();
    await runSource(src.id);
    await fullProfile();

    const gh = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "greenhouse:1001" } });

    const draft = await draftApplication(gh.id);
    expect(draft.application.status).toBe("pending_approval");
    expect(draft.missing).toHaveLength(0);
    expect(draft.alreadyExisted).toBe(false);

    // Drafting again does not create a second application.
    const draft2 = await draftApplication(gh.id);
    expect(draft2.alreadyExisted).toBe(true);
    expect(await prisma.application.count()).toBe(1);

    // Human approval → submit (dry-run: recorded, nothing sent).
    const approved = await approveAndSubmit(gh.id);
    expect(approved.application.status).toBe("submitted");
    expect((approved.result as { mode: string }).mode).toBe("dry_run");

    // Re-approving is a no-op.
    const approved2 = await approveAndSubmit(gh.id);
    expect(approved2.alreadySubmitted).toBe(true);
  });

  it("blocks approval when required fields are missing", async () => {
    mockFetchJson(LISTINGS);
    const src = await makeJsonSource();
    await runSource(src.id);
    // no profile saved → required fields blank

    const gh = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "greenhouse:1001" } });
    const draft = await draftApplication(gh.id);
    expect(draft.missing.length).toBeGreaterThan(0);
    await expect(approveAndSubmit(gh.id)).rejects.toThrow(/missing required/i);
  });

  it("refuses to draft an application for a Workday job", async () => {
    mockFetchJson(LISTINGS);
    const src = await makeJsonSource();
    await runSource(src.id);

    const wd = await prisma.job.findFirstOrThrow({ where: { isWorkday: true } });
    await expect(draftApplication(wd.id)).rejects.toThrow(/workday/i);
  });

  it("refuses a repost of an already in-flight job (fuzzy guard)", async () => {
    mockFetchJson([
      {
        title: "Software Engineer",
        url: "https://boards.greenhouse.io/acme/jobs/1001",
        company_name: "Acme",
        locations: "Remote",
      },
      {
        title: "Software Engineer",
        url: "https://boards.greenhouse.io/acme/jobs/2002",
        company_name: "Acme",
        locations: "Remote",
      },
    ]);
    const src = await makeJsonSource();
    await runSource(src.id);
    await fullProfile();

    const first = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "greenhouse:1001" } });
    await draftApplication(first.id); // pending_approval

    const repost = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "greenhouse:2002" } });
    await expect(draftApplication(repost.id)).rejects.toThrow(/repost|twice/i);
  });

  it("lets a user reject a match", async () => {
    mockFetchJson(LISTINGS);
    const src = await makeJsonSource();
    await runSource(src.id);

    const gh = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: "greenhouse:1001" } });
    await rejectMatch(gh.id);
    const match = await prisma.match.findUniqueOrThrow({ where: { jobId: gh.id } });
    expect(match.status).toBe("rejected");
  });
});
