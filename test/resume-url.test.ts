import { describe, it, expect } from "vitest";
import {
  isGithubResumeUrl,
  normalizeResumePdfUrl,
  normalizeResumeUrl,
} from "../lib/profile/url";

describe("normalizeResumeUrl", () => {
  it("rewrites a github blob URL to raw.githubusercontent.com", () => {
    expect(normalizeResumeUrl("https://github.com/sacha/resume/blob/main/resume.md")).toBe(
      "https://raw.githubusercontent.com/sacha/resume/main/resume.md",
    );
  });

  describe("normalizeResumePdfUrl", () => {
    it("normalizes Google Drive share links to downloads", () => {
      expect(
        normalizeResumePdfUrl(
          "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing",
        ),
      ).toBe(
        "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp",
      );
      expect(
        normalizeResumePdfUrl(
          "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp",
        ),
      ).toBe(
        "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp",
      );
    });

    it("rejects non-HTTPS and unsupported hosts", () => {
      expect(() =>
        normalizeResumePdfUrl("http://github.com/a/b/blob/main/resume.pdf"),
      ).toThrow("HTTPS");
      expect(() =>
        normalizeResumePdfUrl("https://example.com/resume.pdf"),
      ).toThrow("GitHub or Google Drive");
    });
  });

  it("rewrites a nested blob path", () => {
    expect(
      normalizeResumeUrl("https://github.com/sacha/cv/blob/v2/docs/resume.pdf"),
    ).toBe("https://raw.githubusercontent.com/sacha/cv/v2/docs/resume.pdf");
  });

  it("rewrites a github /raw/ URL to raw.githubusercontent.com", () => {
    expect(normalizeResumeUrl("https://github.com/sacha/resume/raw/main/resume.txt")).toBe(
      "https://raw.githubusercontent.com/sacha/resume/main/resume.txt",
    );
  });

  it("appends /raw to a gist URL", () => {
    expect(normalizeResumeUrl("https://gist.github.com/sacha/abc123")).toBe(
      "https://gist.github.com/sacha/abc123/raw",
    );
  });

  it("leaves already-raw URLs untouched", () => {
    const raw = "https://raw.githubusercontent.com/sacha/resume/main/resume.md";
    expect(normalizeResumeUrl(raw)).toBe(raw);
  });

  it("leaves non-github URLs untouched", () => {
    const pdf = "https://example.com/files/resume.pdf";
    expect(normalizeResumeUrl(pdf)).toBe(pdf);
  });

  it("trims whitespace and tolerates junk input", () => {
    expect(normalizeResumeUrl("  https://example.com/r.pdf  ")).toBe("https://example.com/r.pdf");
    expect(normalizeResumeUrl("not a url")).toBe("not a url");
    expect(normalizeResumeUrl("")).toBe("");
  });

  it("does not rewrite github repo pages that are not blob/raw", () => {
    const repo = "https://github.com/sacha/resume";
    expect(normalizeResumeUrl(repo)).toBe(repo);
  });
});

describe("isGithubResumeUrl", () => {
  it("recognizes github hosts", () => {
    expect(isGithubResumeUrl("https://github.com/a/b/blob/main/r.md")).toBe(true);
    expect(isGithubResumeUrl("https://raw.githubusercontent.com/a/b/main/r.md")).toBe(true);
    expect(isGithubResumeUrl("https://gist.github.com/a/b")).toBe(true);
  });

  it("rejects other hosts and junk", () => {
    expect(isGithubResumeUrl("https://example.com/r.pdf")).toBe(false);
    expect(isGithubResumeUrl("nonsense")).toBe(false);
  });
});
