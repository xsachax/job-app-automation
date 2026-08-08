// Tier-2 resume/skills fit scoring.
//
// This is the DETERMINISTIC baseline matcher: it compares a job against the
// user's resume (skills, roles held, summary, full text) and returns a 0..100
// fit score with human-readable reasons. It is dependency-free and needs no API
// key, so it runs everywhere (cron included).
//
// A richer, judgement-based score is produced separately by the Copilot agent
// (see lib/matching/agent.ts) and overrides this baseline when available.

import {
  SKILL_VOCAB,
  canonicalSkill,
  extractSkills,
  textHasSkill,
} from "../discovery/enrich";

export interface ResumeContext {
  skills?: string[]; // parsed skills from the resume
  titles?: string[]; // roles/titles the candidate has held
  summary?: string; // resume summary / objective
  text?: string; // full resume plain text (used for broad keyword coverage)
}

export interface ResumeJobInput {
  title: string;
  description?: string | null;
  company?: string | null;
  skills?: string[];
}

export interface ResumeScoreResult {
  score: number; // 0..100
  reasons: string[];
  matchedSkills: string[]; // resume skills found in the posting
  missingSignals: string[]; // notable posting keywords absent from the resume
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "your", "have", "this",
  "that", "who", "all", "can", "job", "role", "team", "work", "working", "we", "a",
  "an", "to", "of", "in", "on", "as", "at", "be", "or", "is", "it", "by", "from",
  "experience", "years", "year", "including", "ability", "strong", "using", "us",
  "new", "help", "build", "building", "across", "into", "within", "per", "etc",
  "such", "more", "most", "other", "well", "like", "make", "made", "get", "join",
  "looking", "seeking", "responsibilities", "requirements", "qualifications",
]);

const RESONANCE_STOPWORDS = new Set([
  ...STOPWORDS,
  "computer",
  "company",
  "data",
  "developer",
  "development",
  "engineer",
  "engineering",
  "focused",
  "full",
  "level",
  "market",
  "product",
  "science",
  "software",
  "stack",
  "systems",
  "technical",
  "technology",
]);

const SIGNAL_NOISE = new Set([
  "amp",
  "button",
  "class",
  "div",
  "href",
  "html",
  "http",
  "https",
  "local",
  "nbsp",
  "quot",
  "render",
  "renderer",
  "section",
  "span",
  "start",
  "style",
]);

const TRUSTED_SKILL_SIGNALS = new Set(
  SKILL_VOCAB.map(canonicalSkill),
);

function tokenize(s: string | null | undefined): string[] {
  return (
    (s || "").toLowerCase().match(/[a-z0-9+#.]+/g)?.map((t) => t.replace(/\.+$/, "")).filter(Boolean) ??
    []
  );
}

function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
}

function phraseAppears(text: string, phrase: string): boolean {
  return textHasSkill(text, phrase);
}

interface SkillEvidence {
  label: string;
  preferredLabel: boolean;
}

function addSkillEvidence(
  evidence: Map<string, SkillEvidence>,
  canonical: string,
  label: string,
  preferredLabel: boolean,
): void {
  if (!canonical) return;
  const existing = evidence.get(canonical);
  if (!existing || (preferredLabel && !existing.preferredLabel)) {
    evidence.set(canonical, { label, preferredLabel });
  }
}

function addStructuredSkill(
  evidence: Map<string, SkillEvidence>,
  rawSkill: string,
): void {
  const skill = rawSkill.trim();
  if (!skill) return;
  const direct = canonicalSkill(skill);
  if (TRUSTED_SKILL_SIGNALS.has(direct)) {
    addSkillEvidence(evidence, direct, skill, true);
    return;
  }
  const extracted = extractSkills({ title: "", description: skill });
  if (extracted.length === 0) {
    addSkillEvidence(evidence, direct, skill, true);
    return;
  }
  for (const canonical of extracted) {
    const directMatch = canonical === direct;
    addSkillEvidence(
      evidence,
      canonical,
      directMatch ? skill : canonical,
      directMatch,
    );
  }
}

function resumeSkillEvidence(
  resume: ResumeContext,
  structuredSkills: string[],
): Map<string, SkillEvidence> {
  const evidence = new Map<string, SkillEvidence>();
  for (const skill of structuredSkills) addStructuredSkill(evidence, skill);
  for (const canonical of extractSkills({
    title: "",
    description: `${resume.summary ?? ""}\n${resume.text ?? ""}`,
  })) {
    addSkillEvidence(evidence, canonical, canonical, false);
  }
  return evidence;
}

function postingSkillEvidence(
  job: ResumeJobInput,
): Map<string, SkillEvidence> {
  const evidence = new Map<string, SkillEvidence>();
  for (const skill of job.skills ?? []) addStructuredSkill(evidence, skill);
  for (const canonical of extractSkills({
    title: job.title,
    description: job.description,
  })) {
    addSkillEvidence(evidence, canonical, canonical, false);
  }
  return evidence;
}

function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function usefulSignal(value: string): boolean {
  if (!TRUSTED_SKILL_SIGNALS.has(canonicalSkill(value))) return false;
  const tokens = tokenize(value);
  return tokens.some(
    (token) =>
      !RESONANCE_STOPWORDS.has(token) &&
      !SIGNAL_NOISE.has(token) &&
      !/^\d+$/.test(token),
  );
}

function addMissingSignal(signals: string[], value: string): void {
  const normalized = normalizePhrase(value);
  if (!normalized) return;
  const relatedIndex = signals.findIndex((signal) => {
    if (canonicalSkill(signal) === canonicalSkill(value)) return true;
    const existing = normalizePhrase(signal);
    return existing.includes(normalized) || normalized.includes(existing);
  });
  if (relatedIndex < 0) {
    signals.push(value);
    return;
  }
  if (normalized.length > normalizePhrase(signals[relatedIndex]).length) {
    signals[relatedIndex] = value;
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Score how well a job matches the candidate's resume.
 *
 * Weighting (before clamp):
 *  - Skill coverage (up to 55): fraction of posting skills supported by saved
 *    résumé skills/text, plus a floor bonus for precise hits.
 *  - Title/role alignment (up to 25): overlap between the job title and roles the
 *    candidate has held.
 *  - Summary/keyword resonance (up to 20): resume summary/text terms echoed in the
 *    posting — a soft signal that the domain lines up.
 */
export function scoreResumeFit(job: ResumeJobInput, resume: ResumeContext): ResumeScoreResult {
  const reasons: string[] = [];
  const skills = (resume.skills ?? []).map((s) => s.trim()).filter(Boolean);
  const postingText = `${job.title}\n${job.description ?? ""}`;
  const normalizedPostingText = normalizePhrase(postingText);
  const postingTokens = new Set(tokenize(normalizedPostingText));
  const savedResumeText = `${skills.join("\n")}\n${resume.summary ?? ""}\n${resume.text ?? ""}`;
  const resumeEvidence = resumeSkillEvidence(resume, skills);
  const postingEvidence = postingSkillEvidence(job);

  // --- Skill coverage ---
  const matches = new Map<string, string>();
  for (const [canonical, evidence] of resumeEvidence) {
    const posting = postingEvidence.get(canonical);
    if (!posting && !phraseAppears(postingText, canonical)) continue;
    if (!posting) {
      addSkillEvidence(postingEvidence, canonical, evidence.label, false);
    }
    matches.set(
      canonical,
      evidence.preferredLabel
        ? evidence.label
        : (posting?.label ?? evidence.label),
    );
  }
  for (const [canonical, posting] of postingEvidence) {
    if (
      matches.has(canonical) ||
      (!resumeEvidence.has(canonical) &&
        !phraseAppears(savedResumeText, canonical))
    ) {
      continue;
    }
    const evidence = resumeEvidence.get(canonical);
    matches.set(
      canonical,
      evidence?.preferredLabel ? evidence.label : posting.label,
    );
  }
  const matchedSkills = [...matches.values()];
  let skillScore = 0;
  if (matchedSkills.length > 0) {
    const coverage =
      matchedSkills.length / Math.max(postingEvidence.size, matchedSkills.length);
    // Reward both breadth (coverage) and a floor for absolute hits.
    skillScore = Math.min(55, coverage * 45 + Math.min(matchedSkills.length, 5) * 4);
    reasons.push(
      `Matches ${matchedSkills.length} saved résumé ${
        matchedSkills.length === 1 ? "skill" : "skills"
      }: ${humanList(matchedSkills.slice(0, 5))}` +
        (matchedSkills.length > 5 ? `, plus ${matchedSkills.length - 5} more` : ""),
    );
  } else if (resumeEvidence.size === 0) {
    reasons.push("No résumé skills are on file, so the score relies on role and experience text");
  }

  // --- Title / role alignment ---
  const titleTokens = new Set(tokenize(job.title));
  let titleScore = 0;
  let bestRole = "";
  for (const role of resume.titles ?? []) {
    const rt = tokenize(role).filter((t) => !STOPWORDS.has(t));
    if (rt.length === 0) continue;
    const hits = rt.filter((t) => titleTokens.has(t)).length;
    const frac = hits / rt.length;
    if (frac > 0 && frac * 25 > titleScore) {
      titleScore = frac * 25;
      bestRole = role;
    }
  }
  if (titleScore > 0) {
    reasons.push(`Role aligns with the target title "${bestRole}"`);
  }

  // --- Summary / broad keyword resonance ---
  const summaryTerms = new Set(
    [...tokenize(resume.summary), ...tokenize(resume.text)]
      .filter(
        (t) =>
          t.length >= 4 &&
          !RESONANCE_STOPWORDS.has(t) &&
          !SIGNAL_NOISE.has(t) &&
          !/^\d+$/.test(t),
      ),
  );
  let resonance = 0;
  const echoed: string[] = [];
  for (const t of postingTokens) {
    if (t.length >= 4 && !RESONANCE_STOPWORDS.has(t) && summaryTerms.has(t)) {
      echoed.push(t);
    }
  }
  if (echoed.length > 0) {
    resonance = Math.min(20, echoed.length * 2.5);
    reasons.push(`Résumé evidence overlaps on ${humanList(echoed.slice(0, 6))}`);
  }

  // --- Missing signals: structured posting skills and prominent repeated terms ---
  const missingSignals: string[] = [];
  if (resumeEvidence.size > 0 || savedResumeText.trim()) {
    const companyText = job.company ?? "";
    for (const skill of (job.skills ?? []).filter(usefulSignal)) {
      if (missingSignals.length >= 6) break;
      if (
        !resumeEvidence.has(canonicalSkill(skill)) &&
        !phraseAppears(savedResumeText, skill) &&
        (!companyText || !phraseAppears(companyText, skill))
      ) {
        addMissingSignal(missingSignals, skill);
      }
    }
  }

  const score = clamp(skillScore + titleScore + resonance);
  if (reasons.length === 0) reasons.push("Limited direct résumé overlap");
  return { score, reasons, matchedSkills, missingSignals };
}
