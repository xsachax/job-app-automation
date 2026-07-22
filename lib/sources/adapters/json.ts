import type { NormalizedJob, RawItem, SourceAdapter, SourceConfig } from "../types";

function str(config: SourceConfig, key: string): string {
  const v = config[key];
  return v == null ? "" : String(v).trim();
}

// Generic JSON endpoint adapter with configurable item path + field mapping.
export const json: SourceAdapter = {
  kind: "json",
  label: "JSON endpoint",
  async fetch(config) {
    const url = str(config, "url");
    if (!url) throw new Error("json: 'url' is required");
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`json: HTTP ${res.status} for ${url}`);
    const data = (await res.json()) as unknown;

    const itemsPath = str(config, "itemsPath");
    let node: unknown = data;
    if (itemsPath) {
      for (const p of itemsPath.split(".")) {
        node = node == null ? undefined : (node as Record<string, unknown>)[p];
      }
    }
    let items: RawItem[];
    if (Array.isArray(node)) {
      items = node as RawItem[];
    } else if (Array.isArray(data)) {
      items = data as RawItem[];
    } else {
      const d = data as Record<string, unknown>;
      items = ((d.jobs ?? d.results ?? d.data ?? []) as RawItem[]) ?? [];
    }

    const map = (config.mapping as Record<string, string>) ?? {};
    const pick = (it: RawItem, key: string, defs: string[]): unknown => {
      if (map[key]) return it[map[key]];
      for (const d of defs) if (it[d] != null) return it[d];
      return undefined;
    };
    const companyDefault = str(config, "company");

    return (items ?? [])
      .map((it): NormalizedJob => {
        const applyUrl = pick(it, "url", ["url", "applyUrl", "apply_url", "link", "absolute_url"]);
        const posted = pick(it, "postedAt", ["postedAt", "date_posted", "created_at", "publishedAt"]);
        const postedAt = posted != null ? new Date(String(posted)) : null;
        return {
          title: String(pick(it, "title", ["title", "text", "name"]) ?? ""),
          company: String(companyDefault || pick(it, "company", ["company", "company_name", "org"]) || "Unknown"),
          location: (pick(it, "location", ["location", "locations", "city"]) as string) ?? null,
          applyUrl: String(applyUrl ?? ""),
          postedAt: postedAt && !isNaN(postedAt.getTime()) ? postedAt : null,
          raw: it,
        };
      })
      .filter((j) => j.applyUrl && j.title);
  },
};
