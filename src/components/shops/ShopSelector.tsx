export type ShopOption = {
  id: string;
  name: string;
};

export function ShopSelector({
  shops,
  value,
  name = "shop_id"
}: {
  shops: ShopOption[];
  value?: string;
  name?: string;
}) {
  return (
    <select
      className="h-10 rounded-md border border-white/10 bg-ink-800 px-3 text-sm text-white outline-none focus:border-pulse-500 focus:ring-2 focus:ring-pulse-500/20"
      defaultValue={value}
      name={name}
    >
      {shops.map((shop) => (
        <option key={shop.id} value={shop.id}>
          {shop.name}
        </option>
      ))}
    </select>
  );
}
