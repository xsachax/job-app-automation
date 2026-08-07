import { prisma } from "../db";
import { companyMatchKey } from "./normalize";
import type { ParsedConnection } from "./parse";

export interface StoredContact {
  name: string;
  position: string;
  url: string;
}

export interface CompanyConnections {
  company: string; // display spelling (most common raw form)
  count: number;
  contacts: StoredContact[];
}

export interface ConnectionSetData {
  importedAt: string; // ISO timestamp of the import
  total: number; // total connections with a company
  distinctCompanies: number;
  byCompany: Record<string, CompanyConnections>; // keyed by companyMatchKey
}

export const EMPTY_CONNECTION_SET: ConnectionSetData = {
  importedAt: "",
  total: 0,
  distinctCompanies: 0,
  byCompany: {},
};

// Fold a flat connection list into the company-keyed index we persist and match
// against. Groups by companyMatchKey; the display name is whichever raw spelling
// appears most often for that key.
export function buildConnectionSet(parsed: ParsedConnection[]): ConnectionSetData {
  const byKey = new Map<
    string,
    { count: number; contacts: StoredContact[]; spellings: Map<string, number> }
  >();

  for (const c of parsed) {
    const key = companyMatchKey(c.company);
    if (!key) continue;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { count: 0, contacts: [], spellings: new Map() };
      byKey.set(key, entry);
    }
    entry.count++;
    entry.spellings.set(c.company, (entry.spellings.get(c.company) ?? 0) + 1);
    entry.contacts.push({ name: c.name, position: c.position, url: c.url });
  }

  const byCompany: Record<string, CompanyConnections> = {};
  let total = 0;
  for (const [key, entry] of byKey) {
    total += entry.count;
    const company = [...entry.spellings.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    byCompany[key] = { company, count: entry.count, contacts: entry.contacts };
  }

  return {
    importedAt: new Date().toISOString(),
    total,
    distinctCompanies: byKey.size,
    byCompany,
  };
}

export async function getConnectionSet(): Promise<ConnectionSetData> {
  const row = await prisma.connectionSet.findUnique({ where: { id: "me" } });
  if (!row) return { ...EMPTY_CONNECTION_SET };
  try {
    return { ...EMPTY_CONNECTION_SET, ...(JSON.parse(row.data) as ConnectionSetData) };
  } catch {
    return { ...EMPTY_CONNECTION_SET };
  }
}

export async function saveConnectionSet(data: ConnectionSetData): Promise<ConnectionSetData> {
  const json = JSON.stringify(data);
  await prisma.connectionSet.upsert({
    where: { id: "me" },
    update: { data: json },
    create: { id: "me", data: json },
  });
  return data;
}

export async function clearConnectionSet(): Promise<void> {
  await prisma.connectionSet.deleteMany({ where: { id: "me" } });
}

// Look up the connections (if any) the user has at a given employer. Applies the
// same normalizer used at import time, so a job's catalog company matches a
// connection's free-text employer.
export function lookupConnections(
  data: ConnectionSetData,
  company: string,
): CompanyConnections | null {
  const key = companyMatchKey(company);
  if (!key) return null;
  return data.byCompany[key] ?? null;
}

// Compact summary for the Profile page (no full contact lists shipped).
export interface ConnectionSummary {
  importedAt: string;
  total: number;
  distinctCompanies: number;
  topCompanies: { company: string; count: number }[];
}

export function summarizeConnectionSet(data: ConnectionSetData): ConnectionSummary {
  const topCompanies = Object.values(data.byCompany)
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .slice(0, 20)
    .map((c) => ({ company: c.company, count: c.count }));
  return {
    importedAt: data.importedAt,
    total: data.total,
    distinctCompanies: data.distinctCompanies,
    topCompanies,
  };
}
