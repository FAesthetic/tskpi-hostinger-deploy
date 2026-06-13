import { clsx } from "clsx";
import type { ReactNode } from "react";

export type StatusTone = "green" | "yellow" | "red" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  green: "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200",
  yellow: "border-amber-200/15 bg-amber-200/[0.07] text-amber-100",
  red: "border-red-300/15 bg-red-300/[0.07] text-red-100",
  neutral: "border-white/[0.09] bg-white/[0.045] text-slate-300"
};

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}
