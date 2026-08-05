"use client";

import { TierBoard } from "../components/TierBoard";

function LocationPin() {
  return (
    <span
      aria-hidden
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1.75c2.35 0 4.25 1.9 4.25 4.25 0 3-4.25 8.25-4.25 8.25S3.75 9 3.75 6C3.75 3.65 5.65 1.75 8 1.75Z" />
        <circle cx="8" cy="6" r="1.6" />
      </svg>
    </span>
  );
}

export default function LocationTiersPage() {
  return (
    <TierBoard
      title="Location tiers"
      subtitle="Rank the places you'd actually work S→F. Tiers nudge the fit score of every job in that location, while unrated locations stay neutral like E tier. The board lists the most popular locations from your discovered jobs."
      endpoint="/api/location-tiers"
      itemsKey="locations"
      field="location"
      noun="locations"
      emptyPool="No locations discovered yet."
      searchPlaceholder="Search locations…"
      searchAriaLabel="Search unrated locations"
      renderIcon={() => <LocationPin />}
      countLabel={(count) => `${count} open role${count === 1 ? "" : "s"}`}
      poolNote="Unrated locations stay neutral at the same score as E tier."
    />
  );
}
