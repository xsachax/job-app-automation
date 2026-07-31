import type { JobCategory } from "@/lib/discovery/categories";

export type Country = "US" | "CA";
export type SortKey = "posted" | "company" | "fit" | "salary";
export type SinceKey = "24h" | "7d" | "30d" | "all";
export type ApplicationStatus = "none" | "saved" | "applied" | "interviewing" | "offer" | "rejected" | "dismissed";
export type SponsorshipValue = "offers" | "none" | "citizenship" | "unknown";
export type EmploymentType = "fulltime" | "intern" | "contract";

export interface JobSource {
  id: string;
  name: string;
  kind: string;
}

export interface Sighting {
  source: JobSource;
}

export interface JobConnectionContact {
  name: string;
  position: string;
  url: string;
}

export interface JobConnections {
  count: number;
  contacts: JobConnectionContact[];
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  applyUrl: string;
  atsType: string;
  isWorkday: boolean;
  remote: boolean;
  country: Country | string | null;
  category: JobCategory;
  minYoE: number | null;
  discoverySystem: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  applicationStatus: ApplicationStatus;
  appliedAt: string | null;
  fitScore: number | null;
  fitProvider: "deterministic" | "agent" | null;
  fitSummary: string | null;
  fitReasons: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: "USD" | "CAD" | null;
  salaryRaw: string | null;
  sponsorship: SponsorshipValue | null;
  skills: string[];
  employmentType: EmploymentType | null;
  connections?: JobConnections;
  sightings: Sighting[];
}

export interface FacetItem {
  value: string;
  count: number;
}

export interface JobFacets {
  skills: FacetItem[];
  sources: FacetItem[];
  categories: FacetItem[];
  sponsorship: FacetItem[];
  employmentType: FacetItem[];
  platforms: FacetItem[];
  statuses: FacetItem[];
  maxSalary: number;
  withConnections: number;
  total: number;
}

export interface FilterState {
  sort: SortKey;
  since: SinceKey;
  q: string;
  skills: string[];
  sponsorship: string[];
  employmentType: string[];
  platform: string[];
  source: string[];
  category: string[];
  status: string[];
  remote: boolean;
  warmIntro: boolean;
  salaryMin: number | null;
  fitMin: number | null;
}

export type MultiFilterKey =
  | "skills"
  | "sponsorship"
  | "employmentType"
  | "platform"
  | "source"
  | "category"
  | "status";

export const DEFAULT_FILTERS: FilterState = {
  sort: "posted",
  since: "all",
  q: "",
  skills: [],
  sponsorship: [],
  employmentType: [],
  platform: [],
  source: [],
  category: [],
  status: [],
  remote: false,
  warmIntro: false,
  salaryMin: null,
  fitMin: null,
};
