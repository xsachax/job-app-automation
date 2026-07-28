import type { NextRequest } from "next/server";
import { json, errorResponse } from "@/lib/http";
import { parseConnectionsCsv } from "@/lib/connections/parse";
import {
  buildConnectionSet,
  clearConnectionSet,
  getConnectionSet,
  saveConnectionSet,
  summarizeConnectionSet,
} from "@/lib/connections/store";

export const dynamic = "force-dynamic";

// GET /api/connections — compact summary of the imported LinkedIn connections
// (no full contact lists; those only ride along on matched job cards).
export async function GET() {
  const data = await getConnectionSet();
  return json(summarizeConnectionSet(data));
}

// POST /api/connections — import a LinkedIn "Connections.csv" export. Body:
// { csv: string }. Parses server-side, replaces any prior import, returns the
// new summary plus how many rows parsed / were skipped for having no employer.
export async function POST(req: NextRequest) {
  let body: { csv?: string };
  try {
    body = (await req.json()) as { csv?: string };
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) return errorResponse("no CSV content provided", 400);

  const { connections, total, skipped } = parseConnectionsCsv(csv);
  if (connections.length === 0) {
    return errorResponse(
      "Couldn't find any connections. Make sure this is the LinkedIn Connections.csv export (it has First Name, Last Name, Company, Position columns).",
      422,
    );
  }

  const data = buildConnectionSet(connections);
  await saveConnectionSet(data);

  return json({
    ...summarizeConnectionSet(data),
    imported: connections.length,
    parsedRows: total,
    skippedNoCompany: skipped,
  });
}

// DELETE /api/connections — forget the imported connections entirely.
export async function DELETE() {
  await clearConnectionSet();
  return json(summarizeConnectionSet({ importedAt: "", total: 0, distinctCompanies: 0, byCompany: {} }));
}
