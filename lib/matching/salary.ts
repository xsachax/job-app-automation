// Salary axis for the resume judge.
//
// Deterministic, dependency-free comparison of a posting's stated compensation
// against the user's target salary. Returns a bounded score delta the judge adds
// on top of the resume-fit score (like the company-tier modifier), plus a
// human-readable reason. When the posting lists no salary, or no target is set,
// the axis stays neutral (delta 0) so it never penalizes missing data.

export interface SalaryInput {
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
}

export interface SalaryFitResult {
  delta: number; // score adjustment, roughly -15..+12
  known: boolean; // whether the posting listed a usable salary
  reason: string | null; // human-readable explanation, or null when neutral
}

// Rough CAD -> USD factor so a Canadian posting can be compared against a
// USD-denominated target without pretending the numbers are identical.
const CAD_TO_USD = 0.73;

function numeric(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

/**
 * Compare a posting's salary to the user's target (assumed USD).
 *
 * Uses the midpoint of the stated range (or whichever bound is present) and maps
 * the ratio to a bounded delta:
 *   >= 1.20  -> +12  (well above target)
 *   >= 1.00  ->  +8  (meets/exceeds target)
 *   >= 0.85  ->   0  (near target — neutral)
 *   >= 0.70  ->  -8  (below target)
 *   <  0.70  -> -15  (well below target)
 */
export function salaryFit(
  job: SalaryInput,
  targetUsd: number | null | undefined,
): SalaryFitResult {
  const target = numeric(targetUsd);
  if (target == null) return { delta: 0, known: false, reason: null };

  const min = numeric(job.salaryMin);
  const max = numeric(job.salaryMax);
  if (min == null && max == null) {
    return { delta: 0, known: false, reason: null };
  }

  let value = min != null && max != null ? (min + max) / 2 : (max ?? min)!;
  const currency = (job.salaryCurrency || "").toUpperCase();
  if (currency === "CAD") value *= CAD_TO_USD;

  const ratio = value / target;
  const pay = fmtUsd(value);
  const goal = fmtUsd(target);

  if (ratio >= 1.2) return { delta: 12, known: true, reason: `pay ~${pay} is well above your ${goal} target` };
  if (ratio >= 1.0) return { delta: 8, known: true, reason: `pay ~${pay} meets your ${goal} target` };
  if (ratio >= 0.85) return { delta: 0, known: true, reason: `pay ~${pay} is near your ${goal} target` };
  if (ratio >= 0.7) return { delta: -8, known: true, reason: `pay ~${pay} is below your ${goal} target` };
  return { delta: -15, known: true, reason: `pay ~${pay} is well below your ${goal} target` };
}
