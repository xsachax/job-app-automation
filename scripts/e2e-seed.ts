import { prisma } from "../lib/db";

// Deterministic, network-free fixtures for the Playwright e2e suite.
// Wipes the target database (DATABASE_URL — an isolated e2e.db) and inserts a
// fixed set of discovery jobs (US + CA entry-level, plus one Workday flag-only)
// so the dashboard flows (US/CA queues, date filter, Workday list) are
// reproducible.

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
  country: "US" | "CA";
  minYoE: number | null;
  system: string;
  isWorkday?: boolean;
  entryLevel?: boolean; // defaults true for non-workday fixtures
  ageDays?: number; // how long ago the job was posted (drives the date filter)
}

const JOBS: Fixture[] = [
  {
    key: "frontend",
    title: "E2E Frontend Engineer",
    company: "AcmeE2E",
    description: "Build UI with TypeScript, React and Node.js. New grad friendly.",
    country: "US",
    minYoE: 0,
    system: "greenhouse",
    ageDays: 0,
  },
  {
    key: "apply",
    title: "E2E Apply Engineer",
    company: "AcmeE2E",
    description: "Full-stack role using TypeScript and PostgreSQL. 1+ years.",
    country: "US",
    minYoE: 1,
    system: "ashby",
    ageDays: 0,
  },
  {
    key: "reject",
    title: "E2E Backend Engineer",
    company: "AcmeE2E",
    description: "Backend services in Node.js. Up to 2 years experience.",
    country: "US",
    minYoE: 2,
    system: "greenhouse",
    ageDays: 2,
  },
  {
    key: "staff",
    title: "E2E Staff Engineer",
    company: "AcmeE2E",
    description: "Lead platform work across TypeScript and infra.",
    country: "US",
    minYoE: null,
    system: "amazon",
    ageDays: 10,
  },
  {
    key: "canada",
    title: "E2E Canada Engineer",
    company: "MapleE2E",
    description: "Software engineer, new grad, based in Toronto.",
    country: "CA",
    minYoE: 0,
    system: "greenhouse",
    ageDays: 1,
  },
  {
    key: "workday",
    title: "E2E Workday Engineer",
    company: "AcmeE2E",
    description: "Enterprise role behind Workday.",
    country: "US",
    minYoE: null,
    system: "workday",
    isWorkday: true,
    entryLevel: false,
  },
];

async function main() {
  await wipe();

  const source = await prisma.source.create({
    data: { name: "E2E Fixture Source", kind: "json", config: "{}", enabled: false },
  });

  for (const f of JOBS) {
    const job = await prisma.job.create({
      data: {
        dedupeKey: `${f.system}:e2e-${f.key}`,
        atsType: f.system,
        externalId: `e2e-${f.key}`,
        title: f.title,
        company: f.company,
        location: f.country === "CA" ? "Toronto, Canada" : "Remote, US",
        remote: true,
        applyUrl: `https://boards.greenhouse.io/acmee2e/jobs/${f.key}`,
        description: f.description,
        isWorkday: Boolean(f.isWorkday),
        country: f.country,
        isEntryLevel: f.entryLevel ?? !f.isWorkday,
        minYoE: f.minYoE,
        discoverySystem: f.system,
        fingerprint: `fp-e2e-${f.key}`,
        postedAt: f.ageDays != null ? new Date(Date.now() - f.ageDays * 864e5) : null,
      },
    });
    await prisma.jobSighting.create({ data: { jobId: job.id, sourceId: source.id } });
  }

  const jobs = await prisma.job.count();
  const us = await prisma.job.count({ where: { country: "US", isEntryLevel: true, isWorkday: false } });
  const ca = await prisma.job.count({ where: { country: "CA", isEntryLevel: true, isWorkday: false } });
  console.log(`e2e seed: ${jobs} jobs (${us} US entry, ${ca} CA entry, 1 workday flag).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
