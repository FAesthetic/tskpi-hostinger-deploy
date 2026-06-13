# TS KPI

Interne KPI-Web-App fuer Telekom-Shop Steuerung. Phase 5 erweitert das KPI-Cockpit
um tNPS, Mitarbeiter, Krankentage und Vergleichsansichten.

## Phase 1 enthalt

- Login, Registrierung, Magic Link Callback und Logout
- geschuetztes Dashboard
- Shop-Erstellung
- globale Admin-Rolle
- shopbezogene Rollen: `shop_lead`, `viewer`
- Supabase Migration mit RLS-Policies
- Datenbanktabellen fuer spaetere KPI-, Portierungs-, tNPS- und Mitarbeiterlogik
- Tailwind UI-Grundlage und wiederverwendbare Cockpit-Komponenten

## Phase 2 enthaelt

- zentrale Utility-Funktionen fuer Quartale und Arbeitstage
- automatische Feiertage fuer Schleswig-Holstein
- Sonderoeffnungs- und Sonderschliesstage in der Runrate-Basis
- Zielerreichung, Tagesdurchschnitt, Runrate-Prognose und Rest-Tagesbedarf
- Ampelstatus fuer KPI-Karten
- Seite `/settings/targets` fuer Quartalsziele
- Seite `/entries` fuer Tageswerte
- Dashboard-Basis mit Shop-/Quartalsauswahl, KPI-Karten und Handlungshinweis

## Phase 3 enthaelt

- Seite `/settings/tariffs` fuer Tarife und Provisionen
- Seite `/portings` fuer Portierungserfassung und Filter
- Portierungen mit Datum, ohne Datum, KKM, Tarif, Provision und Status
- automatische Wirkung faelliger Portierungen auf:
  - `units_mobile_pk` oder `units_mobile_gk`
  - `provision_mobile`
- technische Wirkungstabelle `porting_kpi_impacts`
- Tageswert-Eintraege mit `source = 'porting'` und `source_ref_id = porting.id`
- Doppelzaehlungsschutz ueber eindeutige Wirkung pro Portierung und KPI
- Dashboard-Portierungsstatus und Hinweis auf Portierungen ohne Datum

## Phase 4 enthaelt

- Qualitaetsthemen in der Tageswerte-Erfassung
- Seite `/tnps` fuer woechentliche tNPS-Werte
- tNPS-Verlauf, Zielvergleich und Trend zur Vorwoche
- Seite `/employees` fuer Mitarbeitende
- Krankentage mit automatisch berechneter Tagesanzahl
- Mitarbeiterbereich nur fuer Admin/Shopleiter

## Phase 5 enthaelt

- erweiterte Management-Hinweise im Dashboard und Report
- Seite `/reports` mit Quartalsbericht je Shop
- Seite `/compare` mit erster Vergleichsansicht sichtbarer Shops
- Navigation fuer Cockpit, Eingabe, Portierungen, tNPS, Mitarbeiter,
  Vergleich und Einstellungen

## Noch nicht Teil des MVP

- CSV-Export
- PDF-Report
- Wochenbericht
- KI-Analyse
- automatische Einrechnung von Krankentagen in Runrates

## Lokaler Start

1. Abhaengigkeiten installieren:

```bash
npm install
```

2. `.env.example` nach `.env.local` kopieren und Supabase-Werte eintragen:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

3. Supabase Migration anwenden:

```bash
supabase db reset
```

4. App starten:

```bash
npm run dev
```

## Admin setzen

Der erste globale Admin kann nach Registrierung direkt in Supabase gesetzt
werden:

```sql
update public.profiles
set global_role = 'admin'
where id = '<user-id>';
```

Alternativ kann ein Nutzer ohne globale Adminrolle Shops erstellen und wird fuer
diesen Shop automatisch `shop_lead`.
