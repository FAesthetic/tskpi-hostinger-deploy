"use client";

import { Bot, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DivaChat } from "@/components/analysis/DivaChat";

export function DivaFloatingChat({
  quarter,
  shopId,
  shopName,
  year
}: {
  quarter: number;
  shopId: string;
  shopName: string;
  year: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        aria-label="DiVA Chat oeffnen"
        className="fixed bottom-5 right-5 z-[80] inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-pulse-500/30 bg-pulse-500 text-white shadow-[0_18px_45px_rgba(226,0,116,0.28)] transition hover:-translate-y-0.5 hover:bg-pulse-400 focus:outline-none focus:ring-2 focus:ring-pulse-300/50 lg:right-8"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <MessageCircle aria-hidden className="h-6 w-6" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 px-3 py-3 backdrop-blur-sm md:items-center md:px-6">
          <button
            aria-label="DiVA Overlay schliessen"
            className="absolute inset-0"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <section className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/[0.1] bg-ink-900 shadow-[0_28px_90px_rgba(0,0,0,0.52)] animate-in fade-in zoom-in-95 duration-200">
            <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl border border-pulse-500/25 bg-pulse-500/10 text-pulse-200">
                  <Bot aria-hidden className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
                    DiVA
                  </p>
                  <h2 className="text-lg font-semibold text-white">Digitaler Vertriebsassistent</h2>
                </div>
              </div>
              <button
                aria-label="DiVA Chat schliessen"
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.035] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </header>
            <div className="max-h-[calc(92vh-74px)] overflow-y-auto p-4 md:p-5">
              <DivaChat
                className="grid gap-0"
                quarter={quarter}
                shopId={shopId}
                shopName={shopName}
                year={year}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
