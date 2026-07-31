"use client";

import { useState } from "react";
import { companyInitials, companyLogoUrl } from "@/lib/companyDomain";

// A curated, contrast-checked palette for monogram fallbacks. Every colour is
// dark enough to carry white initials (large bold text, ≥3:1). Picked by a hash
// of the company name so a given company always gets the same colour.
const MONOGRAM_COLORS = [
  "#4f46e5", // indigo
  "#7c3aed", // violet
  "#2563eb", // blue
  "#0369a1", // sky-700
  "#0f766e", // teal-700
  "#047857", // emerald-700
  "#b45309", // amber-700
  "#c2410c", // orange-700
  "#be123c", // rose-700
  "#a21caf", // fuchsia-700
  "#475569", // slate-600
  "#0e7490", // cyan-700
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
}

interface CompanyLogoProps {
  company: string;
  /** Square size in pixels. */
  size?: number;
}

// Company logo avatar: a real favicon-style logo when we can resolve one, with a
// coloured monogram fallback whenever the domain is unknown or the image fails
// to load — so a card never shows a broken image.
export function CompanyLogo({ company, size = 40 }: CompanyLogoProps) {
  const src = companyLogoUrl(company);
  const [failed, setFailed] = useState(false);
  const dimension = { width: size, height: size };

  if (src && !failed) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        style={dimension}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- third-party favicon host, not a local asset */}
        <img
          src={src}
          alt={`${company} logo`}
          width={size - 8}
          height={size - 8}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-[calc(100%-8px)] w-[calc(100%-8px)] object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-label={`${company} logo`}
      role="img"
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white"
      style={{ ...dimension, backgroundColor: colorFor(company), fontSize: size * 0.4 }}
    >
      {companyInitials(company)}
    </span>
  );
}
