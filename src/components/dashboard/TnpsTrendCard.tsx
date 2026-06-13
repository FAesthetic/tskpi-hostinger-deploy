import { StatusBadge } from "@/components/ui/StatusBadge";

export function TnpsTrendCard({
  value,
  target,
  trendLabel
}: {
  value: number | null;
  target?: number;
  trendLabel: string;
}) {
  const isAboveTarget = target === undefined || value === null ? null : value >= target;

  return (
    <article className="rounded-lg border border-white/10 bg-ink-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">tNPS</h3>
          <p className="mt-1 text-sm text-slate-400">{trendLabel}</p>
        </div>
        <StatusBadge tone={isAboveTarget === null ? "neutral" : isAboveTarget ? "green" : "red"}>
          {value ?? "-"}
        </StatusBadge>
      </div>
    </article>
  );
}
