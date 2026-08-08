import { describe, it, expect } from "vitest";
import { scoreResumeFit, type ResumeContext } from "../lib/matching/resume";

const resume: ResumeContext = {
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "GraphQL", "AWS"],
  titles: ["Senior Software Engineer", "Full-stack Engineer"],
  summary: "Full-stack engineer building product features end to end.",
  text: "Full-stack engineer with TypeScript, React and Node.js experience shipping product.",
};

describe("scoreResumeFit", () => {
  it("scores a strongly-overlapping posting highly", () => {
    const r = scoreResumeFit(
      {
        title: "Senior Software Engineer",
        description: "Build features with TypeScript, React, Node.js and PostgreSQL on AWS.",
      },
      resume,
    );
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.matchedSkills).toEqual(
      expect.arrayContaining(["TypeScript", "React", "Node.js", "PostgreSQL", "AWS"]),
    );
  });

  it("scores an unrelated posting low", () => {
    const r = scoreResumeFit(
      { title: "Warehouse Associate", description: "Operate a forklift and manage inventory." },
      resume,
    );
    expect(r.score).toBeLessThan(25);
  });

  it("matches multi-word skills as phrases", () => {
    const ml: ResumeContext = { skills: ["machine learning", "python"] };
    const hit = scoreResumeFit(
      { title: "ML Engineer", description: "Deep machine learning in python." },
      ml,
    );
    const miss = scoreResumeFit(
      { title: "Research Engineer", description: "A machine that is learning to walk." },
      ml,
    );
    expect(hit.matchedSkills).toContain("machine learning");
    expect(miss.matchedSkills).not.toContain("machine learning");
  });

  it("does not turn repeated prose into a hard-skill gap", () => {
    const r = scoreResumeFit(
      {
        title: "Backend Engineer",
        description: "Kubernetes kubernetes kubernetes and Rust rust rust required.",
      },
      resume,
    );
    expect(r.missingSignals).toEqual([]);
  });

  it("surfaces structured posting skills that are absent from the résumé", () => {
    const r = scoreResumeFit(
      {
        title: "Platform Engineer",
        description: "Build reliable infrastructure.",
        skills: ["Kubernetes", "Terraform", "AWS"],
      },
      resume,
    );
    expect(r.missingSignals).toEqual(
      expect.arrayContaining(["Kubernetes", "Terraform"]),
    );
    expect(r.missingSignals).not.toContain("AWS");
  });

  it("treats common skill aliases as the same résumé evidence", () => {
    const r = scoreResumeFit(
      {
        title: "Platform Engineer",
        description: "Build with Go, PostgreSQL, Node.js, GCP, Kubernetes, JavaScript and TypeScript.",
        skills: ["go", "postgres", "node.js", "gcp", "kubernetes", "javascript", "typescript"],
      },
      {
        skills: ["Golang", "PostgreSQL", "NodeJS", "Google Cloud", "K8s", "JS", "TS"],
      },
    );

    expect(r.matchedSkills).toHaveLength(7);
    expect(r.missingSignals).toEqual([]);
  });

  it("recognizes aliases found only in parsed résumé text", () => {
    const r = scoreResumeFit(
      {
        title: "Machine Learning Engineer",
        skills: ["machine learning", "next.js", "postgres", "pytorch"],
      },
      {
        skills: ["Python"],
        text: "Technical Skills: ML, Next, PostgreSQL, Torch",
      },
    );

    expect(r.matchedSkills).toEqual(
      expect.arrayContaining(["machine learning", "next.js", "postgres", "pytorch"]),
    );
    expect(r.reasons).toEqual([
      expect.stringMatching(/matches 4 saved résumé skills/i),
    ]);
    expect(r.missingSignals).toEqual([]);
  });

  it("recovers skills from composite legacy profile values", () => {
    const r = scoreResumeFit(
      {
        title: "Full-stack Engineer",
        description: "Build TypeScript and React services with Node.js.",
        skills: ["TypeScript", "React", "Node.js"],
      },
      {
        skills: [
          "Languages: TypeScript / Python",
          "Frameworks: React.JS & Node JS",
        ],
      },
    );

    expect(r.matchedSkills).toEqual(
      expect.arrayContaining(["TypeScript", "React", "Node.js"]),
    );
    expect(r.missingSignals).toEqual([]);
  });

  it("uses exact saved résumé text for structured skills outside the vocabulary", () => {
    const r = scoreResumeFit(
      {
        title: "Workflow Engineer",
        description: "Build durable workflows.",
        skills: ["Temporal"],
      },
      {
        text: "Built production workflow orchestration with Temporal.",
      },
    );

    expect(r.matchedSkills).toEqual(["Temporal"]);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/matches 1 saved résumé skill: Temporal/i),
      ]),
    );
  });

  it("clamps into 0..100 and handles an empty resume", () => {
    const r = scoreResumeFit({ title: "Software Engineer" }, {});
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.reasons.join(" ")).toMatch(/no résumé skills/i);
  });
});
