import { prisma } from "../db";
import { getProfile } from "../settings";
import { buildFields, missingRequired, type ApplicationFields } from "./draft";
import { submitApplication, applyMode } from "./submit";

// Application statuses that mean "already in flight" — we never create a second.
const OPEN_STATUSES = ["drafted", "pending_approval", "submitted"];

export interface DraftOutcome {
  application: { id: string; jobId: string; status: string };
  fields: ApplicationFields;
  missing: string[];
  alreadyExisted: boolean;
}

function parseFields(raw: string | null): ApplicationFields {
  try {
    return JSON.parse(raw || "{}") as ApplicationFields;
  } catch {
    return {} as ApplicationFields;
  }
}

/**
 * Prepare an application and park it at the human approval gate
 * (status = pending_approval). Nothing is sent here.
 *
 * "Never apply twice" guards:
 *  - applications.jobId is UNIQUE; an in-flight app short-circuits (idempotent).
 *  - repost guard: if another job with the same fingerprint already has a
 *    submitted/pending application, we refuse.
 */
export async function draftApplication(jobId: string): Promise<DraftOutcome> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { application: true } });
  if (!job) throw new Error("job not found");
  if (job.isWorkday) {
    throw new Error("Workday postings are flagged only and are never auto-applied.");
  }

  if (job.application && OPEN_STATUSES.includes(job.application.status)) {
    const fields = parseFields(job.application.fields);
    return {
      application: job.application,
      fields,
      missing: missingRequired(fields),
      alreadyExisted: true,
    };
  }

  if (job.fingerprint) {
    const dup = await prisma.job.findFirst({
      where: {
        fingerprint: job.fingerprint,
        id: { not: job.id },
        application: { is: { status: { in: ["submitted", "pending_approval"] } } },
      },
    });
    if (dup) {
      throw new Error(
        `Looks like a repost of an already-processed job (${dup.company} — ${dup.title}). Not applying twice.`,
      );
    }
  }

  const profile = await getProfile();
  const fields = buildFields(job, profile);
  const application = await prisma.application.upsert({
    where: { jobId: job.id },
    update: { status: "pending_approval", fields: JSON.stringify(fields), result: null },
    create: { jobId: job.id, status: "pending_approval", fields: JSON.stringify(fields) },
  });
  await prisma.match
    .update({ where: { jobId: job.id }, data: { status: "pending_approval" } })
    .catch(() => {});

  return { application, fields, missing: missingRequired(fields), alreadyExisted: false };
}

export interface ApproveOutcome {
  application: { id: string; jobId: string; status: string };
  result?: unknown;
  alreadySubmitted?: boolean;
}

/**
 * The human approval action: confirm & send. Requires a pending_approval draft.
 * Submission itself is DRY-RUN unless APPLY_MODE=live. Idempotent on re-submit.
 */
export async function approveAndSubmit(jobId: string): Promise<ApproveOutcome> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { application: true } });
  if (!job) throw new Error("job not found");
  const app = job.application;
  if (!app) throw new Error("No draft to approve — draft the application first.");
  if (app.status === "submitted") return { application: app, alreadySubmitted: true };
  if (app.status !== "pending_approval") {
    throw new Error(`Cannot submit an application in status "${app.status}".`);
  }

  const fields = parseFields(app.fields);
  const missing = missingRequired(fields);
  if (missing.length > 0) {
    throw new Error(`Cannot submit — missing required fields: ${missing.join(", ")}.`);
  }

  try {
    const result = await submitApplication(
      { title: job.title, company: job.company, applyUrl: job.applyUrl, atsType: job.atsType },
      fields,
    );
    const updated = await prisma.application.update({
      where: { jobId },
      data: { status: "submitted", submittedAt: new Date(), result: JSON.stringify(result) },
    });
    await prisma.match.update({ where: { jobId }, data: { status: "submitted" } }).catch(() => {});
    return { application: updated, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.application
      .update({
        where: { jobId },
        data: { status: "failed", result: JSON.stringify({ ok: false, message: msg }) },
      })
      .catch(() => {});
    throw new Error(msg);
  }
}

// Reject a match (won't be drafted/applied). Marks any draft as failed.
export async function rejectMatch(jobId: string): Promise<{ ok: true }> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { application: true } });
  if (!job) throw new Error("job not found");
  if (job.application) {
    await prisma.application
      .update({
        where: { jobId },
        data: { status: "failed", result: JSON.stringify({ ok: false, message: "rejected by user" }) },
      })
      .catch(() => {});
  }
  await prisma.match.update({ where: { jobId }, data: { status: "rejected" } }).catch(() => {});
  return { ok: true };
}

export { applyMode };
