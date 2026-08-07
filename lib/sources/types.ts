// Shared types for the pluggable job-source layer.

export type AtsType =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "icims"
  | "workable"
  | "unknown";

export type SourceKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "github-repo"
  | "rss"
  | "json";

export type SourceConfig = Record<string, unknown>;

// A raw item as returned by an upstream source (loosely typed).
export type RawItem = Record<string, unknown>;

// A source-agnostic, normalized job posting.
export interface NormalizedJob {
  title: string;
  company: string;
  location?: string | null;
  remote?: boolean;
  applyUrl: string;
  description?: string | null;
  postedAt?: Date | null;
  atsType?: AtsType; // optional; detected from applyUrl when omitted
  externalId?: string | null;
  raw?: unknown;
}

// Every source kind implements this. `fetch` performs IO + normalization.
export interface SourceAdapter {
  kind: SourceKind;
  label: string;
  fetch(config: SourceConfig): Promise<NormalizedJob[]>;
}
