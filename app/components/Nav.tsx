"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const primaryLinks = [
  { href: "/", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/judge", label: "Judge" },
];

const tierLinks = [
  { href: "/tiers", label: "Company tiers" },
  { href: "/location-tiers", label: "Location tiers" },
];

const profileLink = { href: "/profile", label: "Profile" };
const settingsLink = { href: "/settings", label: "Settings" };

function linkClass(active: boolean, indented = false) {
  return (
    "block rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
    (indented ? "ml-3 " : "") +
    (active
      ? "bg-indigo-600 text-white"
      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800")
  );
}

export function Nav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const tiersActive = tierLinks.some((l) => isActive(l.href));

  // Expanded whenever the user is on a tier page; still user-toggleable
  // otherwise. Adjust during render (React's recommended pattern) so entering a
  // tier route re-opens the group without an effect-driven cascade.
  const [tiersOpen, setTiersOpen] = useState(tiersActive);
  const [wasActive, setWasActive] = useState(tiersActive);
  if (tiersActive !== wasActive) {
    setWasActive(tiersActive);
    if (tiersActive) setTiersOpen(true);
  }

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {primaryLinks.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? "page" : undefined}
          className={linkClass(isActive(l.href))}
        >
          {l.label}
        </Link>
      ))}

      <div>
        <button
          type="button"
          onClick={() => setTiersOpen((o) => !o)}
          aria-expanded={tiersOpen}
          aria-controls="nav-tier-lists"
          data-testid="nav-tier-lists-toggle"
          className={
            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors " +
            (tiersActive && !tiersOpen
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800")
          }
        >
          <span>Tier lists</span>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={
              "h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ease-out motion-reduce:transition-none dark:text-gray-500 " +
              (tiersOpen ? "rotate-90" : "")
            }
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {tiersOpen && (
          <div id="nav-tier-lists" className="mt-1 flex flex-col gap-1">
            {tierLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={linkClass(isActive(l.href), true)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href={profileLink.href}
        aria-current={isActive(profileLink.href) ? "page" : undefined}
        className={linkClass(isActive(profileLink.href)) + " mt-auto"}
      >
        {profileLink.label}
      </Link>

      <Link
        href={settingsLink.href}
        aria-current={isActive(settingsLink.href) ? "page" : undefined}
        className={linkClass(isActive(settingsLink.href))}
      >
        {settingsLink.label}
      </Link>
    </nav>
  );
}
