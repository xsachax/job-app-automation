import type { ApplicationFields } from "./draft";

export type ApplyMode = "dry_run" | "live";

export interface SubmitJob {
  title: string;
  company: string;
  applyUrl: string;
  atsType?: string;
}

export interface SubmitResult {
  mode: ApplyMode;
  ok: boolean;
  message: string;
  submittedTo: string;
  at: string;
}

// Default is DRY RUN. Live submission requires APPLY_MODE=live AND playwright
// installed. This is the safety valve behind the human approval gate.
export function applyMode(): ApplyMode {
  return process.env.APPLY_MODE === "live" ? "live" : "dry_run";
}

export async function submitApplication(
  job: SubmitJob,
  fields: ApplicationFields,
): Promise<SubmitResult> {
  const mode = applyMode();
  const at = new Date().toISOString();

  if (mode === "dry_run") {
    return {
      mode,
      ok: true,
      message:
        "DRY RUN — the application was fully prepared and recorded, but nothing was submitted. " +
        "Set APPLY_MODE=live (and install playwright) to actually submit.",
      submittedTo: job.applyUrl,
      at,
    };
  }

  // Live mode: dynamically load the Playwright-based filler for this ATS.
  const { getLiveFiller } = await import("./live");
  const filler = getLiveFiller(job.atsType);
  if (!filler) {
    throw new Error(`live apply is not implemented for ATS "${job.atsType ?? "unknown"}"`);
  }
  return filler(job, fields);
}
