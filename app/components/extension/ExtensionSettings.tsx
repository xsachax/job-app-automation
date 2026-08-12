"use client";

import Link from "next/link";
import { useState } from "react";
import { cls } from "../ui";
import { useChromeExtensionStatus } from "./useChromeExtensionStatus";

export function ExtensionSettings() {
  const { status } = useChromeExtensionStatus();
  const [opening, setOpening] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function openChromeExtensions() {
    if (status.state === "unsupported" || status.state === "checking") return;
    setOpening(true);
    setActionError(null);
    try {
      const response = await fetch("/api/chrome-extension/open", { method: "POST" });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || body.ok !== true) {
        throw new Error(body.error || "Chrome extensions could not be opened.");
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setOpening(false);
    }
  }

  const connection = {
    checking: {
      label: "Checking",
      detail: "Looking for the extension in Google Chrome.",
      dot: "bg-gray-400 animate-pulse",
    },
    connected: {
      label: "Connected",
      detail: `Version ${status.version ?? "unknown"} is ready for autofill.`,
      dot: "bg-green-500",
    },
    off: {
      label: "Turned off",
      detail: `Version ${status.version ?? "unknown"} is installed but disabled.`,
      dot: "bg-amber-500",
    },
    unavailable: {
      label: "Not connected",
      detail: "Install the extension or reload it from Chrome's extension manager.",
      dot: "bg-red-500",
    },
    unsupported: {
      label: "Unsupported browser",
      detail: "Open this dashboard in desktop Google Chrome.",
      dot: "bg-gray-400",
    },
  }[status.state];

  return (
    <section id="chrome-extension" className={cls.card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Connection status</h2>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Supported only in Google Chrome.
          </p>
        </div>
        <button
          type="button"
          className={cls.btnPrimary}
          onClick={() => void openChromeExtensions()}
          disabled={
            opening ||
            status.state === "checking" ||
            status.state === "unsupported"
          }
        >
          {opening ? "Opening…" : "Open Chrome extensions"}
        </button>
      </div>

      <div
        role="status"
        className="mt-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950"
      >
        <span
          aria-hidden
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${connection.dot}`}
        />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {connection.label}
          </p>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {connection.detail}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Enable Developer mode, choose <strong>Load unpacked</strong>, select{" "}
        <code>apps/chrome-extension</code>, then return to this dashboard. It connects
        automatically.
      </p>

      <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
        <p className="font-semibold">Optional AI-assisted pass</p>
        <p className="mt-1 text-xs leading-5">
          After normal autofill, choose <strong>AI assist remaining fields</strong>.
          Only then will the extension send unresolved required-field text and your
          saved profile to the OpenAI/Anthropic provider configured in{" "}
          <Link className="underline" href="/settings">
            Settings
          </Link>
          . If that provider has no key or fails, the server tries your local
          Copilot CLI. Answers are filled for review and never submitted.
        </p>
      </div>

      {actionError && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">
          {actionError}
        </p>
      )}
    </section>
  );
}
