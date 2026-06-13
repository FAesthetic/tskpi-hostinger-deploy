"use client";

import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

type ChatMessage = {
  content: string;
  mode?: "openai" | "rules";
  role: "assistant" | "user";
};

const suggestions = [
  "Wo muss ich diese Woche am staerksten steuern?",
  "Wie ist unser TV-zu-DSL-Verhaeltnis?",
  "Was sagt die Verkaufsqualitaet aus?",
  "Welche Muster erkennst du in den Wochen?",
  "Welche Morgenrunden-Massnahmen empfiehlst du?"
];

export function DivaChat({
  className = "cockpit-card p-5",
  quarter,
  shopId,
  shopName,
  year
}: {
  className?: string;
  quarter: number;
  shopId: string;
  shopName: string;
  year: number;
}) {
  const greeting = useMemo<ChatMessage>(
    () => ({
      content:
        "Ich bin DiVA, dein Digitaler Vertriebsassistent. Frag mich nach Mustern, Verkaufsqualitaet, TV-zu-DSL, Runrate, Wochenauffaelligkeiten oder konkreten Massnahmen fuer die Morgenrunde.",
      role: "assistant"
    }),
    []
  );
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function askDiva(nextQuestion = question) {
    const cleanQuestion = nextQuestion.trim();

    if (!cleanQuestion || isLoading) {
      return;
    }

    setError("");
    setQuestion("");
    setIsLoading(true);

    const userMessage: ChatMessage = { content: cleanQuestion, role: "user" };
    const visibleHistory = [...messages, userMessage];
    setMessages(visibleHistory);

    try {
      const response = await fetch("/api/ai/diva", {
        body: JSON.stringify({
          history: visibleHistory
            .filter((message) => message.role === "assistant" || message.role === "user")
            .slice(-8)
            .map(({ content, role }) => ({ content, role })),
          question: cleanQuestion,
          quarter,
          shopId,
          year
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        message?: string;
        mode?: "openai" | "rules";
        ok?: boolean;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "DiVA konnte gerade nicht antworten.");
      }

      setMessages((current) => [
        ...current,
        {
          content: payload.answer || "Ich habe gerade keine belastbare Antwort erhalten.",
          mode: payload.mode,
          role: "assistant"
        }
      ]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "DiVA ist gerade nicht erreichbar.");
      setMessages((current) => current.filter((message) => message !== userMessage));
      setQuestion(cleanQuestion);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-pulse-500/25 bg-pulse-500/10 text-pulse-200">
            <Bot aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
              DiVA
            </p>
            <h2 className="text-xl font-semibold text-white">Digitaler Vertriebsassistent</h2>
          </div>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs font-semibold text-slate-400">
          {shopName} · Q{quarter} {year}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-400">
        DiVA nutzt KPI-, Wochen-, Ziel-, Portierungs-, Tarif- und tNPS-Kontext dieses Shops. Sensible
        Notizen und Kundennamen werden nicht an die KI gesendet.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-left text-xs font-semibold text-slate-300 transition hover:border-pulse-500/35 hover:bg-pulse-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            key={suggestion}
            onClick={() => askDiva(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="mt-5 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
        {messages.map((message, index) => (
          <div
            className={
              message.role === "user"
                ? "ml-8 rounded-2xl border border-pulse-500/20 bg-pulse-500/10 p-4 text-sm leading-6 text-white"
                : "mr-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 text-sm leading-6 text-slate-200"
            }
            key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {message.role === "user" ? "Du" : "DiVA"}
              </span>
              {message.mode ? (
                <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {message.mode === "openai" ? "AI" : "Fallback"}
                </span>
              ) : null}
            </div>
            <p className="whitespace-pre-line">{message.content}</p>
          </div>
        ))}
        {isLoading ? (
          <div className="mr-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin text-pulse-300" />
              DiVA analysiert Shopdaten...
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm leading-6 text-red-100">
          {error}
        </p>
      ) : null}

      <form
        className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          askDiva();
        }}
      >
        <label className="sr-only" htmlFor="diva-question">
          Frage an DiVA
        </label>
        <textarea
          className="min-h-24 w-full resize-y rounded-xl border border-white/[0.08] bg-transparent p-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-pulse-500/50"
          id="diva-question"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              askDiva();
            }
          }}
          placeholder="Frag z. B. warum TV gegen DSL abfaellt, wo Hochwertigkeit fehlt oder welche Wochen auffaellig sind..."
          value={question}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <Sparkles aria-hidden className="h-4 w-4 text-pulse-300" />
            Cmd/Ctrl + Enter sendet
          </span>
          <button
            className="primary-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || !question.trim()}
            type="submit"
          >
            {isLoading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
            Fragen
          </button>
        </div>
      </form>
    </section>
  );
}
