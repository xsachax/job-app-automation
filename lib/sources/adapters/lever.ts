import type { NormalizedJob, RawItem, SourceAdapter, SourceConfig } from "../types";

interface LeverJob {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  descriptionPlain?: string;
  workplaceType?: string;
  categories?: { location?: string; team?: string; commitment?: string };
}

function str(config: SourceConfig, key: string): string {
  const v = config[key];
  return v == null ? "" : String(v).trim();
}

export const lever: SourceAdapter = {
  kind: "lever",
  label: "Lever",
  async fetch(config) {
    const company = str(config, "company");
    if (!company) throw new Error("lever: 'company' slug is required");
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`lever: HTTP ${res.status} for company "${company}"`);
    const data = (await res.json()) as LeverJob[];
    const companyName = str(config, "companyName") || company;
    return (data ?? []).map((j): NormalizedJob => {
      const loc = j.categories?.location ?? null;
      return {
        title: j.text ?? "",
        company: companyName,
        location: loc,
        remote: /remote/i.test(loc ?? "") || /remote/i.test(j.workplaceType ?? ""),
        applyUrl: j.hostedUrl ?? j.applyUrl ?? "",
        description: j.descriptionPlain ?? null,
        postedAt: j.createdAt ? new Date(j.createdAt) : null,
        atsType: "lever",
        externalId: j.id ? String(j.id) : null,
        raw: j as RawItem,
      };
    });
  },
};
