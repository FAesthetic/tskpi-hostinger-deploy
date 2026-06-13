"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestedShopId, setRequestedShopId] = useState("");
  const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const nextPath = searchParams.get("next") ?? "/dashboard";
  const isSignUp = mode === "sign-up";

  useEffect(() => {
    supabase
      .from("shops")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const visibleShops = data ?? [];
        setShops(visibleShops);
        setRequestedShopId((current) => current || visibleShops[0]?.id || "");
      });
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    const emailRedirectTo = buildAuthRedirectUrl(nextPath);

    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo,
          data: {
            requested_shop_id: requestedShopId
          }
        }
      });

      setIsLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      void fetch("/api/notifications/register", {
        body: JSON.stringify({
          email: normalizedEmail,
          requestedShopId
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      setMessage("Registrierung angelegt. Bitte pruefe dein E-Mail-Postfach.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    setIsLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  async function handleMagicLink() {
    setIsLoading(true);
    setError(null);
    setMessage(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: buildAuthRedirectUrl(nextPath)
      }
    });

    setIsLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setMessage("Magic Link gesendet. Bitte pruefe dein E-Mail-Postfach.");
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pulse-500">
          TS KPI
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          {isSignUp ? "Account erstellen" : "Einloggen"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Zugriff auf dein internes KPI-Cockpit mit Supabase Auth und shopbasierter
          Rechtepruefung.
        </p>
      </div>

      {message ? (
        <div className="rounded-md border border-pulse-500/20 bg-pulse-500/10 px-3 py-2 text-sm text-pulse-500">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="email">
          E-Mail
        </label>
        <input
          className="h-11 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition placeholder:text-slate-600 focus:border-pulse-500 focus:ring-2 focus:ring-pulse-500/20"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="password">
          Passwort
        </label>
        <input
          className="h-11 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition placeholder:text-slate-600 focus:border-pulse-500 focus:ring-2 focus:ring-pulse-500/20"
          id="password"
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {isSignUp ? (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="requested_shop_id">
            Wunsch-Shop
          </label>
          <select
            className="h-11 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition focus:border-pulse-500 focus:ring-2 focus:ring-pulse-500/20"
            id="requested_shop_id"
            name="requested_shop_id"
            onChange={(event) => setRequestedShopId(event.target.value)}
            value={requestedShopId}
          >
            {shops.length ? (
              shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))
            ) : (
              <option value="">Shop wird nach Freigabe gesetzt</option>
            )}
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Der Zugang wird erst nach Admin-Freigabe aktiv.
          </p>
        </div>
      ) : null}

      <button
        className="h-11 rounded-md bg-pulse-600 px-4 text-sm font-semibold text-white transition hover:bg-pulse-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading}
        type="submit"
      >
        {isLoading ? "Bitte warten" : isSignUp ? "Account erstellen" : "Einloggen"}
      </button>

      <button
        className="h-11 rounded-md border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading || !email}
        onClick={handleMagicLink}
        type="button"
      >
        Magic Link senden
      </button>

      <button
        className="justify-self-start text-sm font-semibold text-pulse-500 transition hover:text-pulse-400"
        onClick={() => {
          setMode(isSignUp ? "sign-in" : "sign-up");
          setError(null);
          setMessage(null);
        }}
        type="button"
      >
        {isSignUp ? "Schon registriert? Einloggen" : "Noch kein Account? Registrieren"}
      </button>
    </form>
  );
}

function buildAuthRedirectUrl(nextPath: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const origin = browserOrigin || configuredOrigin;

  return `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}
