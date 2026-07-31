import { redirect } from "next/navigation";

// Workday postings now live inline in the unified Jobs list (badged, filterable
// via the "Platform" facet, and never auto-applied). This route is kept only so
// old bookmarks/links land on the merged queue instead of a 404.
export default function WorkdayPage() {
  redirect("/jobs");
}
