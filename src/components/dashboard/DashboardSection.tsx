import type { ReactNode } from "react";

export function DashboardSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-900 p-5">
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
