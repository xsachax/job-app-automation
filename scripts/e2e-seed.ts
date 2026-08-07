import { prisma } from "../lib/db";
import { buildConnectionSet, saveConnectionSet } from "../lib/connections/store";
import { parseConnectionsCsv } from "../lib/connections/parse";

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
  await prisma.connectionSet.deleteMany();
  await prisma.companyTier.deleteMany();
  await prisma.locationTier.deleteMany();
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
  skills?: string[];
  location?: string; // raw posting location; defaults by country
  salaryMin?: number;
  salaryMax?: number;
  salaryRaw?: string;
  sponsorship?: string;
  employmentType?: string;
  fitScore?: number;
  fitProvider?: string;
  fitSummary?: string;
  fitReasons?: string[];
}

const JOBS: Fixture[] = [
  {
    key: "frontend",
    title: "E2E Frontend Engineer",
    company: "OpenAI",
    description: "Build UI with TypeScript, React and Node.js. New grad friendly.",
    country: "US",
    minYoE: 0,
    system: "greenhouse",
    ageDays: 0,
    skills: ["TypeScript", "React", "Node.js"],
    location: "San Francisco, CA",
    salaryMin: 120000,
    salaryMax: 150000,
    salaryRaw: "$120,000 - $150,000",
    sponsorship: "offers",
    employmentType: "fulltime",
    fitScore: 88,
    fitProvider: "deterministic",
    fitSummary: "Prioritize this application while the posting is fresh.",
    fitReasons: [
      "Fit: Matches résumé skills: TypeScript, React, and Node.js",
      "Fit: Posted within 24 hours (+12 freshness)",
      "Gap: Confirm any team-specific experience requirements",
    ],
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
    skills: ["TypeScript", "PostgreSQL"],
    location: "New York, NY",
    fitScore: 64,
    fitProvider: "deterministic",
    fitReasons: [
      "Fit: Matches résumé skills: TypeScript and PostgreSQL",
      "Gap: One year of professional experience may need confirmation",
    ],
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
    skills: ["Node.js", "Go"],
    location: "Austin, TX",
    sponsorship: "none",
    fitScore: 41,
    fitProvider: "deterministic",
    fitReasons: [
      "Fit: Node.js overlaps with the saved résumé",
      "Gap: Go is not shown on the saved résumé",
    ],
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
    key: "defense",
    title: "E2E Defense Engineer",
    company: "Anduril",
    description: "Autonomy software in C++ and Rust for defense systems.",
    country: "US",
    minYoE: 1,
    system: "greenhouse",
    ageDays: 1,
    skills: ["C++", "Rust"],
    fitScore: 55,
    fitProvider: "deterministic",
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
    skills: ["Python", "AWS"],
    salaryMin: 90000,
    salaryMax: 110000,
    salaryRaw: "CA$90,000 - CA$110,000",
    fitScore: 72,
    fitProvider: "agent",
    fitSummary: "Worth applying after confirming the cloud requirements.",
    fitReasons: [
      "Fit: Python experience transfers directly to this role",
      "Gap: AWS depth is not clear from the saved résumé",
    ],
  },
  {
    key: "workday",
    title: "E2E Workday Engineer",
    company: "WorkdayOnlyE2E",
    description: "Enterprise role behind Workday.",
    country: "US",
    minYoE: null,
    system: "workday",
    isWorkday: true,
    entryLevel: true,
    skills: ["Java", "Spring"],
    location: "Denver, CO",
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
        location: f.location ?? (f.country === "CA" ? "Toronto, Canada" : "Remote, US"),
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
        skills: f.skills ? JSON.stringify(f.skills) : null,
        salaryMin: f.salaryMin ?? null,
        salaryMax: f.salaryMax ?? null,
        salaryCurrency: f.salaryMin != null ? (f.country === "CA" ? "CAD" : "USD") : null,
        salaryRaw: f.salaryRaw ?? null,
        sponsorship: f.sponsorship ?? null,
        employmentType: f.employmentType ?? null,
        fitScore: f.fitScore ?? null,
        fitProvider: f.fitProvider ?? null,
        fitSummary: f.fitSummary ?? null,
        fitReasons: f.fitScore != null ? JSON.stringify(f.fitReasons ?? []) : null,
        fitScoredAt: f.fitScore != null ? new Date() : null,
      },
    });
    await prisma.jobSighting.create({ data: { jobId: job.id, sourceId: source.id } });
  }

  const jobs = await prisma.job.count();
  const us = await prisma.job.count({ where: { country: "US", isEntryLevel: true } });
  const ca = await prisma.job.count({ where: { country: "CA", isEntryLevel: true } });

  // Eight connections at OpenAI exercise both the initial badge sample and the
  // lazy full-contact tooltip. AcmeE2E/MapleE2E stay unmatched.
  const connCsv = [
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    "Ada,Lovelace,https://linkedin.com/in/ada-e2e,,OpenAI,Research Engineer,01 Jan 2024",
    "Alan,Turing,https://linkedin.com/in/alan-e2e,,OpenAI Inc.,Member of Technical Staff,02 Feb 2024",
    "Grace,Hopper,https://linkedin.com/in/grace-e2e,,OpenAI,Principal Engineer,03 Mar 2024",
    "Katherine,Johnson,https://linkedin.com/in/katherine-e2e,,OpenAI,Research Scientist,04 Apr 2024",
    "Margaret,Hamilton,https://linkedin.com/in/margaret-e2e,,OpenAI,Engineering Manager,05 May 2024",
    "Barbara,Liskov,https://linkedin.com/in/barbara-e2e,,OpenAI,Distinguished Engineer,06 Jun 2024",
    "Donald,Knuth,https://linkedin.com/in/donald-e2e,,OpenAI,Researcher,07 Jul 2024",
    "Edsger,Dijkstra,https://linkedin.com/in/edsger-e2e,,OpenAI,Computer Scientist,08 Aug 2024",
  ].join("\n");
  await saveConnectionSet(buildConnectionSet(parseConnectionsCsv(connCsv).connections));

  // Pre-rank one seeded company so the tier list renders an assigned row on load
  // and the persistence e2e has a known starting point.
  await prisma.companyTier.create({ data: { company: "OpenAI", tier: "S" } });

  // Pre-rank one seeded location (the "frontend" fixture is in San Francisco) so
  // the location tier list renders an assigned row on load.
  await prisma.locationTier.create({ data: { location: "San Francisco, CA", tier: "S" } });

  console.log(`e2e seed: ${jobs} jobs (${us} US entry, ${ca} CA entry, 1 workday flag), 8 connections.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
