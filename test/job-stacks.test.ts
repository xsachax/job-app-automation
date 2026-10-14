import { describe, expect, it } from "vitest";
import { groupSimilarJobs } from "../lib/jobs/stacks";

function job(id: string, title = "Software Engineer", company = "Acme") {
  return { id, title, company, country: "US", employmentType: "fulltime" };
}

describe("similar job stacks", () => {
  it("groups punctuation, word-order and common abbreviation variants at the same employer", () => {
    const jobs = [
      job("first", "Sr. Software Engineer - Back-end"),
      job("other", "Software Engineer", "Other Company"),
      job("second", "Backend SWE, Senior"),
      job("third", "Senior Backend Software Eng."),
    ];
    const stacks = groupSimilarJobs(jobs);
    expect(stacks.map((stack) => stack.jobs.map((item) => item.id))).toEqual([
      ["first", "second", "third"],
      ["other"],
    ]);
    expect(jobs.map((item) => item.id)).toEqual(["first", "other", "second", "third"]);
  });

  it("preserves the current sort order, with the highest-ranked member representing the stack", () => {
    const one = job("one");
    const two = job("two");
    expect(groupSimilarJobs([two, one])[0].jobs).toEqual([two, one]);
    expect(groupSimilarJobs([two, one])[0].key).toBe(groupSimilarJobs([one, two])[0].key);
  });

  it("does not merge different levels, specialties, years or technologies", () => {
    const titles = [
      "Software Engineer", "Senior Software Engineer", "Junior Software Engineer",
      "Software Engineer I", "Software Engineer II", "Software Engineer III",
      "Backend Software Engineer", "Frontend Software Engineer",
      "Software Engineer Intern", "Software Engineer New Grad 2026",
      "Software Engineer New Grad 2027", "C Developer", "C++ Developer", "C# Developer",
    ];
    expect(groupSimilarJobs(titles.map((title) => job(title, title)))).toHaveLength(titles.length);
  });

  it("reuses curated company aliases without merging unrelated employers", () => {
    const stacks = groupSimilarJobs([
      job("one", "Software Engineer", "Nvidia"),
      job("two", "Software Engineer", " NVIDIA "),
      job("three", "Software Engineer", "Artera"),
      job("four", "Software Engineer", "Artera Technologies"),
    ]);
    expect(stacks.map((stack) => stack.jobs.length)).toEqual([2, 1, 1]);
  });

  it("keeps countries, employment types, and missing identities separate", () => {
    const jobs = [
      job("us"),
      { ...job("ca"), country: "CA" },
      { ...job("contract"), employmentType: "contract" },
      { ...job("unknown"), employmentType: null },
      job("empty-title-1", ""),
      job("empty-title-2", ""),
      job("empty-company-1", "Engineer", ""),
      job("empty-company-2", "Engineer", ""),
    ];
    expect(groupSimilarJobs(jobs)).toHaveLength(jobs.length);
    expect(groupSimilarJobs([])).toEqual([]);
  });

  it("groups across page boundaries without losing any requisitions", () => {
    const jobs = Array.from({ length: 5000 }, (_, index) =>
      job(String(index), `Software Engineer ${index % 100}`),
    );
    const stacks = groupSimilarJobs(jobs);
    expect(stacks).toHaveLength(100);
    expect(stacks.every((stack) => stack.jobs.length === 50)).toBe(true);
    expect(new Set(stacks.flatMap((stack) => stack.jobs.map((item) => item.id))).size).toBe(5000);
  });
});
