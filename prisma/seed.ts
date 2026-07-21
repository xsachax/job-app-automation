import { prisma } from "../lib/db";
import { saveProfile, saveCriteria, DEFAULT_PROFILE, type ProfileData } from "../lib/settings";
import type { Criteria } from "../lib/matching/score";

// Example sources — all validated against live public ATS endpoints.
// Safe to run: fetching a public job board is read-only.
const SEED_SOURCES: { name: string; kind: string; config: Record<string, unknown> }[] = [
  { name: "Figma (Greenhouse)", kind: "greenhouse", config: { company: "figma", companyName: "Figma" } },
  { name: "GitLab (Greenhouse)", kind: "greenhouse", config: { company: "gitlab", companyName: "GitLab" } },
  { name: "Palantir (Lever)", kind: "lever", config: { company: "palantir", companyName: "Palantir" } },
  { name: "Ramp (Ashby)", kind: "ashby", config: { company: "ramp", companyName: "Ramp" } },
  {
    name: "SimplifyJobs New-Grad (GitHub)",
    kind: "github-repo",
    config: {
      owner: "SimplifyJobs",
      repo: "New-Grad-Positions",
      path: ".github/scripts/listings.json",
      limit: 150,
    },
  },
];

const SEED_CRITERIA: Criteria = {
  titles: ["Software Engineer", "Frontend Engineer", "Full Stack Engineer", "Backend Engineer"],
  locations: [],
  keywords: ["typescript", "react", "node", "python"],
  excludeKeywords: ["clearance", "principal", "staff", "director"],
  remoteOnly: false,
  seniority: [],
};

// Placeholder demo identity so the pipeline works end-to-end out of the box.
// Replace these on the Profile page (or via Refresh Profile from your real resume).
const SEED_PROFILE: ProfileData = {
  ...DEFAULT_PROFILE,
  firstName: "Jordan",
  lastName: "Rivera",
  email: "jordan.rivera@example.com",
  phone: "+1 415 555 0142",
  location: "San Francisco, CA",
  linkedin: "https://linkedin.com/in/jordanrivera",
  github: "https://github.com/jordanrivera",
  website: "https://jordanrivera.dev",
  summary: "Full-stack software engineer focused on TypeScript, React, and Node.js.",
  skills: ["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL"],
  workAuthorized: true,
  requiresSponsorship: false,
  resumeSource: "sample-data/resume.sample.txt",
  resumePath: "sample-data/resume.sample.txt",
  coverLetterTemplate:
    "Dear {{company}} team,\n\nI'm excited to apply for the {{title}} role. My background in " +
    "full-stack TypeScript development lines up well with what you're building.\n\nBest,\n{{firstName}} {{lastName}}",
};

async function main() {
  console.log("Seeding profile + criteria…");
  await saveProfile(SEED_PROFILE);
  await saveCriteria(SEED_CRITERIA);

  console.log("Seeding sources…");
  for (const s of SEED_SOURCES) {
    const existing = await prisma.source.findFirst({ where: { name: s.name, kind: s.kind } });
    if (existing) {
      console.log(`  · exists: ${s.name}`);
      continue;
    }
    await prisma.source.create({
      data: { name: s.name, kind: s.kind, config: JSON.stringify(s.config) },
    });
    console.log(`  + added: ${s.name}`);
  }

  const count = await prisma.source.count();
  console.log(`Done. ${count} source(s) configured.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
