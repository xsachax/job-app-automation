import type { ParseOutcome } from "./types";
import { parseWithFallback } from "./fallback";
import { parseWithOpenAI } from "./openai";

// Parse a resume into structured fields. Uses OpenAI when OPENAI_API_KEY is set,
// otherwise (or on any error) the deterministic fallback parser.
export async function parseResume(text: string): Promise<ParseOutcome> {
  if (process.env.OPENAI_API_KEY) {
    try {
      const parsed = await parseWithOpenAI(text);
      return { parsed, provider: "openai" };
    } catch {
      // fall through to deterministic parsing
    }
  }
  return { parsed: parseWithFallback(text), provider: "fallback" };
}

export type { ParsedResume, ParseOutcome } from "./types";
