import { describe, expect, it } from "vitest";
import { buildFields } from "../lib/applications/draft";

const JOB = {
  title: "Software Engineer",
  company: "Acme",
  applyUrl: "https://example.com/apply",
  country: "US",
};

describe("application draft profile mapping", () => {
  it("includes voluntary self-identification answers and active Other details", () => {
    expect(
      buildFields(JOB, {
        pronouns: "Other",
        pronounsOther: "Ze/hir",
        gender: "Other",
        genderOther: "Genderqueer",
        raceEthnicity: "Other",
        raceEthnicityOther: "West Asian",
        hispanicLatino: "no",
        transgenderStatus: "Prefer not to answer",
        veteranStatus: "Not a protected veteran",
        disabilityStatus: "no",
      }),
    ).toMatchObject({
      pronouns: "Other",
      pronounsOther: "Ze/hir",
      gender: "Other",
      genderOther: "Genderqueer",
      raceEthnicity: "Other",
      raceEthnicityOther: "West Asian",
      hispanicLatino: "no",
      transgenderStatus: "Prefer not to answer",
      veteranStatus: "Not a protected veteran",
      disabilityStatus: "no",
    });
  });

  it("does not expose stale self-described details for another selection", () => {
    expect(
      buildFields(JOB, {
        pronouns: "She/her",
        pronounsOther: "Stale pronouns",
        gender: "Woman",
        genderOther: "Stale gender",
        raceEthnicity: "Asian",
        raceEthnicityOther: "Stale ethnicity",
      }),
    ).toMatchObject({
      pronouns: "She/her",
      pronounsOther: undefined,
      gender: "Woman",
      genderOther: undefined,
      raceEthnicity: "Asian",
      raceEthnicityOther: undefined,
    });
  });
});
