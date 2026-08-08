import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db";
import { saveCriteria, saveProfile } from "../lib/settings";
import {
  buildReviewBatch,
  applyAgentScores,
  getResumeContext,
  rescoreResumeFit,
} from "../lib/matching/agent";
import { resetDb } from "./helpers";

async function makeResume(skills: string[], createdAt?: Date) {
  return prisma.resumeVersion.create({
    data: {
      source: "resume.txt",
      text: `Software engineer skilled in ${skills.join(", ")}.`,
      parsed: JSON.stringify({ skills, summary: "Full-stack engineer", titles: ["Software Engineer"] }),
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

async function makeJobWithMatch(opts: {
  key: string;
  title: string;
  description?: string;
  score: number;
  status?: string;
  isWorkday?: boolean;
  availabilityStatus?: string;
  skills?: string[];
}) {
  const job = await prisma.job.create({
    data: {
      dedupeKey: opts.key,
      atsType: "greenhouse",
      externalId: opts.key,
      title: opts.title,
      company: "Acme",
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${opts.key}`,
      description: opts.description ?? null,
      skills: opts.skills ? JSON.stringify(opts.skills) : null,
      isWorkday: Boolean(opts.isWorkday),
      availabilityStatus: opts.availabilityStatus ?? "open",
    },
  });
  await prisma.match.create({
    data: { jobId: job.id, score: opts.score, reasons: "[]", status: opts.status ?? "new" },
  });
  return job;
}

async function applyCurrentAgentScores(
  scores: Parameters<typeof applyAgentScores>[0],
) {
  const { versionId } = await getResumeContext();
  return applyAgentScores(scores, versionId);
}

beforeEach(async () => {
  await resetDb();
  await saveCriteria({ titles: ["Software Engineer"], keywords: [], excludeKeywords: [] });
});

describe("buildReviewBatch", () => {
  it("shortlists new jobs above the rule-score floor, ordered by rule score", async () => {
    await makeResume(["TypeScript", "React"]);
    await makeJobWithMatch({ key: "hi", title: "Senior Software Engineer", score: 80 });
    await makeJobWithMatch({ key: "mid", title: "Software Engineer", score: 50 });
    await makeJobWithMatch({ key: "lo", title: "Data Entry", score: 20 });

    const batch = await buildReviewBatch();
    expect(batch.count).toBe(2);
    expect(batch.items[0].ruleScore).toBe(80);
    expect(batch.items[1].ruleScore).toBe(50);
    expect(batch.resume.skills).toContain("TypeScript");
    expect(batch.resumeVersionId).not.toBeNull();
  });

  it("excludes jobs already agent-scored at the current resume version", async () => {
    await makeResume(["TypeScript"]);
    const j = await makeJobWithMatch({ key: "a", title: "Software Engineer", score: 70 });

    await applyCurrentAgentScores([{ jobId: j.id, score: 90, reasons: ["great"], summary: "strong" }]);

    const batch = await buildReviewBatch();
    expect(batch.count).toBe(0);

    const all = await buildReviewBatch({ includeAgentScored: true });
    expect(all.count).toBe(1);
  });

  it("excludes archived jobs from review batches", async () => {
    await makeResume(["TypeScript"]);
    await makeJobWithMatch({
      key: "closed",
      title: "Software Engineer",
      score: 90,
      availabilityStatus: "closed",
    });

    expect((await buildReviewBatch()).count).toBe(0);
  });

  it("merges existing profile evidence with the latest resume version", async () => {
    await saveProfile({
      skills: ["Node JS", "React"],
      targetRoles: ["Platform Engineer"],
      resumeText: "Deployed services to Amazon Web Services.",
    });
    await makeResume(["Node.js", "Python"]);

    const { ctx, source } = await getResumeContext();

    expect(source).toBe("resume");
    expect(ctx.skills).toEqual(["Node JS", "React", "Python"]);
    expect(ctx.titles).toContain("Platform Engineer");
    expect(ctx.text).toContain("Amazon Web Services");
    expect(ctx.text).toContain("skilled in Node.js, Python");
  });
});

describe("applyAgentScores", () => {
  it("writes agent score, reasons, summary, provider and version stamp", async () => {
    const rv = await makeResume(["TypeScript"]);
    const j = await makeJobWithMatch({ key: "a", title: "Software Engineer", score: 70 });

    const res = await applyCurrentAgentScores([
      { jobId: j.id, score: 88, reasons: ["deep TS overlap"], summary: "strong fit", recommend: true },
    ]);
    expect(res.updated).toBe(1);

    const m = await prisma.match.findUniqueOrThrow({ where: { jobId: j.id } });
    expect(m.resumeScore).toBe(88);
    expect(m.matchProvider).toBe("agent");
    expect(m.scoredResumeVersion).toMatch(new RegExp(`^${rv.id}:`));
    expect(m.resumeSummary).toMatch(/strong fit/);
    expect(m.resumeSummary).toMatch(/recommended/);
  });

  it("skips unknown jobs and invalid scores", async () => {
    await makeResume(["TypeScript"]);
    const res = await applyCurrentAgentScores([
      { jobId: "nope", score: 50 },
      { jobId: "also-nope", score: Number.NaN },
    ]);
    expect(res.updated).toBe(0);
    expect(res.skipped).toHaveLength(2);
  });

  it("does not import scores for archived jobs", async () => {
    await makeResume(["TypeScript"]);
    const job = await makeJobWithMatch({
      key: "closed",
      title: "Software Engineer",
      score: 90,
      availabilityStatus: "closed",
    });

    const result = await applyCurrentAgentScores([
      { jobId: job.id, score: 95, reasons: ["strong overlap"] },
    ]);

    expect(result.updated).toBe(0);
    expect(result.skipped).toEqual([
      { jobId: job.id, reason: "closed job" },
    ]);
    expect(
      await prisma.match.findUniqueOrThrow({ where: { jobId: job.id } }),
    ).toMatchObject({
      resumeScore: null,
      matchProvider: null,
    });
  });

  it("rejects scores when the profile changed after review export", async () => {
    await saveProfile({ skills: ["TypeScript"] });
    const job = await makeJobWithMatch({
      key: "stale-review",
      title: "Software Engineer",
      score: 70,
    });
    const reviewed = await getResumeContext();

    await saveProfile({ skills: ["TypeScript", "React"] });
    const result = await applyAgentScores(
      [{ jobId: job.id, score: 90, reasons: ["Stale assessment"] }],
      reviewed.versionId,
    );

    expect(result.updated).toBe(0);
    expect(result.skipped).toEqual([
      {
        jobId: job.id,
        reason:
          "resume context changed since export; export a new review batch",
      },
    ]);
    expect(
      await prisma.match.findUniqueOrThrow({ where: { jobId: job.id } }),
    ).toMatchObject({ resumeScore: null, matchProvider: null });
  });
});

describe("rescoreResumeFit", () => {
  it("sets a deterministic baseline but preserves current agent scores", async () => {
    await makeResume(["TypeScript", "React", "Node.js"]);
    const agentJob = await makeJobWithMatch({
      key: "agent",
      title: "Software Engineer",
      description: "TypeScript and React.",
      score: 70,
    });
    const autoJob = await makeJobWithMatch({
      key: "auto",
      title: "Backend Engineer",
      description: "Node.js services.",
      score: 60,
    });

    await applyCurrentAgentScores([{ jobId: agentJob.id, score: 95, reasons: ["hand-picked"] }]);

    const r = await rescoreResumeFit();
    expect(r.scored).toBe(1); // only the auto job
    expect(r.preservedAgent).toBe(1);

    const agentMatch = await prisma.match.findUniqueOrThrow({ where: { jobId: agentJob.id } });
    expect(agentMatch.matchProvider).toBe("agent");
    expect(agentMatch.resumeScore).toBe(95);

    const autoMatch = await prisma.match.findUniqueOrThrow({ where: { jobId: autoJob.id } });
    expect(autoMatch.matchProvider).toBe("deterministic");
    expect(autoMatch.resumeScore).toBeGreaterThan(0);
  });

  it("re-baselines stale agent scores after a new resume version", async () => {
    await makeResume(["TypeScript"], new Date("2026-01-01T00:00:00Z"));
    const j = await makeJobWithMatch({
      key: "a",
      title: "Software Engineer",
      description: "TypeScript work.",
      score: 70,
    });
    await applyCurrentAgentScores([{ jobId: j.id, score: 92, reasons: ["ok"] }]);

    // A newer resume version makes the agent score stale.
    const rv2 = await makeResume(["TypeScript", "Go"], new Date("2026-02-01T00:00:00Z"));
    const r = await rescoreResumeFit();
    expect(r.resumeVersionId).toMatch(new RegExp(`^${rv2.id}:`));
    expect(r.preservedAgent).toBe(0);

    const m = await prisma.match.findUniqueOrThrow({ where: { jobId: j.id } });
    expect(m.matchProvider).toBe("deterministic");
    expect(m.scoredResumeVersion).toMatch(new RegExp(`^${rv2.id}:`));
  });

  it("does not rescore skipped matches", async () => {
    await makeResume(["TypeScript"]);
    await makeJobWithMatch({ key: "s", title: "Software Engineer", score: 0, status: "skipped" });
    const r = await rescoreResumeFit();
    expect(r.scored).toBe(0);
  });

  it("does not rescore archived jobs", async () => {
    await makeResume(["TypeScript"]);
    await makeJobWithMatch({
      key: "closed",
      title: "Software Engineer",
      score: 80,
      availabilityStatus: "closed",
    });

    expect((await rescoreResumeFit()).scored).toBe(0);
  });

  it("uses structured posting skills with saved profile resume text", async () => {
    await saveProfile({
      skills: ["Python"],
      resumeText: "Technical Skills: React.JS and Node JS.",
    });
    const job = await makeJobWithMatch({
      key: "structured-skills",
      title: "Frontend Engineer",
      description: "Build customer-facing interfaces.",
      skills: ["React", "Node.js"],
      score: 70,
    });

    expect((await rescoreResumeFit()).scored).toBe(1);
    const match = await prisma.match.findUniqueOrThrow({
      where: { jobId: job.id },
    });
    expect(match.resumeScore ?? 0).toBeGreaterThan(0);
    expect(match.resumeReasons).toMatch(/Matches 2 saved résumé skills/i);
  });

  it("invalidates an agent score when merged profile evidence changes", async () => {
    await saveProfile({ skills: ["TypeScript"] });
    await makeResume(["Python"]);
    const job = await makeJobWithMatch({
      key: "profile-change",
      title: "Software Engineer",
      description: "Build TypeScript services.",
      score: 70,
    });
    await applyCurrentAgentScores([
      { jobId: job.id, score: 95, reasons: ["Agent assessment"] },
    ]);

    await saveProfile({ skills: ["TypeScript", "React"] });
    const result = await rescoreResumeFit();

    expect(result.scored).toBe(1);
    expect(result.preservedAgent).toBe(0);
    expect(
      await prisma.match.findUniqueOrThrow({ where: { jobId: job.id } }),
    ).toMatchObject({ matchProvider: "deterministic" });
  });

  it("scores title-only profiles and clears stale agent scores after evidence removal", async () => {
    await saveProfile({ targetRoles: ["Software Engineer"] });
    const titleJob = await makeJobWithMatch({
      key: "title-only",
      title: "Software Engineer",
      score: 70,
    });
    const titleContext = await getResumeContext();
    expect(titleContext.versionId).toMatch(/^profile:/);
    expect((await rescoreResumeFit()).scored).toBe(1);
    expect(
      (
        await prisma.match.findUniqueOrThrow({
          where: { jobId: titleJob.id },
        })
      ).resumeScore,
    ).toBeGreaterThan(0);

    await applyAgentScores(
      [{ jobId: titleJob.id, score: 90, reasons: ["Title alignment"] }],
      titleContext.versionId,
    );
    await saveProfile({ targetRoles: [] });
    const cleared = await rescoreResumeFit();
    const match = await prisma.match.findUniqueOrThrow({
      where: { jobId: titleJob.id },
    });
    expect(cleared.preservedAgent).toBe(0);
    expect(match.matchProvider).toBe("deterministic");
    expect(match.resumeScore).toBe(0);
  });
});
