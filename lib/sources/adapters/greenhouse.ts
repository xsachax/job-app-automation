import type { NormalizedJob, RawItem, SourceAdapter, SourceConfig } from "../types";

interface GhJob {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  content?: string;
  location?: { name?: string };
}

function str(config: SourceConfig, key: string): string {
  const v = config[key];
  return v == null ? "" : String(v).trim();
}

export const greenhouse: SourceAdapter = {
  kind: "greenhouse",
  label: "Greenhouse",
  async fetch(config) {
    const company = str(config, "company");
    if (!company) throw new Error("greenhouse: 'company' (board token) is required");
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs?content=true`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`greenhouse: HTTP ${res.status} for board "${company}"`);
    const data = (await res.json()) as { jobs?: GhJob[] };
    const companyName = str(config, "companyName") || company;
    return (data.jobs ?? []).map((j): NormalizedJob => {
      const loc = j.location?.name ?? null;
      return {
        title: j.title ?? "",
        company: companyName,
        location: loc,
        remote: /remote/i.test(loc ?? ""),
        applyUrl: j.absolute_url ?? "",
        description: typeof j.content === "string" ? j.content : null,
        postedAt: j.updated_at ? new Date(j.updated_at) : null,
        atsType: "greenhouse",
        externalId: j.id != null ? String(j.id) : null,
        raw: j as RawItem,
      };
    });
  },
};
