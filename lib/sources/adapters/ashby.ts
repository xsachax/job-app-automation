import type { NormalizedJob, RawItem, SourceAdapter, SourceConfig } from "../types";

interface AshbyJob {
  id?: string;
  title?: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  isListed?: boolean;
}

function str(config: SourceConfig, key: string): string {
  const v = config[key];
  return v == null ? "" : String(v).trim();
}

export const ashby: SourceAdapter = {
  kind: "ashby",
  label: "Ashby",
  async fetch(config) {
    const company = str(config, "company");
    if (!company) throw new Error("ashby: 'company' (job board name) is required");
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}?includeCompensation=true`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`ashby: HTTP ${res.status} for board "${company}"`);
    const data = (await res.json()) as { jobs?: AshbyJob[] };
    const companyName = str(config, "companyName") || company;
    return (data.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j): NormalizedJob => ({
        title: j.title ?? "",
        company: companyName,
        location: j.location ?? null,
        remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType ?? ""),
        applyUrl: j.applyUrl ?? j.jobUrl ?? "",
        description: j.descriptionPlain ?? null,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
        atsType: "ashby",
        externalId: j.id ? String(j.id) : null,
        raw: j as RawItem,
      }));
  },
};
