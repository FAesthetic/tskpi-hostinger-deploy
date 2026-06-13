import type { ReactNode } from "react";

export function DataTable({
  columns,
  children
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
          <tr>
            {columns.map((column) => (
              <th className="px-4 py-3" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">{children}</tbody>
      </table>
    </div>
  );
}
