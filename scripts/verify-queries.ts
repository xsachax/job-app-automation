import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync, mkdirSync } from "node:fs";
import { API_COMPANIES, BROWSER_COMPANIES } from "../lib/discovery/companies";
import { fetchCompanyPostings, type DiscoveryPosting } from "../lib/discovery/adapters";
import { classifyEntryLevel } from "../lib/discovery/entryLevel";

// Live verifier for the discovery query catalog. For every API company it hits
// the real endpoint (via the shared adapters), classifies each posting by
// country (US / CA) and whether it's an entry-level software role, and prints a
// confirmation table. Browser companies are listed with their pinned search
// URLs. Not part of the runtime.
//
//   npm run discovery:verify

function entryLevel(list: DiscoveryPosting[]): DiscoveryPosting[] {
  return list.filter((p) => classifyEntryLevel({ title: p.title, description: p.description }).isEntryLevel);
}

async function run() {
  const rows: {
    name: string;
    system: string;
    ok: boolean;
    usTotal: number;
    caTotal: number;
    usEntry: number;
    caEntry: number;
    sampleUS: string;
    error?: string;
  }[] = [];

  for (const c of API_COMPANIES) {
    try {
      const all = await fetchCompanyPostings(c);
      const US = all.filter((p) => p.country === "US");
      const CA = all.filter((p) => p.country === "CA");
      const usE = entryLevel(US);
      const caE = entryLevel(CA);
      rows.push({
        name: c.name,
        system: c.system,
        ok: US.length + CA.length > 0,
        usTotal: US.length,
        caTotal: CA.length,
        usEntry: usE.length,
        caEntry: caE.length,
        sampleUS: usE[0]?.title ?? "",
      });
      process.stdout.write(`  ✓ ${c.name}\n`);
    } catch (e) {
      rows.push({
        name: c.name,
        system: c.system,
        ok: false,
        usTotal: 0,
        caTotal: 0,
        usEntry: 0,
        caEntry: 0,
        sampleUS: "",
        error: e instanceof Error ? e.message : String(e),
      });
      process.stdout.write(`  ✗ ${c.name} (${e instanceof Error ? e.message : e})\n`);
    }
    await sleep(200);
  }

  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log("\n=== API companies (live) ===");
  console.log(
    pad("Company", 18) + pad("System", 11) + pad("US(entry/tot)", 15) + pad("CA(entry/tot)", 15) + "sample US entry-level role",
  );
  console.log("-".repeat(100));
  for (const r of rows) {
    const usc = `${r.usEntry}/${r.usTotal}`;
    const cac = `${r.caEntry}/${r.caTotal}`;
    console.log(
      pad(r.name, 18) + pad(r.system, 11) + pad(usc, 15) + pad(cac, 15) + (r.error ? `ERROR: ${r.error}` : pad(r.sampleUS, 40)),
    );
  }

  console.log("\n=== Browser companies (need Playwright at scrape time) ===");
  for (const b of BROWSER_COMPANIES) {
    console.log(`${pad(b.name, 14)} ${b.reason}`);
    console.log(`    US: ${b.searchUrlUS}`);
    console.log(`    CA: ${b.searchUrlCA}`);
  }

  const apiOk = rows.filter((r) => r.ok).length;
  const usEntryTotal = rows.reduce((a, r) => a + r.usEntry, 0);
  const caEntryTotal = rows.reduce((a, r) => a + r.caEntry, 0);
  console.log(
    `\nSummary: ${apiOk}/${API_COMPANIES.length} API endpoints returned data · ` +
      `${usEntryTotal} US + ${caEntryTotal} CA entry-level software roles found · ` +
      `${BROWSER_COMPANIES.length} browser-scrape companies.`,
  );

  mkdirSync(".discovery", { recursive: true });
  writeFileSync(
    ".discovery/verify-report.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), api: rows, browser: BROWSER_COMPANIES }, null, 2),
  );
  console.log("\nWrote .discovery/verify-report.json");
}

run();
