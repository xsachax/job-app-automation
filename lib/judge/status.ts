// Shared vocabulary for the Judge hub (/judge) and its status API.
//
// Company tier selects the primary score band; the remaining axes position a
// posting within that band.
// These bands/labels are the single source of truth so the page, the badges,
// and the status counts can never drift apart.

export const STRONG_MIN = 70;
export const POSSIBLE_MIN = 40;

export type FitBand = "strong" | "possible" | "weak";

export interface BandMeta {
  key: FitBand;
  label: string;
  min: number;
  /** Tailwind classes for the distribution bar segment and its legend dot. */
  bar: string;
  dot: string;
}

// Ordered strongest → weakest (the order the distribution bar renders in).
export const FIT_BANDS: BandMeta[] = [
  { key: "strong", label: "Strong fit", min: STRONG_MIN, bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "possible", label: "Possible fit", min: POSSIBLE_MIN, bar: "bg-amber-400", dot: "bg-amber-400" },
  { key: "weak", label: "Weak fit", min: 0, bar: "bg-gray-300 dark:bg-gray-600", dot: "bg-gray-400 dark:bg-gray-500" },
];

// Bucket a stored fitScore. `null`/`undefined` means the posting hasn't been
// judged yet — a distinct state from a low score.
export function bucketScore(score: number | null | undefined): FitBand | "unscored" {
  if (score == null) return "unscored";
  if (score >= STRONG_MIN) return "strong";
  if (score >= POSSIBLE_MIN) return "possible";
  return "weak";
}

export interface JudgeAxis {
  key: string;
  name: string;
  reads: string;
  effect: string;
}

// Scoring axes in the order they apply. Mirrors scoreAllJobs().
export const JUDGE_AXES: JudgeAxis[] = [
  {
    key: "company",
    name: "Company tier",
    reads: "Your S–F ranking for the hiring company. Unrated companies use the E band.",
    effect: "Primary band: S 84–97 … F 0–13",
  },
  {
    key: "golden",
    name: "Golden job",
    reads: "Saved title and precise description phrases from Settings",
    effect: "A match applies a 95 floor after tier banding; the 97 maximum remains",
  },
  {
    key: "resume",
    name: "Résumé fit",
    reads: "Skills, prior titles, and summary from your résumé matched against the posting",
    effect: "Position within company band",
  },
  {
    key: "experience",
    name: "Experience",
    reads: "Saved relevant experience compared with the posting's minimum requirement",
    effect: "Moves within company band",
  },
  {
    key: "freshness",
    name: "Date posted",
    reads: "The posting date, falling back to when the job was first discovered",
    effect: "Moves within company band",
  },
  {
    key: "location",
    name: "Location tier",
    reads: "Your S–F ranking for the role's city or region. Unrated locations stay neutral, the same as E.",
    effect: "Moves within company band",
  },
  {
    key: "salary",
    name: "Pay vs. target",
    reads: "Listed compensation against your target salary (missing pay stays neutral)",
    effect: "Moves within company band",
  },
];
