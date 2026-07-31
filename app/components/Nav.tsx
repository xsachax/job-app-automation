"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/tiers", label: "Tiers" },
  { href: "/settings", label: "Settings" },
  { href: "/profile", label: "Profile" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (active
                ? "bg-indigo-600 text-white"
                : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
