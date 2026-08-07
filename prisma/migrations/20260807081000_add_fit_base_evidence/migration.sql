ALTER TABLE "Job" ADD COLUMN "fitBaseReasons" TEXT;
ALTER TABLE "Job" ADD COLUMN "fitBaseSummary" TEXT;

-- Legacy agent scores included freshness. Recover unclipped base scores using
-- the score timestamp; boundary scores cannot be recovered after old clamping.
UPDATE "Job"
SET
  "fitBaseScore" = MAX(
    0,
    MIN(
      100,
      "fitScore" -
        CASE
          WHEN "fitScoredAt" IS NULL OR COALESCE("postedAt", "firstSeenAt") IS NULL THEN 0
          WHEN MAX(0, ("fitScoredAt" - COALESCE("postedAt", "firstSeenAt")) / 86400000.0) <= 1 THEN 12
          WHEN MAX(0, ("fitScoredAt" - COALESCE("postedAt", "firstSeenAt")) / 86400000.0) <= 3 THEN 9
          WHEN MAX(0, ("fitScoredAt" - COALESCE("postedAt", "firstSeenAt")) / 86400000.0) <= 7 THEN 6
          WHEN MAX(0, ("fitScoredAt" - COALESCE("postedAt", "firstSeenAt")) / 86400000.0) <= 14 THEN 3
          WHEN MAX(0, ("fitScoredAt" - COALESCE("postedAt", "firstSeenAt")) / 86400000.0) <= 30 THEN 0
          ELSE -4
        END
    )
  ),
  "fitBaseReasons" = "fitReasons",
  "fitBaseSummary" = "fitSummary"
WHERE
  "fitProvider" = 'agent'
  AND "fitScore" > 0
  AND "fitScore" < 100;

-- Every legacy final score used the old additive model. Clear it so the next
-- judge run cannot display an out-of-band value. Recoverable agent evidence is
-- retained; clipped agent scores are explicitly returned to deterministic review.
UPDATE "Job"
SET
  "fitScore" = NULL,
  "fitProvider" = CASE
    WHEN "fitProvider" = 'agent' AND "fitBaseScore" IS NOT NULL THEN 'agent'
    ELSE NULL
  END,
  "fitReasons" = CASE
    WHEN "fitProvider" = 'agent' AND "fitBaseScore" IS NOT NULL THEN "fitReasons"
    ELSE NULL
  END,
  "fitSummary" = CASE
    WHEN "fitProvider" = 'agent' AND "fitBaseScore" IS NOT NULL THEN "fitSummary"
    ELSE NULL
  END,
  "fitScoredAt" = NULL
WHERE "fitScore" IS NOT NULL;
