import { rescoreResumeFit } from "@/lib/matching/agent";
import { json, errorResponse } from "@/lib/http";

// Recompute the deterministic resume-fit baseline for every active match.
// Safe to run any time; agent scores at the current resume version are preserved.
export async function POST() {
  try {
    const result = await rescoreResumeFit();
    return json(result);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
