import type { SourceKind } from "./types";

// Client-safe metadata describing each source kind and its config fields.
// Drives the dynamic "Add source" form. No server-only imports here.

export interface SourceField {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
}

export interface SourceKindMeta {
  kind: SourceKind;
  label: string;
  blurb: string;
  fields: SourceField[];
}

export const SOURCE_KINDS: SourceKindMeta[] = [
  {
    kind: "greenhouse",
    label: "Greenhouse",
    blurb: "Official Greenhouse job-board API for a single company board token.",
    fields: [
      { name: "company", label: "Board token", required: true, placeholder: "figma", help: "The slug in boards.greenhouse.io/<token>" },
      { name: "companyName", label: "Display name", placeholder: "Figma" },
    ],
  },
  {
    kind: "lever",
    label: "Lever",
    blurb: "Official Lever postings API for a single company.",
    fields: [
      { name: "company", label: "Company slug", required: true, placeholder: "palantir", help: "The slug in jobs.lever.co/<slug>" },
      { name: "companyName", label: "Display name", placeholder: "Palantir" },
    ],
  },
  {
    kind: "ashby",
    label: "Ashby",
    blurb: "Official Ashby public job-board API for a single company.",
    fields: [
      { name: "company", label: "Job board name", required: true, placeholder: "ramp", help: "The slug in jobs.ashbyhq.com/<name>" },
      { name: "companyName", label: "Display name", placeholder: "Ramp" },
    ],
  },
  {
    kind: "github-repo",
    label: "GitHub repo",
    blurb: "A repo publishing structured job listings (e.g. a listings.json).",
    fields: [
      { name: "owner", label: "Owner", required: true, placeholder: "SimplifyJobs" },
      { name: "repo", label: "Repo", required: true, placeholder: "New-Grad-Positions" },
      { name: "path", label: "File path", required: true, placeholder: ".github/scripts/listings.json" },
      { name: "ref", label: "Git ref", placeholder: "HEAD" },
      { name: "limit", label: "Max items", placeholder: "200", help: "Optional cap on ingested items" },
    ],
  },
  {
    kind: "rss",
    label: "RSS / Atom feed",
    blurb: "Any RSS or Atom feed of job postings.",
    fields: [
      { name: "url", label: "Feed URL", required: true, placeholder: "https://example.com/jobs.rss" },
      { name: "company", label: "Default company", placeholder: "Unknown" },
    ],
  },
  {
    kind: "json",
    label: "JSON endpoint",
    blurb: "A generic JSON endpoint with configurable field mapping.",
    fields: [
      { name: "url", label: "Endpoint URL", required: true, placeholder: "https://example.com/api/jobs" },
      { name: "itemsPath", label: "Items path", placeholder: "data.jobs", help: "Dot-path to the array, if nested" },
      { name: "company", label: "Default company", placeholder: "Unknown" },
    ],
  },
];

export function kindMeta(kind: string): SourceKindMeta | undefined {
  return SOURCE_KINDS.find((k) => k.kind === kind);
}
