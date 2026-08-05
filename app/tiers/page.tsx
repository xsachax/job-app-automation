"use client";

import { TierBoard, type TierItem } from "../components/TierBoard";
import { CompanyLogo } from "../components/CompanyLogo";

export default function TiersPage() {
  return (
    <TierBoard
      title="Company tiers"
      subtitle="Rank employers S→F. Tiers nudge each company's fit score so preferred names float to the top of your queue. Companies you leave unrated stay neutral, the same as E tier."
      endpoint="/api/tiers"
      itemsKey="companies"
      field="company"
      noun="companies"
      emptyPool="No companies discovered yet."
      searchPlaceholder="Search companies…"
      searchAriaLabel="Search unrated companies"
      renderIcon={(item: TierItem) => <CompanyLogo company={item.key} size={20} />}
      countLabel={(count) => `${count} open role${count === 1 ? "" : "s"}`}
      poolNote="Unrated companies stay neutral at the same score as E tier."
    />
  );
}
