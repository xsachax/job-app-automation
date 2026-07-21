import { runScan } from "@/lib/scan";
import { json, errorResponse } from "@/lib/http";

// Trigger a full scan across all enabled sources (used by the dashboard + cron).
export async function POST() {
  try {
    const summary = await runScan();
    return json(summary);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
