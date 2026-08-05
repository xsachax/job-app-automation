const DAY_MS = 24 * 60 * 60 * 1000;

export interface FreshnessInput {
  postedAt?: Date | string | null;
  firstSeenAt?: Date | string | null;
}

export interface FreshnessFitResult {
  delta: number;
  ageDays: number | null;
  reason: string | null;
  source: "posted" | "first-seen" | null;
}

function timestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function freshnessFit(
  job: FreshnessInput,
  now: Date = new Date(),
): FreshnessFitResult {
  const postedAt = timestamp(job.postedAt);
  const firstSeenAt = timestamp(job.firstSeenAt);
  const effective = postedAt ?? firstSeenAt;
  const source = postedAt != null ? "posted" : firstSeenAt != null ? "first-seen" : null;
  if (effective == null || source == null) {
    return { delta: 0, ageDays: null, reason: null, source: null };
  }

  const ageDays = Math.max(0, (now.getTime() - effective) / DAY_MS);
  const label = source === "posted" ? "Posted" : "First seen";

  if (ageDays <= 1) {
    return { delta: 12, ageDays, reason: `${label} within 24 hours (+12 freshness)`, source };
  }
  if (ageDays <= 3) {
    return { delta: 9, ageDays, reason: `${label} within 3 days (+9 freshness)`, source };
  }
  if (ageDays <= 7) {
    return { delta: 6, ageDays, reason: `${label} within 7 days (+6 freshness)`, source };
  }
  if (ageDays <= 14) {
    return { delta: 3, ageDays, reason: `${label} within 14 days (+3 freshness)`, source };
  }
  if (ageDays <= 30) {
    return { delta: 0, ageDays, reason: null, source };
  }
  return {
    delta: -4,
    ageDays,
    reason: `${label} more than 30 days ago (-4 freshness)`,
    source,
  };
}
