// Deterministic enrichment of a posting into structured, filterable facets.
//
// None of this needs a network call or an API key: skills, salary, visa
// sponsorship and employment type are all pulled out of the title / description
// (and, for the aggregator boards, a first-class `sponsorship` field) with
// dictionaries + regexes. Keeping it deterministic means it runs on every scan
// and is trivially unit-testable.

export interface EnrichInput {
  title: string;
  description?: string | null;
  location?: string | null;
  country?: string | null; // US | CA — used to default the salary currency
  sponsorship?: string | null; // first-class value from a source (e.g. boards)
  compensation?: string | null; // first-class comp string from a source
  isInternship?: boolean;
}

export interface Enrichment {
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryRaw: string | null;
  sponsorship: string; // offers | none | citizenship | unknown
  employmentType: string; // fulltime | intern | contract | unknown
}

// A curated vocabulary of tech skills. Multi-word entries are matched as
// substrings; single tokens as whole words. Kept deliberately high-signal so a
// job's `skills[]` is useful for filtering rather than noisy.
export const SKILL_VOCAB: string[] = [
  // languages
  "python", "java", "javascript", "typescript", "c++", "c#", "go", "golang",
  "rust", "ruby", "kotlin", "swift", "scala", "php", "perl", "matlab",
  "objective-c", "dart", "elixir", "haskell", "bash", "shell", "sql",
  // web / frontend
  "react", "react native", "next.js", "nextjs", "vue", "angular", "svelte",
  "redux", "tailwind", "html", "css", "sass", "graphql", "node.js", "nodejs",
  "express", "webpack", "vite",
  // backend / frameworks
  "django", "flask", "fastapi", "spring", "spring boot", "rails", ".net",
  "grpc", "rest", "microservices", "kafka", "rabbitmq", "graphql",
  // data / ml
  "machine learning", "deep learning", "pytorch", "tensorflow", "keras",
  "scikit-learn", "pandas", "numpy", "spark", "hadoop", "airflow", "dbt",
  "nlp", "computer vision", "llm", "generative ai", "reinforcement learning",
  "data pipeline", "etl", "data warehouse", "snowflake", "databricks",
  // databases
  "postgres", "postgresql", "mysql", "mongodb", "redis", "dynamodb",
  "cassandra", "elasticsearch", "bigquery", "sqlite",
  // cloud / devops / infra
  "aws", "azure", "gcp", "google cloud", "kubernetes", "docker", "terraform",
  "ansible", "jenkins", "ci/cd", "github actions", "gitlab", "linux", "unix",
  "prometheus", "grafana", "datadog", "helm", "serverless", "lambda",
  // mobile / systems
  "ios", "android", "embedded", "firmware", "distributed systems",
  "operating systems", "compilers", "networking", "cybersecurity", "security",
  // practices
  "agile", "scrum", "tdd", "unit testing", "playwright", "selenium", "git",
];

// Split vocab: multi-word entries are matched as substrings, single tokens with
// a word-ish boundary that still allows the +, #, ., /, - inside skill names.
const MULTI = SKILL_VOCAB.filter((s) => /\s/.test(s));
const SINGLE = SKILL_VOCAB.filter((s) => !/\s/.test(s));

function normalize(s: string): string {
  return s.toLowerCase();
}

// Whole-token match. Boundaries key off [a-z0-9] only, so sentence punctuation
// ("Kubernetes.") is a boundary while special chars inside the token ("c++",
// "node.js", "ci/cd") are matched literally.
function hasToken(text: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "i").test(text);
}

export function extractSkills(input: { title: string; description?: string | null }): string[] {
  const text = normalize(`${input.title}\n${input.description ?? ""}`);
  const found = new Set<string>();
  for (const s of MULTI) {
    if (text.includes(normalize(s))) found.add(canonicalSkill(s));
  }
  for (const s of SINGLE) {
    if (hasToken(text, s)) found.add(canonicalSkill(s));
  }
  return [...found].sort();
}

// Collapse near-synonyms so the filter facet is clean.
function canonicalSkill(s: string): string {
  const map: Record<string, string> = {
    golang: "go",
    nextjs: "next.js",
    nodejs: "node.js",
    postgresql: "postgres",
    "google cloud": "gcp",
  };
  return map[s] ?? s;
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

function parseAmount(raw: string): number | null {
  let s = raw.replace(/[$,\s]/g, "").toLowerCase();
  let mult = 1;
  if (s.endsWith("k")) {
    mult = 1000;
    s = s.slice(0, -1);
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const val = Math.round(n * mult);
  // Only treat plausible annual figures as salary (ignore hourly/odd numbers).
  return val >= 20000 && val <= 1_000_000 ? val : null;
}

export function extractSalary(
  input: { description?: string | null; compensation?: string | null; country?: string | null },
): { min: number | null; max: number | null; currency: string | null; raw: string | null } {
  const text = `${input.compensation ?? ""}\n${input.description ?? ""}`;
  // Range: $120,000 - $150,000 | $120k–$160k | 120,000 to 150,000
  const range =
    text.match(
      /\$?\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?\s?k?)\s?(?:-|–|—|to)\s?\$?\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?\s?k?)/i,
    );
  let min: number | null = null;
  let max: number | null = null;
  let raw: string | null = null;
  if (range) {
    min = parseAmount(range[1]);
    max = parseAmount(range[2]);
    if (min || max) raw = range[0].replace(/\s+/g, " ").trim();
  } else {
    const single = text.match(/\$\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?\s?k?)\b/i);
    if (single) {
      const v = parseAmount(single[1]);
      if (v) {
        min = v;
        raw = single[0].replace(/\s+/g, " ").trim();
      }
    }
  }
  if (min && max && min > max) [min, max] = [max, min];
  let currency: string | null = null;
  if (raw) {
    if (/\bcad\b|c\$/i.test(text)) currency = "CAD";
    else if (/\busd\b/i.test(text)) currency = "USD";
    else currency = input.country === "CA" ? "CAD" : "USD";
  }
  return { min, max, currency, raw };
}

// ---------------------------------------------------------------------------
// Sponsorship
// ---------------------------------------------------------------------------

export function classifySponsorship(input: {
  description?: string | null;
  sponsorship?: string | null;
}): string {
  // Prefer a first-class value (aggregator boards provide one).
  const first = (input.sponsorship ?? "").toLowerCase();
  if (first) {
    if (/citizen|clearance/.test(first)) return "citizenship";
    if (/does not|no sponsorship|not offer|will not/.test(first)) return "none";
    if (/offer|available|provide|yes/.test(first)) return "offers";
    if (/other/.test(first)) return "unknown";
  }
  const t = (input.description ?? "").toLowerCase();
  if (!t) return first ? "unknown" : "unknown";
  if (
    /(u\.?s\.?\s*)?citizenship\s+(is\s+)?required|must be (a\s+)?(u\.?s\.?\s*)?citizen|active .{0,20}clearance|security clearance|requires? .{0,25}clearance/.test(t)
  ) {
    return "citizenship";
  }
  if (
    /(not|no|unable to|will not|does not|cannot|can not|do not)\b[^.]{0,40}sponsor|sponsorship (is )?not (available|offered|provided)|without (visa )?sponsorship|no visa sponsorship/.test(t)
  ) {
    return "none";
  }
  if (
    /(will|can|offer|provide|able to)\b[^.]{0,30}sponsor|visa sponsorship (is )?(available|offered|provided|supported)|open to sponsor/.test(t)
  ) {
    return "offers";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Employment type
// ---------------------------------------------------------------------------

export function classifyEmploymentType(input: {
  title: string;
  description?: string | null;
  isInternship?: boolean;
}): string {
  if (input.isInternship) return "intern";
  const t = `${input.title}\n${input.description ?? ""}`.toLowerCase();
  if (/\bintern(ship)?\b|\bco[ -]?op\b/.test(input.title.toLowerCase())) return "intern";
  if (/\bcontract\b|contractor|temporary\b|\btemp\b|fixed[ -]term/.test(t)) return "contract";
  return "fulltime";
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export function enrich(input: EnrichInput): Enrichment {
  const skills = extractSkills(input);
  const salary = extractSalary(input);
  const sponsorship = classifySponsorship(input);
  const employmentType = classifyEmploymentType(input);
  return {
    skills,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    salaryRaw: salary.raw,
    sponsorship,
    employmentType,
  };
}
