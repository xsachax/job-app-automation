import { JOB_AVAILABILITY } from "../discovery/lifecycle";

export const ACTIVE_JOB_WHERE = {
  availabilityStatus: { not: JOB_AVAILABILITY.CLOSED },
} as const;

export const CLOSED_JOB_WHERE = {
  availabilityStatus: JOB_AVAILABILITY.CLOSED,
} as const;

export type JobAvailabilityView = "active" | "closed";

export function jobAvailabilityWhere(view: JobAvailabilityView) {
  return view === "closed" ? CLOSED_JOB_WHERE : ACTIVE_JOB_WHERE;
}

export function parseJobAvailabilityView(
  value: string | null,
): JobAvailabilityView {
  return value === "closed" ? "closed" : "active";
}
