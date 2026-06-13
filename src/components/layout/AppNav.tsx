import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/entries", label: "Tageswerte" },
  { href: "/portings", label: "Portierungen" },
  { href: "/tnps", label: "tNPS" },
  { href: "/employees", label: "Mitarbeiter" },
  { href: "/compare", label: "Vergleich" },
  { href: "/settings/targets", label: "Ziele" },
  { href: "/settings/tariffs", label: "Tarife" }
];

export function AppNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
