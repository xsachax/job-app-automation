import { redirect } from "next/navigation";

// Workday postings now live inline in the unified Jobs list, where the extension
// can assist with required fields without advancing or submitting. This route is
// kept so old bookmarks land on the merged queue instead of a 404.
export default function WorkdayPage() {
  redirect("/jobs");
}
