import { prisma } from "@/lib/db";
import { json, errorResponse } from "@/lib/http";
import { getCriteria, getProfile } from "@/lib/settings";
import { buildResumeContext } from "@/lib/judge/judge";
import { STRONG_MIN, POSSIBLE_MIN } from "@/lib/judge/status";
import { ACTIVE_JOB_WHERE } from "@/lib/jobs/availability";
import { canonicalJudgeProvider } from "@/lib/judge/provider";
import { getJudgeProviderPublicSettings } from "@/lib/judge/server";

export const dynamic = "force-dynamic";

export interface JudgeStatus {
  eligible: number;
  scored: number;
  unscored: number;
  providerCounts: {
    deterministic: number;
    copilot: number;
    openai: number;
    anthropic: number;
  };
  providerStatus: Awaited<ReturnType<typeof getJudgeProviderPublicSettings>>;
  avgScore: number | null;
  lastScoredAt: string | null;
  distribution: { strong: number; possible: number; weak: number; unscored: number };
  companyTiers: number;
  locationTiers: number;
  resume: { url: string; skills: number; titles: number; hasSummary: boolean };
  salaryTarget: number | null;
}

// GET /api/judge/status — a single snapshot powering the Judge hub: how many
// postings are scored, the fit-band distribution, which tier lists and résumé
// signals feed the score, and the current salary target. Counts run over the
// same entry-level population the judge scores, regardless of application platform.
export async function GET() {
  try {
    const base = { isEntryLevel: true, ...ACTIVE_JOB_WHERE } as const;

    const [eligible, scored, strong, possible, providerGroups, avgAgg, lastAgg, companyTiers, locationTiers, criteria, profile, providerStatus] =
      await Promise.all([
        prisma.job.count({ where: base }),
        prisma.job.count({ where: { ...base, fitScore: { not: null } } }),
        prisma.job.count({ where: { ...base, fitScore: { gte: STRONG_MIN } } }),
        prisma.job.count({ where: { ...base, fitScore: { gte: POSSIBLE_MIN, lt: STRONG_MIN } } }),
        prisma.job.groupBy({
          by: ["fitProvider"],
          where: { ...base, fitScore: { not: null } },
          _count: { _all: true },
        }),
        prisma.job.aggregate({ where: { ...base, fitScore: { not: null } }, _avg: { fitScore: true } }),
        prisma.job.aggregate({ where: base, _max: { fitScoredAt: true } }),
        prisma.companyTier.count(),
        prisma.locationTier.count(),
        getCriteria(),
        getProfile(),
        getJudgeProviderPublicSettings(),
      ]);

    const weak = Math.max(0, scored - strong - possible);
    const unscored = Math.max(0, eligible - scored);
    const resume = buildResumeContext(profile);
    const providerCounts = {
      deterministic: 0,
      copilot: 0,
      openai: 0,
      anthropic: 0,
    };
    for (const group of providerGroups) {
      const provider = canonicalJudgeProvider(group.fitProvider);
      if (provider) providerCounts[provider] += group._count._all;
    }

    const status: JudgeStatus = {
      eligible,
      scored,
      unscored,
      providerCounts,
      providerStatus,
      avgScore: avgAgg._avg.fitScore != null ? Math.round(avgAgg._avg.fitScore) : null,
      lastScoredAt: lastAgg._max.fitScoredAt ? lastAgg._max.fitScoredAt.toISOString() : null,
      distribution: { strong, possible, weak, unscored },
      companyTiers,
      locationTiers,
      resume: {
        url: typeof profile.resumeUrl === "string" ? profile.resumeUrl : "",
        skills: resume.skills?.length ?? 0,
        titles: resume.titles?.length ?? 0,
        hasSummary: Boolean(resume.summary),
      },
      salaryTarget: typeof criteria.salaryTarget === "number" ? criteria.salaryTarget : null,
    };

    return json(status);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
