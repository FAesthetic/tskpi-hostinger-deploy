import { redirect } from "next/navigation";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
};

export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = new URLSearchParams();

  if (searchParams.shop) {
    query.set("shop", searchParams.shop);
  }

  if (searchParams.year) {
    query.set("year", searchParams.year);
  }

  if (searchParams.quarter) {
    query.set("quarter", searchParams.quarter);
  }

  redirect(`/entries${query.toString() ? `?${query.toString()}` : ""}`);
}
