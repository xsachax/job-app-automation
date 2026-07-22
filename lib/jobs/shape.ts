// Shared shaping for Job rows returned by the API: parse the JSON-encoded
// columns (skills, fitReasons) into real arrays so every client consumes the
// same shape. Kept framework-free so both the list and detail routes reuse it.

function safeArray(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export function shapeJob<T extends { skills?: string | null; fitReasons?: string | null }>(
  job: T,
): Omit<T, "skills" | "fitReasons"> & { skills: string[]; fitReasons: string[] } {
  return {
    ...job,
    skills: safeArray(job.skills),
    fitReasons: safeArray(job.fitReasons),
  };
}
