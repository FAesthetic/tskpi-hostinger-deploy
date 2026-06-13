import { createShopAction } from "@/app/actions/shop";

export function ShopCreatePanel({ compact = false }: { compact?: boolean }) {
  return (
    <section className="rounded-lg border border-pulse-500/20 bg-pulse-500/[0.06] p-5 shadow-cockpit">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
          Admin
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Shop anlegen</h2>
        {!compact ? (
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Neue Shops werden mandantenfaehig angelegt und danach ueber Rollen freigegeben.
          </p>
        ) : null}
      </div>

      <form action={createShopAction} className="mt-5 grid gap-4">
        <Field label="Name" name="name" placeholder="Husum" required />
        <Field label="Slug" name="slug" placeholder="husum" />
        <Field label="Standort" name="location" placeholder="Schleswig-Holstein" />
        <button
          className="h-11 rounded-md bg-pulse-500 px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(226,0,116,0.24)] transition hover:bg-pulse-600"
          type="submit"
        >
          Shop erstellen
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  name,
  placeholder,
  required = false
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <input
        className="h-11 rounded-md border border-white/10 bg-white/[0.05] px-3 text-white outline-none transition placeholder:text-slate-600 focus:border-pulse-500 focus:ring-2 focus:ring-pulse-500/20"
        minLength={required ? 2 : undefined}
        name={name}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}
