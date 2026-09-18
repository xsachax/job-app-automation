import snapshot from "@/sample-data/community-rankings.json";
import { TIERS, type TierAssignment, type TierListKind } from "./tiers";

export const COMMUNITY_RANKINGS = snapshot;

export function communityTierAssignments(kind: TierListKind): TierAssignment[] {
  return TIERS.flatMap((tier) =>
    COMMUNITY_RANKINGS[kind][tier].map((key) => ({ key, tier })),
  );
}
