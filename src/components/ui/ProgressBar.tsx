import { clsx } from "clsx";
import type { StatusTone } from "@/components/ui/StatusBadge";

const toneClasses: Record<StatusTone, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-300",
  red: "bg-red-400",
  neutral: "bg-slate-400"
};

export function ProgressBar({ value, tone = "neutral" }: { value: number; tone?: StatusTone }) {
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;

  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <div className={clsx("h-full rounded-full", toneClasses[tone])} style={{ width: `${safeValue}%` }} />
    </div>
  );
}
