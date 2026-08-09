import { getDiscoveryScopeCopy } from "@/lib/discovery/scope";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await getDiscoveryScopeCopy());
  } catch (error) {
    return errorResponse(error);
  }
}
