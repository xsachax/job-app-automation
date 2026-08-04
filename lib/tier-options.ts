// Shared helper for trimming a tier board's option pool down to the entries
// worth ranking. Discovered locations are messy free text and the long tail is
// dominated by one-off cities that clutter the board, so we surface only the
// most popular options — while always keeping anything the user has already
// ranked, so a saved tier can never silently vanish from the board.

export interface PopularOption {
  count: number;
  tier: string | null;
}

// Default cap for how many of the most-popular options a tier board shows.
export const MAX_LOCATION_OPTIONS = 60;

// Returns the `max` highest-count rows plus every ranked row (regardless of
// rank), sorted by count desc with a stable name tiebreak when a `name`
// selector is supplied. Ranked rows beyond the cap are appended so persisted
// tiers always remain visible and editable.
export function limitToPopular<T extends PopularOption>(
  rows: T[],
  max: number,
  name?: (row: T) => string,
): T[] {
  const byPopularity = [...rows].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return name ? name(a).localeCompare(name(b)) : 0;
  });

  const top = byPopularity.slice(0, Math.max(0, max));
  const kept = new Set(top);
  const rankedTail = byPopularity.slice(Math.max(0, max)).filter((r) => r.tier != null && !kept.has(r));

  return [...top, ...rankedTail];
}
