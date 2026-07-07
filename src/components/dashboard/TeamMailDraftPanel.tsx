"use client";

import Link from "next/link";
import { Check, Copy, RefreshCcw } from "lucide-react";
import { useRef, useState } from "react";

export type TeamMailDraft = {
  body: string;
  mode: "openai" | "rules";
  subject: string;
};

export function TeamMailDraftPanel({
  regenerateHref,
  teamMailDraft
}: {
  regenerateHref: string;
  teamMailDraft: TeamMailDraft;
}) {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const copyText = `Betreff: ${teamMailDraft.subject}\n\n${teamMailDraft.body}`;

  async function copyMailText() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
            Team-Mail
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">{teamMailDraft.subject}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="secondary-button inline-flex h-10 items-center justify-center gap-2 px-3"
            onClick={copyMailText}
            type="button"
          >
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
            {copied ? "Kopiert" : "Text kopieren"}
          </button>
          <Link className="secondary-button inline-flex h-10 items-center justify-center gap-2 px-3" href={regenerateHref} scroll={false}>
            <RefreshCcw aria-hidden className="h-4 w-4" />
            Neu generieren
          </Link>
        </div>
      </div>

      <textarea
        className="mt-4 min-h-60 w-full rounded-lg border border-white/[0.08] bg-black/20 p-4 text-sm leading-6 text-slate-300 outline-none focus:border-pulse-500/50 focus:ring-2 focus:ring-pulse-500/10"
        readOnly
        ref={textareaRef}
        value={copyText}
      />
    </div>
  );
}
