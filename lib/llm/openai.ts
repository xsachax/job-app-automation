import type { ParsedResume } from "./types";

// Optional LLM parsing via OpenAI. Only used when OPENAI_API_KEY is set.
// Falls back automatically (handled by the caller) if this throws.
export async function parseWithOpenAI(text: string): Promise<ParsedResume> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system =
    "You extract structured data from resumes. Respond ONLY with minified JSON " +
    "matching: {firstName,lastName,email,phone,location,linkedin,github,website,skills:string[],summary}. " +
    "Omit unknown fields. Do not invent data.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 12000) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`openai: HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("openai: empty response");
  const parsed = JSON.parse(content) as ParsedResume;
  if (Array.isArray((parsed as { skills?: unknown }).skills) === false && parsed.skills != null) {
    delete parsed.skills;
  }
  return parsed;
}
