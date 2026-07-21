import cron from "node-cron";
import { runScan } from "../lib/scan";

// Scheduled scanner. Runs on SCAN_CRON (default: every 30 minutes).
// Never submits anything — discovery + scoring only. Submission stays behind
// the human approval gate in the dashboard.
const schedule = process.env.SCAN_CRON || "*/30 * * * *";

if (!cron.validate(schedule)) {
  console.error(`Invalid SCAN_CRON expression: "${schedule}"`);
  process.exit(1);
}

async function scanOnce(reason: string) {
  const started = new Date().toISOString();
  console.log(`[${started}] scan start (${reason})`);
  try {
    const summary = await runScan();
    console.log(
      `[${new Date().toISOString()}] scan done: +${summary.totals.created} new, ` +
        `${summary.totals.updated} deduped, ${summary.totals.workday} workday, ` +
        `${summary.totals.errors} errors (${summary.durationMs}ms)`,
    );
  } catch (e) {
    console.error("scan failed:", e);
  }
}

console.log(`Cron scanner armed: "${schedule}". Press Ctrl+C to stop.`);
cron.schedule(schedule, () => void scanOnce("cron"));

// Kick off an immediate scan on startup unless SCAN_ON_START=0.
if (process.env.SCAN_ON_START !== "0") {
  void scanOnce("startup");
}
