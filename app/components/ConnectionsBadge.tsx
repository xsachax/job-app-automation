"use client";

import { useRef, useState } from "react";
import { api } from "./api";

interface ConnectionContact {
  name: string;
  position: string;
  url?: string;
}

interface ConnectionDetails {
  count: number;
  contacts: ConnectionContact[];
}

export function ConnectionsBadge({
  company,
  count,
  contacts,
}: {
  company: string;
  count: number;
  contacts: ConnectionContact[];
}) {
  const [details, setDetails] = useState<ConnectionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const visibleContacts = details?.contacts ?? contacts;
  const more = Math.max(0, count - visibleContacts.length);
  const contactSummary = visibleContacts
    .map((contact) =>
      contact.position
        ? `${contact.name} — ${contact.position}`
        : contact.name,
    )
    .join("; ");
  const accessibleDetails = contactSummary || "Contact names unavailable";

  async function loadAllConnections() {
    if (
      details ||
      loadingRef.current ||
      count <= contacts.length
    ) {
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ company });
      setDetails(
        await api<ConnectionDetails>(`/api/connections?${query.toString()}`),
      );
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  if (!count) return null;
  return (
    <span
      className="group relative inline-flex cursor-help items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800 outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:bg-teal-950 dark:text-teal-200"
      tabIndex={0}
      data-testid="connections-badge"
      aria-label={`${count} ${
        count === 1 ? "connection" : "connections"
      }: ${accessibleDetails}${more ? `; ${more} more` : ""}`}
      onMouseEnter={() => void loadAllConnections()}
      onFocus={() => void loadAllConnections()}
    >
      <span aria-hidden>🤝</span>
      {count} {count === 1 ? "connection" : "connections"}
      <span
        role="tooltip"
        className="invisible absolute left-1/2 top-full z-40 max-h-80 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-left text-xs font-normal text-gray-700 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        <span className="mb-2 block font-semibold text-gray-950 dark:text-gray-50">
          Your connections at {company}
        </span>
        {visibleContacts.length ? (
          <span className="block space-y-1.5">
            {visibleContacts.map((contact, index) => (
              <span
                className="block"
                key={`${contact.name}-${contact.position}-${index}`}
              >
                <span className="block font-medium">{contact.name}</span>
                {contact.position && (
                  <span className="block text-gray-500 dark:text-gray-400">
                    {contact.position}
                  </span>
                )}
              </span>
            ))}
          </span>
        ) : (
          <span className="block text-gray-500 dark:text-gray-400">
            Contact names are unavailable.
          </span>
        )}
        {loading && (
          <span className="mt-2 block text-gray-500 dark:text-gray-400">
            Loading all connections…
          </span>
        )}
        {error && (
          <span className="mt-2 block text-red-600 dark:text-red-400">
            Could not load every connection: {error}
          </span>
        )}
        {more > 0 && !loading && (
          <span className="mt-2 block border-t border-gray-200 pt-2 text-gray-500 dark:border-gray-700 dark:text-gray-400">
            +{more} more
            {details
              ? " — re-import Connections.csv to list names omitted by an older import."
              : ""}
          </span>
        )}
      </span>
    </span>
  );
}
