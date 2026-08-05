"use client";

import { useEffect, useState } from "react";
import {
  isGoogleChromeBrowser,
  pingAutofillExtension,
} from "@/lib/chromeExtension";
import { cls } from "../ui";

type ConnectionStatus = {
  tone: "success" | "error" | "muted";
  message: string;
};

export function ExtensionSettings() {
  const [chromeSupported, setChromeSupported] = useState<boolean | null>(null);
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    let active = true;
    let handleFocus: (() => void) | null = null;
    void Promise.resolve().then(() => {
      if (!active) return;
      const supported = isGoogleChromeBrowser();
      setChromeSupported(supported);
      if (!supported) return;

      async function checkConnection() {
        setChecking(true);
        try {
          const response = await pingAutofillExtension();
          if (!active) return;
          setStatus({
            tone: response.enabled ? "success" : "muted",
            message: response.enabled
              ? `Connected to extension version ${response.version}.`
              : `Connected to version ${response.version}, but the extension is turned off.`,
          });
        } catch {
          if (!active) return;
          setStatus({
            tone: "muted",
            message: "Extension not installed or waiting to be reloaded.",
          });
        } finally {
          if (active) setChecking(false);
        }
      }

      handleFocus = () => void checkConnection();
      void checkConnection();
      window.addEventListener("focus", handleFocus);
    });

    return () => {
      active = false;
      if (handleFocus) window.removeEventListener("focus", handleFocus);
    };
  }, []);

  async function openChromeExtensions() {
    if (!chromeSupported) return;
    setOpening(true);
    setStatus(null);
    try {
      const response = await fetch("/api/chrome-extension/open", { method: "POST" });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || body.ok !== true) {
        throw new Error(body.error || "Chrome extensions could not be opened.");
      }
    } catch (caught) {
      setStatus({
        tone: "error",
        message: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setOpening(false);
    }
  }

  const statusClass =
    status?.tone === "success"
      ? "text-green-700 dark:text-green-300"
      : status?.tone === "error"
        ? "text-red-700 dark:text-red-300"
        : "text-gray-500 dark:text-gray-400";

  return (
    <section id="chrome-extension" className={cls.card + " mb-6 scroll-mt-6"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chrome autofill extension</h2>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Supported only in Google Chrome.
          </p>
        </div>
        <button
          type="button"
          className={cls.btnPrimary}
          onClick={() => void openChromeExtensions()}
          disabled={opening || chromeSupported !== true}
        >
          {opening ? "Opening…" : "Open Chrome extensions"}
        </button>
      </div>

      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Enable Developer mode, choose <strong>Load unpacked</strong>, select{" "}
        <code>apps/chrome-extension</code>, then return to this dashboard. It connects
        automatically.
      </p>

      {chromeSupported === false && (
        <p
          role="alert"
          className="mt-3 text-sm font-medium text-red-700 dark:text-red-300"
        >
          Unsupported browser. Open this dashboard in Google Chrome.
        </p>
      )}
      {checking && !status && <p className="mt-3 text-sm text-gray-500">Checking…</p>}
      {status && <p className={`mt-3 text-sm ${statusClass}`}>{status.message}</p>}
    </section>
  );
}
