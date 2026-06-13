export function QuarterSelector({
  year,
  quarter
}: {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-white/10 bg-ink-800 text-sm">
      {[1, 2, 3, 4].map((item) => (
        <button
          className={
            item === quarter
              ? "bg-pulse-600 px-3 py-2 font-semibold text-white"
              : "px-3 py-2 font-medium text-slate-300 hover:bg-white/10"
          }
          key={item}
          type="button"
        >
          Q{item}
        </button>
      ))}
      <span className="border-l border-white/10 px-3 py-2 text-slate-400">{year}</span>
    </div>
  );
}
