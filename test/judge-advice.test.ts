import { describe, expect, it } from "vitest";
import {
  fitAdvice,
  gapAdvice,
  splitJudgeAdvice,
} from "../lib/judge/advice";

describe("judge advice", () => {
  it("keeps tagged fit evidence and gaps separate", () => {
    const advice = splitJudgeAdvice(
      [
        fitAdvice("Matches TypeScript and React."),
        gapAdvice("Kubernetes is not shown."),
      ],
      "Strong fit: Prioritize this application.",
    );
    expect(advice.summary).toBe("Prioritize this application");
    expect(advice.fits).toEqual(["Matches TypeScript and React"]);
    expect(advice.gaps).toEqual(["Kubernetes is not shown"]);
  });

  it("classifies legacy reasons and extracts legacy gap summaries", () => {
    const advice = splitJudgeAdvice(
      ["resume skills present: TypeScript", "company Acme is unranked (-8 fit)"],
      "Possible fit: TypeScript overlap. Gaps: Kubernetes, AWS.",
    );
    expect(advice.fits).toContain("resume skills present: TypeScript");
    expect(advice.gaps).toEqual(
      expect.arrayContaining(["company Acme is unranked (-8 fit)", "Kubernetes, AWS"]),
    );
  });
});
