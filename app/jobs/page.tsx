import { getDiscoveryScopeCopy } from "@/lib/discovery/scope";
import JobsPageClient from "./JobsPageClient";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const scope = await getDiscoveryScopeCopy();
  return <JobsPageClient scopeSummary={scope.summary} />;
}
