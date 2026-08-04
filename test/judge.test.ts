import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Shares the global-migrated test.db (see test/setup-env.ts + global-setup.ts).
// fileParallelism is disabled, so DB-backed test files never clash.

type Prisma = typeof import("../lib/db").prisma;
type SaveProfile = typeof import("../lib/settings").saveProfile;
type SaveCriteria = typeof import("../lib/settings").saveCriteria;
type JudgeModule = typeof import("../lib/judge/judge");
type AgentModule = typeof import("../lib/judge/agent");
type RefreshModule = typeof import("../lib/profile/refresh");

let prisma: Prisma;
let saveProfile: SaveProfile;
let saveCriteria: SaveCriteria;
let buildResumeContext: JudgeModule["buildResumeContext"];
let scoreAllJobs: JudgeModule["scoreAllJobs"];
let buildJudgeBatch: AgentModule["buildJudgeBatch"];
let applyJudgeScores: AgentModule["applyJudgeScores"];
let refreshProfile: RefreshModule["refreshProfile"];

async function resetDb() {
  await prisma.jobSighting.deleteMany();
  await prisma.application.deleteMany();
  await prisma.match.deleteMany();
  await prisma.job.deleteMany();
  await prisma.source.deleteMany();
  await prisma.resumeVersion.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.criteria.deleteMany();
  await prisma.companyTier.deleteMany();
  await prisma.locationTier.deleteMany();
}

async function makeJob(opts: {
  key: string;
  title: string;
  description?: string;
  country?: string;
  company?: string;
  skills?: string[];
  isEntryLevel?: boolean;
  isWorkday?: boolean;
  fitScore?: number;
  fitProvider?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  location?: string;
}) {
  return prisma.job.create({
    data: {
      dedupeKey: opts.key,
      atsType: "greenhouse",
      externalId: opts.key,
      title: opts.title,
      company: opts.company ?? "Acme",
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${opts.key}`,
      description: opts.description ?? null,
      country: opts.country ?? "US",
      skills: opts.skills ? JSON.stringify(opts.skills) : null,
      isEntryLevel: opts.isEntryLevel ?? true,
      isWorkday: opts.isWorkday ?? false,
      fitScore: opts.fitScore,
      fitProvider: opts.fitProvider,
      fitReasons: opts.fitScore == null ? null : JSON.stringify(["existing"]),
      salaryMin: opts.salaryMin ?? null,
      salaryMax: opts.salaryMax ?? null,
      salaryCurrency: opts.salaryCurrency ?? null,
      location: opts.location ?? null,
    },
  });
}

beforeAll(async () => {
  ({ prisma } = await import("../lib/db"));
  ({ saveProfile, saveCriteria } = await import("../lib/settings"));
  ({ buildResumeContext, scoreAllJobs } = await import("../lib/judge/judge"));
  ({ buildJudgeBatch, applyJudgeScores } = await import("../lib/judge/agent"));
  ({ refreshProfile } = await import("../lib/profile/refresh"));
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buildResumeContext", () => {
  it("derives judge context from profile fields", () => {
    const ctx = buildResumeContext({
      skills: ["TypeScript", "React", "TypeScript"],
      targetRoles: ["Software Engineer"],
      summary: "Product-minded engineer.",
      qualifications: "B.S. Computer Science, May 2026.",
      resumeText: "Built React and Node.js projects.",
    });

    expect(ctx.skills).toEqual(["TypeScript", "React"]);
    expect(ctx.titles).toEqual(["Software Engineer"]);
    expect(ctx.summary).toContain("Computer Science");
    expect(ctx.text).toContain("Built React");
  });
});

describe("refreshProfile", () => {
  it("does not run the judge — scoring stays a manual, button-triggered action", async () => {
    await saveProfile({
      resumeText: "Software engineer skilled in TypeScript and React. Built web apps.",
    });
    const job = await makeJob({
      key: "unscored",
      title: "Software Engineer I",
      description: "Build customer features with TypeScript and React.",
      skills: ["TypeScript", "React"],
    });
    expect(job.fitScore).toBeNull();

    const result = await refreshProfile();

    // Refresh still parses the résumé, but must not score any job.
    expect(result).not.toHaveProperty("resumeScored");
    expect(result).not.toHaveProperty("jobFitScored");

    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.fitScore).toBeNull();
    expect(after.fitProvider).toBeNull();
    expect(after.fitScoredAt).toBeNull();
  });
});

describe("scoreAllJobs", () => {
  it("scores entry-level discovery jobs and preserves agent scores", async () => {
    await saveProfile({
      skills: ["TypeScript", "React", "Node.js"],
      targetRoles: ["Software Engineer"],
      summary: "Entry-level software engineer shipping web apps.",
    });
    const scoredJob = await makeJob({
      key: "eligible",
      title: "Software Engineer I",
      description: "Build customer features with TypeScript and React.",
      skills: ["TypeScript", "React"],
    });
    const agentJob = await makeJob({
      key: "agent",
      title: "Frontend Engineer",
      description: "React UI work.",
      fitScore: 91,
      fitProvider: "agent",
    });
    await makeJob({ key: "senior", title: "Senior Engineer", isEntryLevel: false });
    await makeJob({ key: "workday", title: "Software Engineer", isWorkday: true });

    const result = await scoreAllJobs();
    expect(result.scanned).toBe(2);
    expect(result.scored).toBe(1);
    expect(result.preservedAgent).toBe(1);

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: scoredJob.id } });
    expect(updated.fitProvider).toBe("deterministic");
    expect(updated.fitScore ?? 0).toBeGreaterThan(0);
    expect(JSON.parse(updated.fitReasons ?? "[]")).toEqual(expect.arrayContaining([expect.stringContaining("resume skills")]));

    const preserved = await prisma.job.findUniqueOrThrow({ where: { id: agentJob.id } });
    expect(preserved.fitProvider).toBe("agent");
    expect(preserved.fitScore).toBe(91);
  });
});

describe("scoreAllJobs salary axis", () => {
  it("ranks a well-paid posting above an identical low-paid one when a target is set", async () => {
    await saveProfile({
      skills: ["TypeScript", "React"],
      targetRoles: ["Software Engineer"],
      summary: "Entry-level software engineer shipping web apps.",
    });
    await saveCriteria({ salaryTarget: 110000 });

    const desc = "Build customer features with TypeScript and React.";
    const highJob = await makeJob({
      key: "high-pay",
      title: "Software Engineer I",
      description: desc,
      skills: ["TypeScript", "React"],
      salaryMin: 150000,
      salaryMax: 170000,
    });
    const lowJob = await makeJob({
      key: "low-pay",
      title: "Software Engineer I",
      description: desc,
      skills: ["TypeScript", "React"],
      salaryMin: 60000,
      salaryMax: 70000,
    });

    await scoreAllJobs();

    const high = await prisma.job.findUniqueOrThrow({ where: { id: highJob.id } });
    const low = await prisma.job.findUniqueOrThrow({ where: { id: lowJob.id } });
    expect(high.fitScore ?? 0).toBeGreaterThan(low.fitScore ?? 0);
    expect(JSON.parse(high.fitReasons ?? "[]")).toEqual(
      expect.arrayContaining([expect.stringContaining("above")]),
    );
    expect(JSON.parse(low.fitReasons ?? "[]")).toEqual(
      expect.arrayContaining([expect.stringContaining("below")]),
    );
  });

  it("does not adjust scores when no salary target is configured", async () => {
    await saveProfile({ skills: ["TypeScript"], targetRoles: ["Software Engineer"] });
    // no saveCriteria -> salaryTarget stays null
    const job = await makeJob({
      key: "no-target",
      title: "Software Engineer I",
      description: "TypeScript work.",
      skills: ["TypeScript"],
      salaryMin: 40000,
      salaryMax: 45000,
    });

    await scoreAllJobs();
    const scored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(JSON.parse(scored.fitReasons ?? "[]")).not.toEqual(
      expect.arrayContaining([expect.stringContaining("target")]),
    );
  });
});

describe("scoreAllJobs location axis", () => {
  it("ranks a job in an S-tier location above an identical one in an F-tier location", async () => {
    await saveProfile({
      skills: ["TypeScript", "React"],
      targetRoles: ["Software Engineer"],
      summary: "Entry-level software engineer shipping web apps.",
    });
    await prisma.locationTier.create({ data: { location: "San Francisco, CA", tier: "S" } });
    await prisma.locationTier.create({ data: { location: "Austin, TX", tier: "F" } });

    const desc = "Build customer features with TypeScript and React.";
    const sf = await makeJob({
      key: "sf",
      title: "Software Engineer I",
      description: desc,
      skills: ["TypeScript", "React"],
      location: "San Francisco", // normalizes to "San Francisco, CA"
    });
    const austin = await makeJob({
      key: "austin",
      title: "Software Engineer I",
      description: desc,
      skills: ["TypeScript", "React"],
      location: "Austin, TX",
    });

    await scoreAllJobs();

    const sfJob = await prisma.job.findUniqueOrThrow({ where: { id: sf.id } });
    const austinJob = await prisma.job.findUniqueOrThrow({ where: { id: austin.id } });
    expect(sfJob.fitScore ?? 0).toBeGreaterThan(austinJob.fitScore ?? 0);
    expect(JSON.parse(sfJob.fitReasons ?? "[]")).toEqual(
      expect.arrayContaining([expect.stringContaining("San Francisco, CA is tier S")]),
    );
  });
});

describe("scoreAllJobs company axis", () => {
  it("ranks a job at a tiered company above an identical one at an unranked company", async () => {
    await saveProfile({
      skills: ["TypeScript", "React"],
      targetRoles: ["Software Engineer"],
      summary: "Entry-level software engineer shipping web apps.",
    });
    // "C" is a neutral tier (0 modifier); the unranked company takes the -8
    // default penalty, so the ranked job must edge out its unranked twin.
    await prisma.companyTier.create({ data: { company: "Ranked Co", tier: "C" } });

    const desc = "Build customer features with TypeScript and React.";
    const ranked = await makeJob({
      key: "ranked-co",
      title: "Software Engineer I",
      description: desc,
      skills: ["TypeScript", "React"],
      company: "Ranked Co",
    });
    const unranked = await makeJob({
      key: "unranked-co",
      title: "Software Engineer I",
      description: desc,
      skills: ["TypeScript", "React"],
      company: "Mystery Co",
    });

    await scoreAllJobs();

    const rankedJob = await prisma.job.findUniqueOrThrow({ where: { id: ranked.id } });
    const unrankedJob = await prisma.job.findUniqueOrThrow({ where: { id: unranked.id } });

    expect(rankedJob.fitScore ?? 0).toBeGreaterThan(unrankedJob.fitScore ?? 0);
    expect(JSON.parse(rankedJob.fitReasons ?? "[]")).toEqual(
      expect.arrayContaining([expect.stringContaining("Ranked Co is tier C")]),
    );

    const unrankedReasons = JSON.parse(unrankedJob.fitReasons ?? "[]") as string[];
    expect(unrankedReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("unranked")]),
    );
    expect(unrankedReasons.some((r) => r.includes("is tier"))).toBe(false);
  });
});

describe("agent judge batch", () => {
  it("exports deterministic jobs and applies agent scores to Job.fit fields", async () => {
    await saveProfile({
      skills: ["Python", "SQL"],
      targetRoles: ["Backend Engineer"],
      resumeText: "Backend projects with Python APIs and SQL databases.",
    });
    const job = await makeJob({
      key: "backend",
      title: "Backend Engineer I",
      description: "Python APIs and SQL data work.",
      skills: ["Python", "SQL"],
      fitScore: 72,
      fitProvider: "deterministic",
    });
    await makeJob({
      key: "other-country",
      title: "Backend Engineer I",
      country: "CA",
      fitScore: 80,
      fitProvider: "deterministic",
    });

    const batch = await buildJudgeBatch({ topN: 5, country: "US", out: ".match/judge-test-review.json" });
    expect(batch.count).toBe(1);
    expect(batch.items[0].id).toBe(job.id);
    expect(batch.resume.skills).toContain("Python");
    expect(batch.outputPath).toContain(".match");

    const result = await applyJudgeScores([
      { id: job.id, score: 88, summary: "Strong backend fit", reasons: ["Python and SQL overlap"] },
      { id: "missing", score: 70 },
    ]);
    expect(result.updated).toBe(1);
    expect(result.skipped).toHaveLength(1);

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.fitProvider).toBe("agent");
    expect(updated.fitScore).toBe(88);
    expect(updated.fitSummary).toBe("Strong backend fit");
  });
});
