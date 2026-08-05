const FIT_PREFIX = "Fit:";
const GAP_PREFIX = "Gap:";

function clean(text: string): string {
  return text.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
}

export function fitAdvice(text: string): string {
  return `${FIT_PREFIX} ${clean(text)}`;
}

export function gapAdvice(text: string): string {
  return `${GAP_PREFIX} ${clean(text)}`;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLikeGap(reason: string): boolean {
  return /\b(?:below|gap|limited|missing|no|not listed|not shown|unranked|stale|weak)\b/i.test(
    reason,
  );
}

export interface JudgeAdvice {
  summary: string;
  fits: string[];
  gaps: string[];
}

export function splitJudgeAdvice(
  reasons: string[],
  rawSummary: string | null,
): JudgeAdvice {
  const fits: string[] = [];
  const gaps: string[] = [];

  for (const rawReason of reasons) {
    const reason = clean(rawReason);
    if (!reason) continue;
    if (reason.toLowerCase().startsWith(FIT_PREFIX.toLowerCase())) {
      fits.push(clean(reason.slice(FIT_PREFIX.length)));
    } else if (reason.toLowerCase().startsWith(GAP_PREFIX.toLowerCase())) {
      gaps.push(clean(reason.slice(GAP_PREFIX.length)));
    } else if (looksLikeGap(reason)) {
      gaps.push(reason);
    } else {
      fits.push(reason);
    }
  }

  let summary = clean(rawSummary ?? "").replace(
    /^(?:strong|possible|good|great|moderate|partial|weak|poor|low)\s+fit\s*[:.\-–—]?\s*/i,
    "",
  );
  const legacyGap = summary.match(/\bgaps?\s*:\s*(.+)$/i);
  if (legacyGap) {
    gaps.push(clean(legacyGap[1].replace(/\s+tier\s+\S+.*$/i, "")));
    summary = clean(summary.slice(0, legacyGap.index));
  }

  if (!summary) {
    summary = fits[0] || gaps[0] || "The judge needs more résumé evidence to explain this score.";
  }

  return {
    summary,
    fits: unique(fits),
    gaps: unique(gaps),
  };
}
