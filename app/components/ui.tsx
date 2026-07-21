import type { ReactNode } from "react";

export const cls = {
  card: "rounded-xl border border-gray-200 bg-white p-5 shadow-sm",
  btnPrimary:
    "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50",
  btn: "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50",
  btnDanger:
    "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50",
  btnGreen:
    "rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50",
  input:
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none",
  label: "block text-sm font-medium text-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-700",
  drafted: "bg-blue-100 text-blue-700",
  pending_approval: "bg-amber-100 text-amber-800",
  submitted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
  failed: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-green-100 text-green-700"
      : score >= 40
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block w-9 rounded-md text-center text-xs font-semibold ${color} py-1`}>
      {score}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
