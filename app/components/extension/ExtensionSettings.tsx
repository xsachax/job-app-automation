"use client";

import { useEffect, useRef, useState } from "react";
import {
  isChromeExtensionId,
  normalizeChromeExtensionId,
  pingAutofillExtension,
  readChromeExtensionId,
  saveChromeExtensionId,
} from "@/lib/chromeExtension";
import { cls } from "../ui";

type ConnectionStatus = {
  tone: "success" | "error" | "muted";
  message: string;
};

export function ExtensionSettings() {
  const [extensionId, setExtensionId] = useState("");
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const connectionAttempt = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        setExtensionId(readChromeExtensionId());
      } catch (caught) {
        setStatus({
          tone: "error",
          message: caught instanceof Error ? caught.message : String(caught),
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function connectExtension(normalizedId: string, attempt: number) {
    setChecking(true);
    setStatus(null);
    try {
      const savedId = saveChromeExtensionId(normalizedId);
      const response = await pingAutofillExtension(savedId);
      if (connectionAttempt.current !== attempt) return;
      setStatus({
        tone: response.enabled ? "success" : "muted",
        message: response.enabled
          ? `Connected to extension version ${response.version}.`
          : `Connected to version ${response.version}, but the extension is turned off.`,
      });
    } catch (caught) {
      if (connectionAttempt.current !== attempt) return;
      setStatus({
        tone: "error",
        message: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      if (connectionAttempt.current === attempt) setChecking(false);
    }
  }

  function updateExtensionId(value: string) {
    setExtensionId(value);
    const normalizedId = normalizeChromeExtensionId(value);
    const attempt = ++connectionAttempt.current;

    if (!isChromeExtensionId(normalizedId)) {
      setChecking(false);
      try {
        saveChromeExtensionId("");
        setStatus(
          normalizedId.length >= 32
            ? {
                tone: "error",
                message: "Enter a valid 32-character Chrome extension ID.",
              }
            : null,
        );
      } catch (caught) {
        setStatus({
          tone: "error",
          message: caught instanceof Error ? caught.message : String(caught),
        });
      }
      return;
    }

    void connectExtension(normalizedId, attempt);
  }

  async function openChromeExtensions() {
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
        <h2 className="text-lg font-semibold">Chrome autofill extension</h2>
        <button
          type="button"
          className={cls.btnPrimary}
          onClick={() => void openChromeExtensions()}
          disabled={opening}
        >
          {opening ? "Opening…" : "Open Chrome extensions"}
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="chromeExtensionId" className={cls.label}>
          Chrome extension ID
        </label>
        <input
          id="chromeExtensionId"
          className={cls.input + " mt-2 font-mono"}
          value={extensionId}
          onChange={(event) => updateExtensionId(event.target.value)}
          placeholder="Paste extension ID"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {checking && <p className="mt-3 text-sm text-gray-500">Connecting…</p>}
      {status && <p className={`mt-3 text-sm ${statusClass}`}>{status.message}</p>}
    </section>
  );
}
