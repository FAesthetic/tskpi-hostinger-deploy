import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { saveEmployeeAction, saveSickDayAction } from "@/app/actions/team";
import { AppShell } from "@/components/layout/AppShell";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
};

type Employee = {
  id: string;
  shop_id: string;
  name: string;
  function_title: string | null;
  is_active: boolean;
  start_date: string | null;
  note: string | null;
};

type SickDay = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  day_count: number;
  note: string | null;
};

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);

  if (!selectedShop) {
    return (
      <AppShell
        globalRole={context.globalRole}
        isGlobalAdmin={context.isGlobalAdmin}
        quarter={quarter}
        selectedShop={null}
        shopAccess={context.shopAccess}
        shops={context.shops}
        year={year}
      >
        <EmptyState title="Keine Shops sichtbar" />
      </AppShell>
    );
  }

  const selectedAccess = context.shopAccess.find((item) => item.shop.id === selectedShop.id);

  if (!selectedAccess?.canViewEmployees) {
    redirect("/unauthorized");
  }

  const [employeesResult, sickDaysResult] = await Promise.all([
    context.supabase
      .from("employees")
      .select("id, shop_id, name, function_title, is_active, start_date, note")
      .eq("shop_id", selectedShop.id)
      .order("name")
      .returns<Employee[]>(),
    context.supabase
      .from("sick_days")
      .select("id, employee_id, start_date, end_date, day_count, note")
      .eq("shop_id", selectedShop.id)
      .order("start_date", { ascending: false })
      .limit(40)
      .returns<SickDay[]>()
  ]);

  const employees = employeesResult.data ?? [];
  const sickDays = sickDaysResult.data ?? [];
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const sickDaysByEmployee = sickDays.reduce<Map<string, number>>((map, sickDay) => {
    map.set(sickDay.employee_id, (map.get(sickDay.employee_id) ?? 0) + sickDay.day_count);
    return map;
  }, new Map());
  const activeCount = employees.filter((employee) => employee.is_active).length;
  const sickDaySum = sickDays.reduce((sum, sickDay) => sum + sickDay.day_count, 0);

  return (
    <AppShell
      globalRole={context.globalRole}
      isGlobalAdmin={context.isGlobalAdmin}
      quarter={quarter}
      selectedShop={selectedShop}
      shopAccess={context.shopAccess}
      shops={context.shops}
      year={year}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Aktiv" note="Mitarbeitende" value={String(activeCount)} />
        <Metric label="Inaktiv" note="Mitarbeitende" value={String(employees.length - activeCount)} />
        <Metric label="Krankentage" note="letzte Eintraege" value={String(sickDaySum)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="grid content-start gap-5">
          <section className="cockpit-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
              Personal
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Mitarbeiter anlegen
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Interne Notizen und Feedback bleiben nur fuer Admin und TSL sichtbar.
            </p>
            <EmployeeForm quarter={quarter} shopId={selectedShop.id} year={year} />
          </section>

          <section className="cockpit-card p-5">
            <h2 className="text-xl font-semibold text-white">Krankentag erfassen</h2>
            <form action={saveSickDayAction} className="mt-5 grid gap-4">
              <input name="shop_id" type="hidden" value={selectedShop.id} />
              <input name="year" type="hidden" value={year} />
              <input name="quarter" type="hidden" value={quarter} />
              <Select label="Mitarbeiter" name="employee_id">
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
              <Field label="Startdatum" name="start_date" type="date" />
              <Field label="Enddatum" name="end_date" type="date" />
              <Field label="Notiz" name="note" />
              <button className="primary-button h-11">Krankentage speichern</button>
            </form>
          </section>
        </div>

        <section className="cockpit-card p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
                Team
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{selectedShop.name}</h2>
            </div>
            <p className="text-sm text-slate-400">{employees.length} Personen</p>
          </div>

          <div className="mt-5 grid gap-4">
            {employees.length ? (
              employees.map((employee) => (
                <article className="rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:border-pulse-500/25 hover:bg-white/[0.05]" key={employee.id}>
                  <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{employee.name}</h3>
                          <p className="mt-1 text-sm text-slate-400">{employee.function_title ?? "Rolle offen"}</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${employee.is_active ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/10 text-slate-400"}`}>
                          {employee.is_active ? "aktiv" : "inaktiv"}
                        </span>
                      </div>

                      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <DataPoint label="Shop" value={selectedShop.name} />
                        <DataPoint label="Eintritt" value={employee.start_date ?? "-"} />
                        <DataPoint label="Krankentage" value={String(sickDaysByEmployee.get(employee.id) ?? 0)} />
                        <DataPoint label="Letzter Kontakt" value="optional" />
                      </dl>

                      <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Interne Notizen / Feedback
                        </p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">
                          {employee.note || "Noch keine interne Notiz hinterlegt."}
                        </p>
                      </div>
                    </div>

                    <form action={saveEmployeeAction} className="grid gap-3 rounded-lg border border-white/10 bg-black/15 p-4">
                      <input name="id" type="hidden" value={employee.id} />
                      <input name="shop_id" type="hidden" value={selectedShop.id} />
                      <input name="year" type="hidden" value={year} />
                      <input name="quarter" type="hidden" value={quarter} />
                      <Field label="Name" name="name" value={employee.name} />
                      <Field label="Rolle / Funktion" name="function_title" value={employee.function_title ?? ""} />
                      <Field label="Eintrittsdatum" name="start_date" type="date" value={employee.start_date ?? ""} />
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input defaultChecked={employee.is_active} name="is_active" type="checkbox" />
                        aktiv
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-300">Interne Notizen / Entwicklung / Feedback</span>
                        <textarea className={`${inputClass} min-h-28 py-2`} defaultValue={employee.note ?? ""} name="note" />
                      </label>
                      <button className="primary-button h-10">Aenderungen speichern</button>
                    </form>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-300">
                Noch keine Mitarbeiter fuer {selectedShop.name} angelegt.
              </p>
            )}
          </div>
        </section>
      </section>

      <section className="cockpit-card p-5">
        <h2 className="text-xl font-semibold text-white">Krankentage</h2>
        <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Mitarbeiter</th>
                <th className="px-4 py-3">Zeitraum</th>
                <th className="px-4 py-3">Tage</th>
                <th className="px-4 py-3">Notiz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sickDays.length ? (
                sickDays.map((sickDay) => (
                  <tr className="bg-ink-900/60 transition hover:bg-white/[0.04]" key={sickDay.id}>
                    <td className="px-4 py-4 font-medium text-white">
                      {employeeMap.get(sickDay.employee_id)?.name ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      {sickDay.start_date} bis {sickDay.end_date}
                    </td>
                    <td className="px-4 py-4 text-slate-300">{sickDay.day_count}</td>
                    <td className="px-4 py-4 text-slate-500">{sickDay.note ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-slate-400" colSpan={4}>
                    Keine Krankentage dokumentiert.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function EmployeeForm({
  shopId,
  year,
  quarter
}: {
  shopId: string;
  year: number;
  quarter: number;
}) {
  return (
    <form action={saveEmployeeAction} className="mt-6 grid gap-4">
      <input name="shop_id" type="hidden" value={shopId} />
      <input name="year" type="hidden" value={year} />
      <input name="quarter" type="hidden" value={quarter} />
      <Field label="Name" name="name" />
      <Field label="Rolle / Funktion" name="function_title" />
      <Field label="Eintrittsdatum" name="start_date" type="date" />
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input defaultChecked name="is_active" type="checkbox" />
        aktiv
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Interne Notizen / Entwicklung / Feedback</span>
        <textarea className={`${inputClass} min-h-28 py-2`} name="note" />
      </label>
      <button className="primary-button h-11">Mitarbeiter speichern</button>
    </form>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="cockpit-card cockpit-card-hover p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  type = "text"
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <input className={inputClass} defaultValue={value} name={name} type={type} />
    </label>
  );
}

function Select({
  label,
  name,
  value,
  children
}: {
  label: string;
  name: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <select className={inputClass} defaultValue={value} name={name}>
        {children}
      </select>
    </label>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="cockpit-card p-7">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
    </section>
  );
}

const inputClass = "control-field";
