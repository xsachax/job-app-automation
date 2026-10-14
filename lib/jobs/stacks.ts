import { canonicalCompanyKey } from "../company-names";

interface StackableJob {
  id: string;
  company: string;
  title: string;
  country: string | null;
  employmentType: string | null;
}

export interface JobStack<T> {
  key: string;
  jobs: [T, ...T[]];
}

function titleKey(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bsr\b\.?/g, "senior")
    .replace(/\bjr\b\.?/g, "junior")
    .replace(/\bswe\b/g, "software engineer")
    .replace(/\beng\b\.?/g, "engineer")
    .replace(/\bfront[\s-]+end\b/g, "frontend")
    .replace(/\bback[\s-]+end\b/g, "backend")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");
}

// Keep levels, specialties, years and technologies (including C++/C#).
// Stacking is presentation only; each requisition keeps its own job record.
export function groupSimilarJobs<T extends StackableJob>(
  jobs: readonly T[],
): JobStack<T>[] {
  const stacks = new Map<string, JobStack<T>>();
  for (const job of jobs) {
    const company = canonicalCompanyKey(job.company);
    const title = titleKey(job.title);
    const key = company && title
      ? JSON.stringify([company, title, job.country, job.employmentType])
      : JSON.stringify(["ungrouped", job.id]);
    const existing = stacks.get(key);
    if (existing) existing.jobs.push(job);
    else stacks.set(key, { key, jobs: [job] });
  }
  return [...stacks.values()];
}
