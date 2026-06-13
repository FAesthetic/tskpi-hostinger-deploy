import type { ReactNode } from "react";

export function FormModal({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-900 p-5 shadow-cockpit">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
