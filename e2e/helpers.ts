import { type Page } from "@playwright/test";
import type { Job } from "../app/components/jobs/types";

// Locate the Jobs-page card (an <article>) for a specific posting by its title link.
export function jobCard(page: Page, title: string) {
  return page
    .getByRole("article")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) })
    .first();
}

export function makeDiscoveryJobs(count: number): Job[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => ({
    id: `pager-${index}`,
    title: `Pager Role ${index}`,
    company: `PagerCo ${index}`,
    location: "Remote, US",
    applyUrl: `https://boards.greenhouse.io/pagerco/jobs/${index}`,
    atsType: "greenhouse",
    isWorkday: false,
    remote: true,
    country: "US",
    category: "startup",
    minYoE: 0,
    discoverySystem: "greenhouse",
    postedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    availabilityStatus: "open",
    consecutiveMisses: 0,
    lastVerifiedAt: null,
    lastVerificationResult: null,
    closedAt: null,
    closureReason: null,
    applicationStatus: "none",
    appliedAt: null,
    fitScore: null,
    fitProvider: null,
    fitSummary: null,
    fitReasons: [],
    isGolden: false,
    goldenMatch: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryRaw: null,
    sponsorship: null,
    skills: [],
    employmentType: null,
    sightings: [],
  }));
}
