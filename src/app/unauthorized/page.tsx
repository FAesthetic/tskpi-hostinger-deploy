import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-5 py-10 text-slate-100">
      <section className="grid w-full max-w-md gap-5 rounded-lg border border-white/10 bg-ink-900 p-7 shadow-cockpit">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pulse-500">
          Kein Zugriff
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Berechtigung fehlt</h1>
        <p className="text-sm leading-6 text-slate-300">
          Dein Account ist angemeldet, hat fuer diesen Bereich aber keine passende Rolle.
        </p>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-md bg-pulse-600 px-4 text-sm font-semibold text-white transition hover:bg-pulse-700"
          href="/dashboard"
        >
          Zurueck zum Dashboard
        </Link>
      </section>
    </main>
  );
}
