import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db";
import { saveCriteria } from "../lib/settings";
import {
  buildReviewBatch,
  applyAgentScores,
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
      isWorkday: Boolean(opts.isWorkday),
    },
  });
  await prisma.match.create({
    data: { jobId: job.id, score: opts.score, reasons: "[]", status: opts.status ?? "new" },
  });
  return job;
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

    await applyAgentScores([{ jobId: j.id, score: 90, reasons: ["great"], summary: "strong" }]);

    const batch = await buildReviewBatch();
    expect(batch.count).toBe(0);

    const all = await buildReviewBatch({ includeAgentScored: true });
    expect(all.count).toBe(1);
  });
});

describe("applyAgentScores", () => {
  it("writes agent score, reasons, summary, provider and version stamp", async () => {
    const rv = await makeResume(["TypeScript"]);
    const j = await makeJobWithMatch({ key: "a", title: "Software Engineer", score: 70 });

    const res = await applyAgentScores([
      { jobId: j.id, score: 88, reasons: ["deep TS overlap"], summary: "strong fit", recommend: true },
    ]);
    expect(res.updated).toBe(1);

    const m = await prisma.match.findUniqueOrThrow({ where: { jobId: j.id } });
    expect(m.resumeScore).toBe(88);
    expect(m.matchProvider).toBe("agent");
    expect(m.scoredResumeVersion).toBe(rv.id);
    expect(m.resumeSummary).toMatch(/strong fit/);
    expect(m.resumeSummary).toMatch(/recommended/);
  });

  it("skips unknown jobs and invalid scores", async () => {
    await makeResume(["TypeScript"]);
    const res = await applyAgentScores([
      { jobId: "nope", score: 50 },
      { jobId: "also-nope", score: Number.NaN },
    ]);
    expect(res.updated).toBe(0);
    expect(res.skipped).toHaveLength(2);
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

    await applyAgentScores([{ jobId: agentJob.id, score: 95, reasons: ["hand-picked"] }]);

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
    await applyAgentScores([{ jobId: j.id, score: 92, reasons: ["ok"] }]);

    // A newer resume version makes the agent score stale.
    const rv2 = await makeResume(["TypeScript", "Go"], new Date("2026-02-01T00:00:00Z"));
    const r = await rescoreResumeFit();
    expect(r.resumeVersionId).toBe(rv2.id);
    expect(r.preservedAgent).toBe(0);

    const m = await prisma.match.findUniqueOrThrow({ where: { jobId: j.id } });
    expect(m.matchProvider).toBe("deterministic");
    expect(m.scoredResumeVersion).toBe(rv2.id);
  });

  it("does not rescore skipped matches", async () => {
    await makeResume(["TypeScript"]);
    await makeJobWithMatch({ key: "s", title: "Software Engineer", score: 0, status: "skipped" });
    const r = await rescoreResumeFit();
    expect(r.scored).toBe(0);
  });
});
