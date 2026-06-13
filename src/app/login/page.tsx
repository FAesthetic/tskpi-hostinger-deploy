import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-5 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-ink-900 p-7 shadow-cockpit">
        <Suspense fallback={<p className="text-sm text-slate-300">Login wird vorbereitet...</p>}>
          <AuthForm />
        </Suspense>
      </section>
    </main>
  );
}
