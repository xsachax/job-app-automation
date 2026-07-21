"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/sources", label: "Sources" },
  { href: "/workday", label: "Workday" },
  { href: "/profile", label: "Profile" },
  { href: "/criteria", label: "Criteria" },
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
                : "text-gray-700 hover:bg-gray-100")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
