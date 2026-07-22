export interface ParsedResume {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  skills?: string[];
  summary?: string;
}

export interface ParseOutcome {
  parsed: ParsedResume;
  provider: "openai" | "fallback";
}
