import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Shares the global-migrated test.db (see test/setup-env.ts + global-setup.ts).
// fileParallelism is disabled, so DB-backed test files never clash.

type Prisma = typeof import("../lib/db").prisma;
type SaveProfile = typeof import("../lib/settings").saveProfile;
type JudgeModule = typeof import("../lib/judge/judge");
type AgentModule = typeof import("../lib/judge/agent");

let prisma: Prisma;
let saveProfile: SaveProfile;
let buildResumeContext: JudgeModule["buildResumeContext"];
let scoreAllJobs: JudgeModule["scoreAllJobs"];
let buildJudgeBatch: AgentModule["buildJudgeBatch"];
let applyJudgeScores: AgentModule["applyJudgeScores"];

async function resetDb() {
  await prisma.jobSighting.deleteMany();
  await prisma.application.deleteMany();
  await prisma.match.deleteMany();
  await prisma.job.deleteMany();
  await prisma.source.deleteMany();
  await prisma.resumeVersion.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.criteria.deleteMany();
}

async function makeJob(opts: {
  key: string;
  title: string;
  description?: string;
  country?: string;
  skills?: string[];
  isEntryLevel?: boolean;
  isWorkday?: boolean;
  fitScore?: number;
  fitProvider?: string;
}) {
  return prisma.job.create({
    data: {
      dedupeKey: opts.key,
      atsType: "greenhouse",
      externalId: opts.key,
      title: opts.title,
      company: "Acme",
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${opts.key}`,
      description: opts.description ?? null,
      country: opts.country ?? "US",
      skills: opts.skills ? JSON.stringify(opts.skills) : null,
      isEntryLevel: opts.isEntryLevel ?? true,
      isWorkday: opts.isWorkday ?? false,
      fitScore: opts.fitScore,
      fitProvider: opts.fitProvider,
      fitReasons: opts.fitScore == null ? null : JSON.stringify(["existing"]),
    },
  });
}

beforeAll(async () => {
  ({ prisma } = await import("../lib/db"));
  ({ saveProfile } = await import("../lib/settings"));
  ({ buildResumeContext, scoreAllJobs } = await import("../lib/judge/judge"));
  ({ buildJudgeBatch, applyJudgeScores } = await import("../lib/judge/agent"));
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
