"use client";

import { useEffect, useState } from "react";
import {
  CHROME_EXTENSION_LOCAL_PATH,
  CHROME_EXTENSIONS_PAGE,
  CHROME_WEB_STORE_URL,
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
  const [dashboardOrigin, setDashboardOrigin] = useState("");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<"folder" | "setup-url" | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setDashboardOrigin(window.location.origin);
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

  async function saveAndTest() {
    setChecking(true);
    setStatus(null);

    try {
      const savedId = saveChromeExtensionId(extensionId);
      setExtensionId(savedId);
      const response = await pingAutofillExtension(savedId);
      setStatus({
        tone: response.enabled ? "success" : "muted",
        message: response.enabled
          ? `Connected to extension version ${response.version}.`
          : `Connected to version ${response.version}, but the extension is turned off.`,
      });
    } catch (caught) {
      setStatus({
        tone: "error",
        message: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setChecking(false);
    }
  }

  function disconnect() {
    try {
      saveChromeExtensionId("");
      setExtensionId("");
      setStatus({
        tone: "muted",
        message: "Dashboard integration disabled. Job links will open normally.",
      });
    } catch (caught) {
      setStatus({
        tone: "error",
        message: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }

  async function copyInstallValue(
    value: string,
    target: "folder" | "setup-url",
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setStatus(null);
    } catch (caught) {
      setStatus({
        tone: "error",
        message: caught instanceof Error ? caught.message : String(caught),
      });
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chrome autofill extension</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Load <code>apps/chrome-extension</code> as an unpacked extension, then
            paste its ID here. The ID stays in this browser.
          </p>
        </div>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
          Local browser
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Install in Chrome
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
              Chrome does not allow dashboards to install unpacked extensions
              automatically. Open the extensions page, enable Developer mode, and
              load the local folder.
            </p>
          </div>
          <a
            href={CHROME_WEB_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className={cls.btn}
          >
            Open Chrome Web Store ↗
          </a>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cls.btn}
            onClick={() =>
              void copyInstallValue(CHROME_EXTENSIONS_PAGE, "setup-url")
            }
          >
            {copied === "setup-url"
              ? "Copied Chrome setup URL"
              : "Copy Chrome setup URL"}
          </button>
          <button
            type="button"
            className={cls.btn}
            onClick={() =>
              void copyInstallValue(CHROME_EXTENSION_LOCAL_PATH, "folder")
            }
          >
            {copied === "folder" ? "Copied extension folder" : "Copy extension folder"}
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Paste <code>{CHROME_EXTENSIONS_PAGE}</code> into Chrome, then choose{" "}
            <strong>Load unpacked</strong> and select{" "}
            <code>{CHROME_EXTENSION_LOCAL_PATH}</code>.
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label htmlFor="chromeExtensionId" className={cls.label}>
            Chrome extension ID
          </label>
          <input
            id="chromeExtensionId"
            className={cls.input + " mt-2 font-mono"}
            value={extensionId}
            onChange={(event) => {
              setExtensionId(event.target.value);
              setStatus(null);
            }}
            placeholder="32-character extension ID"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className={cls.btnPrimary}
            onClick={() => void saveAndTest()}
            disabled={checking}
          >
            {checking ? "Checking…" : "Save and test"}
          </button>
          <button type="button" className={cls.btn} onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        In the extension options, set the allowed dashboard origin to{" "}
        <code>{dashboardOrigin || "this dashboard origin"}</code>. The local MVP
        accepts localhost or 127.0.0.1 only.
      </p>
      {status && <p className={`mt-3 text-sm ${statusClass}`}>{status.message}</p>}
    </section>
  );
}
