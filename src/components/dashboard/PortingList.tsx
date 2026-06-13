import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type PortingListItem = {
  id: string;
  type: string;
  date: string | null;
  tariff: string;
  status: string;
  kkm?: string | null;
};

export function PortingList({ items }: { items: PortingListItem[] }) {
  return (
    <DataTable columns={["Typ", "Datum", "Tarif", "Status", "KKM"]}>
      {items.map((item) => (
        <tr className="bg-ink-900/60" key={item.id}>
          <td className="px-4 py-4 text-white">{item.type}</td>
          <td className="px-4 py-4 text-slate-300">{item.date ?? "Ohne Datum"}</td>
          <td className="px-4 py-4 text-slate-300">{item.tariff}</td>
          <td className="px-4 py-4">
            <StatusBadge>{item.status}</StatusBadge>
          </td>
          <td className="px-4 py-4 text-slate-300">{item.kkm ?? "-"}</td>
        </tr>
      ))}
    </DataTable>
  );
}
