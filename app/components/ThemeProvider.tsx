"use client";

import { useSyncExternalStore, type ReactNode } from "react";

type Theme = "light" | "dark";

// The <html> `dark` class is the single source of truth. It is set before first
// paint by `themeInitScript`, and React reads it via useSyncExternalStore — the
// sanctioned pattern for external, non-React state (no setState-in-effect, no
// hydration mismatch).
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Theme {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}

// Kept as a thin wrapper so the layout reads clearly; all state lives in the
// external store above.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {theme === "dark" ? "☀︎ Light mode" : "☾ Dark mode"}
    </button>
  );
}

// Inline, blocking script that applies the persisted theme class before first
// paint. Rendered in <head> so there is no light-mode flash on load.
export const themeInitScript = `try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}`;
