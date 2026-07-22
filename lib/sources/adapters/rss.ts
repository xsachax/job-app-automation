import { XMLParser } from "fast-xml-parser";
import type { NormalizedJob, RawItem, SourceAdapter, SourceConfig } from "../types";

function str(config: SourceConfig, key: string): string {
  const v = config[key];
  return v == null ? "" : String(v).trim();
}

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o["#text"] === "string") return o["#text"] as string;
  }
  return "";
}

// Parses RSS 2.0 and Atom feeds of job postings.
export const rss: SourceAdapter = {
  kind: "rss",
  label: "RSS / Atom feed",
  async fetch(config) {
    const url = str(config, "url");
    if (!url) throw new Error("rss: 'url' is required");
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    });
    if (!res.ok) throw new Error(`rss: HTTP ${res.status} for ${url}`);
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const doc = parser.parse(xml) as Record<string, unknown>;

    const rssRoot = doc.rss as { channel?: Record<string, unknown> } | undefined;
    const atomRoot = doc.feed as Record<string, unknown> | undefined;

    let items: RawItem[] = [];
    if (rssRoot?.channel) {
      const item = rssRoot.channel.item;
      items = (Array.isArray(item) ? item : item ? [item] : []) as RawItem[];
    } else if (atomRoot) {
      const entry = atomRoot.entry;
      items = (Array.isArray(entry) ? entry : entry ? [entry] : []) as RawItem[];
    }

    const companyDefault = str(config, "company") || "Unknown";
    return items
      .map((it): NormalizedJob => {
        const rawLink = it.link;
        let link = "";
        if (typeof rawLink === "string") link = rawLink;
        else if (rawLink && typeof rawLink === "object") {
          const o = rawLink as Record<string, unknown>;
          link = String(o["@_href"] ?? o.href ?? "");
        }
        const dateStr = (it.pubDate ?? it.published ?? it.updated) as string | undefined;
        const postedAt = dateStr ? new Date(dateStr) : null;
        return {
          title: text(it.title),
          company: companyDefault,
          location: null,
          applyUrl: link,
          description: text(it.description) || text(it.summary) || null,
          postedAt: postedAt && !isNaN(postedAt.getTime()) ? postedAt : null,
          raw: it,
        };
      })
      .filter((j) => j.applyUrl && j.title);
  },
};
