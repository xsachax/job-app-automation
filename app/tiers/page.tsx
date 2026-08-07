"use client";

import { TierBoard, type TierItem } from "../components/TierBoard";
import { CompanyLogo } from "../components/CompanyLogo";
import { COMPANY_TIER_SCORE_HINTS } from "@/lib/judge/scoring";

export default function TiersPage() {
  return (
    <TierBoard
      title="Company tiers"
      subtitle="Rank employers S→F. Company tier sets the job's primary score band; résumé and contextual signals only position it within that band."
      endpoint="/api/tiers"
      itemsKey="companies"
      field="company"
      noun="companies"
      emptyPool="No companies discovered yet."
      searchPlaceholder="Search companies…"
      searchAriaLabel="Search unrated companies"
      renderIcon={(item: TierItem) => <CompanyLogo company={item.key} size={20} />}
      countLabel={(count) => `${count} open role${count === 1 ? "" : "s"}`}
      tierHints={COMPANY_TIER_SCORE_HINTS}
      poolNote="Unrated companies use the E-tier score band."
    />
  );
}
