import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";

export function KpiCard({
  title,
  actual,
  target,
  achievement,
  forecast,
  requiredDaily,
  tone = "neutral"
}: {
  title: string;
  actual: string;
  target: string;
  achievement: number;
  forecast: string;
  requiredDaily: string;
  tone?: StatusTone;
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-ink-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">Ist {actual} / Ziel {target}</p>
        </div>
        <StatusBadge tone={tone}>{Math.round(achievement)}%</StatusBadge>
      </div>

      <div className="mt-5">
        <ProgressBar value={achievement} tone={tone} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Prognose</dt>
          <dd className="mt-1 font-semibold text-slate-100">{forecast}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Tagesbedarf</dt>
          <dd className="mt-1 font-semibold text-slate-100">{requiredDaily}</dd>
        </div>
      </dl>
    </article>
  );
}
