import type { AutofillSession } from "@/lib/chromeExtension";
import { cls } from "../ui";

const statusLabels: Record<string, string> = {
  opening: "Opening application…",
  loading: "Loading application…",
  active: "Tracking live",
  paused: "Extension is turned off",
  dismissed: "Application panel closed",
  closed: "Application tab closed",
  "left-application": "Application tab left the original site",
};

export function AutofillProgressCard({
  session,
  onDismiss,
}: {
  session: AutofillSession;
  onDismiss: () => void;
}) {
  const progress = session.progress;
  const percentage = progress.total
    ? Math.round((progress.answered / progress.total) * 100)
    : 0;
  const title =
    [session.jobTitle, session.company].filter(Boolean).join(" at ") ||
    "Application progress";
  const state =
    session.status === "error"
      ? session.error || "The extension could not open on this page"
      : statusLabels[session.status] || "Waiting for application";

  return (
    <section className={cls.card + " mb-4"} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            Autofill extension
          </p>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{state}</p>
        </div>
        <button type="button" className={cls.btn} onClick={onDismiss}>
          Hide
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
        <span>
          {progress.answered} of {progress.total} answered
        </span>
        <strong>{percentage}%</strong>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-green-600 transition-[width] dark:bg-green-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ["Autofilled", progress.filledByExtension],
          ["Ready to fill", progress.readyToFill],
          ["Need attention", progress.needsAttention],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950"
          >
            <strong className="block text-base">{value}</strong>
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {progress.unknownFields.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Needs your answer</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {progress.unknownFields.slice(0, 10).map((field, index) => (
              <li
                key={`${field.label}-${index}`}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs dark:border-gray-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <strong>{field.label}</strong>
                  {field.required && (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:bg-red-950 dark:text-red-300">
                      Required
                    </span>
                  )}
                </div>
                <p className="mt-1 text-gray-500 dark:text-gray-400">{field.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
