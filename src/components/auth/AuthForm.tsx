"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

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
      if (!requestedShopId && shops.length > 0) {
        setIsLoading(false);
        setError("Bitte waehle deinen Shop aus. Danach kann ein Admin deinen Zugang freigeben.");
        return;
      }

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
        setError(formatAuthError(signUpError.message));
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

      setMessage("Registrierung angelegt. Bitte bestaetige deine E-Mail. Danach wartet dein Zugang auf Admin-Freigabe.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    setIsLoading(false);

    if (signInError) {
      setError(formatAuthError(signInError.message));
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setError("Bitte gib zuerst deine E-Mail-Adresse ein.");
      return;
    }

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
      setError(formatAuthError(otpError.message));
      return;
    }

    setMessage("Magic Link gesendet. Oeffne den Link auf diesem Geraet oder kopiere ihn in deinen Browser.");
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
        <div className="flex gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-3 text-sm leading-6 text-emerald-100">
          <MailCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm leading-6 text-red-100">
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
        <div className="relative">
          <input
            className="h-11 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 pr-12 text-white outline-none transition placeholder:text-slate-600 focus:border-pulse-500 focus:ring-2 focus:ring-pulse-500/20"
            id="password"
            minLength={8}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type={isPasswordVisible ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={isPasswordVisible ? "Passwort verbergen" : "Passwort anzeigen"}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            onClick={() => setIsPasswordVisible((value) => !value)}
            type="button"
          >
            {isPasswordVisible ? (
              <EyeOff aria-hidden className="h-4 w-4" />
            ) : (
              <Eye aria-hidden className="h-4 w-4" />
            )}
          </button>
        </div>
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
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-pulse-600 px-4 text-sm font-semibold text-white transition hover:bg-pulse-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading}
        type="submit"
      >
        {isLoading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
        {isLoading ? "Wird verarbeitet..." : isSignUp ? "Account erstellen" : "Einloggen"}
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
  const origin = configuredOrigin || browserOrigin;

  return `${origin}/auth/callback?next=${encodeURIComponent(sanitizeNextPath(nextPath))}`;
}

function sanitizeNextPath(nextPath: string) {
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard";
  }

  return nextPath;
}

function formatAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "E-Mail oder Passwort stimmt nicht. Bitte pruefe die Eingabe oder nutze den Magic Link.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Bitte bestaetige zuerst deine E-Mail-Adresse. Danach kann der Admin deinen Zugang freigeben.";
  }

  if (normalized.includes("user already registered")) {
    return "Dieser Account existiert bereits. Wechsle bitte zu Einloggen oder nutze den Magic Link.";
  }

  return message;
}
