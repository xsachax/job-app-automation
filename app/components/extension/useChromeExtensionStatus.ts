"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isGoogleChromeBrowser,
  pingAutofillExtension,
} from "@/lib/chromeExtension";

export type ChromeExtensionState =
  | "checking"
  | "connected"
  | "off"
  | "unavailable"
  | "unsupported";

export interface ChromeExtensionStatus {
  state: ChromeExtensionState;
  version?: string;
}

async function detectStatus(): Promise<ChromeExtensionStatus> {
  if (!isGoogleChromeBrowser()) {
    return { state: "unsupported" };
  }

  try {
    const response = await pingAutofillExtension();
    return {
      state: response.enabled ? "connected" : "off",
      version: response.version,
    };
  } catch {
    return { state: "unavailable" };
  }
}

export function useChromeExtensionStatus() {
  const [status, setStatus] = useState<ChromeExtensionStatus>({
    state: "checking",
  });
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setStatus({ state: "checking" });
    const nextStatus = await detectStatus();
    if (currentRequest === requestId.current) {
      setStatus(nextStatus);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const handleFocus = () => {
      if (active) void refresh();
    };

    void Promise.resolve().then(handleFocus);
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      requestId.current += 1;
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  return { status, refresh };
}
