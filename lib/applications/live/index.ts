import type { ApplicationFields } from "../draft";
import type { SubmitJob, SubmitResult } from "../submit";
import { fillGreenhouse } from "./greenhouse";
import { fillLever } from "./lever";

export type LiveFiller = (job: SubmitJob, fields: ApplicationFields) => Promise<SubmitResult>;

// Map an ATS type to its live (Playwright) filler. Undefined => live apply
// unsupported for that ATS (caller throws a clear error).
export function getLiveFiller(ats?: string): LiveFiller | undefined {
  switch (ats) {
    case "greenhouse":
      return fillGreenhouse;
    case "lever":
      return fillLever;
    default:
      return undefined;
  }
}
