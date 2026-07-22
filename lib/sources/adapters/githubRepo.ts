import type { NormalizedJob, RawItem, SourceAdapter, SourceConfig } from "../types";

function str(config: SourceConfig, key: string): string {
  const v = config[key];
  return v == null ? "" : String(v).trim();
}

// Reads a structured JSON listings file from a GitHub repo (e.g. SimplifyJobs
// listings.json). Field names are configurable via `mapping`; defaults match the
// widely-used SimplifyJobs schema.
export const githubRepo: SourceAdapter = {
  kind: "github-repo",
  label: "GitHub repo",
  async fetch(config) {
    const owner = str(config, "owner");
    const repo = str(config, "repo");
    const path = str(config, "path");
    const ref = str(config, "ref") || "HEAD";
    if (!owner || !repo || !path) {
      throw new Error("github-repo: 'owner', 'repo' and 'path' are required");
    }
    const limit = Number(config.limit) > 0 ? Number(config.limit) : Infinity;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.replace(/^\//, "")}`;
    const res = await fetch(rawUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`github-repo: HTTP ${res.status} for ${rawUrl}`);

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("github-repo: file is not valid JSON (README-table parsing not supported)");
    }

    const arr = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>).jobs ??
          (parsed as Record<string, unknown>).listings ??
          (parsed as Record<string, unknown>).data ??
          []);
    const items = (Array.isArray(arr) ? arr : []) as RawItem[];

    const map = (config.mapping as Record<string, string>) ?? {};
    const pick = (it: RawItem, key: string, def: string): unknown => it[map[key] ?? def];

    const out: NormalizedJob[] = [];
    for (const it of items) {
      if (out.length >= limit) break;
      const active = it.active ?? true;
      const visible = it.is_visible ?? true;
      if (active === false || visible === false) continue;

      const applyUrl = pick(it, "url", "url");
      if (!applyUrl) continue;

      const locs = pick(it, "location", "locations");
      const location = Array.isArray(locs) ? locs.join(", ") : ((locs as string) ?? null);
      const posted = pick(it, "postedAt", "date_posted");
      const postedAt =
        posted != null
          ? new Date(typeof posted === "number" ? posted * 1000 : String(posted))
          : null;

      out.push({
        title: String(pick(it, "title", "title") ?? ""),
        company: String(pick(it, "company", "company_name") ?? "Unknown"),
        location,
        remote: /remote/i.test(location ?? ""),
        applyUrl: String(applyUrl),
        postedAt: postedAt && !isNaN(postedAt.getTime()) ? postedAt : null,
        externalId: it.id != null ? String(it.id) : null,
        raw: it,
      });
    }
    return out;
  },
};
