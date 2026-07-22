import { prisma } from "../lib/db";

// Deterministic, network-free fixtures for the Playwright e2e suite.
// Wipes the target database (DATABASE_URL — an isolated e2e.db) and inserts a
// full profile, criteria, a resume version, and a fixed set of jobs/matches so
// the dashboard flows (human gate, reject, resume fit) are reproducible.

async function wipe() {
  await prisma.jobSighting.deleteMany();
  await prisma.application.deleteMany();
  await prisma.match.deleteMany();
  await prisma.job.deleteMany();
  await prisma.source.deleteMany();
  await prisma.resumeVersion.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.criteria.deleteMany();
}

interface Fixture {
  key: string;
  title: string;
  company: string;
  description: string;
  ruleScore: number;
  resumeScore: number;
  provider: "deterministic" | "agent";
  summary?: string;
  isWorkday?: boolean;
  ageDays?: number; // how long ago the job was posted (drives the date filter)
}

const JOBS: Fixture[] = [
  {
    key: "frontend",
    title: "E2E Frontend Engineer",
    company: "AcmeE2E",
    description: "Build UI with TypeScript, React and Node.js.",
    ruleScore: 88,
    resumeScore: 90,
    provider: "agent",
    summary: "Excellent fit — core stack matches end to end.",
    ageDays: 0,
  },
  {
    key: "apply",
    title: "E2E Apply Engineer",
    company: "AcmeE2E",
    description: "Full-stack role using TypeScript and PostgreSQL.",
    ruleScore: 80,
    resumeScore: 74,
    provider: "deterministic",
    ageDays: 0,
  },
  {
    key: "reject",
    title: "E2E Reject Engineer",
    company: "AcmeE2E",
    description: "Backend services in Node.js.",
    ruleScore: 61,
    resumeScore: 40,
    provider: "deterministic",
    ageDays: 2,
  },
  {
    key: "staff",
    title: "E2E Staff Engineer",
    company: "AcmeE2E",
    description: "Lead platform work across TypeScript and infra.",
    ruleScore: 70,
    resumeScore: 82,
    provider: "agent",
    summary: "Strong fit; seniority aligns.",
    ageDays: 10,
  },
  {
    key: "workday",
    title: "E2E Workday Engineer",
    company: "AcmeE2E",
    description: "Enterprise role behind Workday.",
    ruleScore: 0,
    resumeScore: 0,
    provider: "deterministic",
    isWorkday: true,
  },
];

async function main() {
  await wipe();

  await prisma.profile.create({
    data: {
      id: "me",
      data: JSON.stringify({
        firstName: "Jordan",
        lastName: "Rivera",
        email: "jordan@example.com",
        phone: "+1 415 555 0142",
        location: "Remote",
        linkedin: "https://linkedin.com/in/jordanrivera",
        github: "https://github.com/jordanrivera",
        website: "https://jordanrivera.dev",
        skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
        summary: "Senior full-stack engineer.",
        workAuthorized: true,
        requiresSponsorship: false,
        resumeSource: "sample-data/resume.txt",
        resumePath: "sample-data/resume.txt",
      }),
    },
  });

  await prisma.criteria.create({
    data: {
      id: "default",
      data: JSON.stringify({
        titles: ["Engineer"],
        keywords: ["typescript", "react"],
        excludeKeywords: [],
        locations: [],
        remoteOnly: false,
        seniority: [],
      }),
    },
  });

  const resume = await prisma.resumeVersion.create({
    data: {
      source: "sample-data/resume.txt",
      text: "Senior software engineer with TypeScript, React, Node.js, PostgreSQL.",
      parsed: JSON.stringify({
        skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
        summary: "Senior full-stack engineer",
        titles: ["Senior Software Engineer"],
      }),
    },
  });

  const source = await prisma.source.create({
    data: { name: "E2E Fixture Source", kind: "json", config: "{}", enabled: false },
  });

  for (const f of JOBS) {
    const job = await prisma.job.create({
      data: {
        dedupeKey: `greenhouse:e2e-${f.key}`,
        atsType: "greenhouse",
        externalId: `e2e-${f.key}`,
        title: f.title,
        company: f.company,
        location: "Remote",
        remote: true,
        applyUrl: `https://boards.greenhouse.io/acmee2e/jobs/${f.key}`,
        description: f.description,
        isWorkday: Boolean(f.isWorkday),
        fingerprint: `fp-e2e-${f.key}`,
        postedAt: f.ageDays != null ? new Date(Date.now() - f.ageDays * 864e5) : null,
      },
    });
    await prisma.jobSighting.create({ data: { jobId: job.id, sourceId: source.id } });
    if (f.isWorkday) continue; // Workday jobs are flag-only — no match.
    await prisma.match.create({
      data: {
        jobId: job.id,
        score: f.ruleScore,
        reasons: JSON.stringify(["title matches a target role"]),
        status: "new",
        resumeScore: f.resumeScore,
        resumeReasons: JSON.stringify(["resume skills present: TypeScript, React"]),
        resumeSummary: f.summary ?? null,
        matchProvider: f.provider,
        scoredResumeVersion: resume.id,
        resumeScoredAt: new Date(),
      },
    });
  }

  const jobs = await prisma.job.count();
  const matches = await prisma.match.count();
  console.log(`e2e seed: ${jobs} jobs, ${matches} matches, 1 profile, 1 resume version.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
