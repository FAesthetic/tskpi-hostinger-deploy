# TS KPI Datenbankmodell

Dieses Modell ist auf Mandantenfaehigkeit pro Shop ausgelegt. Jede fachliche
Tabelle, die Shopdaten enthaelt, besitzt eine `shop_id`. Supabase Row Level
Security verhindert, dass Nutzer fremde Shops ueber API-Abfragen lesen koennen.

## Identitaet und Zugriff

- `profiles`: Supabase-Userprofil mit globaler Rolle `admin` oder `user`.
- `shops`: Stammdaten fuer Husum, Rendsburg und weitere Shops.
- `shop_memberships`: Shop-Zuordnung mit Rolle `shop_lead` oder `viewer`.
- `shop_invites`: Einladungsbasis fuer spaetere Nutzerverwaltung.

Globale Admins sehen alle Shops. Shopleiter und Viewer sehen nur Shops, fuer die
eine aktive Mitgliedschaft existiert.

## KPI-Struktur

- `kpi_definitions`: Datenbankgepflegte KPI-Arten wie Breitband, TV, Mobilfunk,
  SpeedUp, Qualitaetsthemen und tNPS.
- `quarterly_targets`: Ziele pro Shop, KPI, Jahr und Quartal.
- `daily_kpi_entries`: Tageswerte pro Shop, KPI und Datum.
- `tnps_entries`: woechentliche tNPS-Werte pro Shop.

Die initialen KPI-Definitionen werden per Migration eingefuegt. Das Frontend muss
die Zielarten dadurch nicht hart kodieren.

## Portierungen

- `tariffs`: Tarife mit Typ und Provision, optional global oder shopbezogen.
- `portings`: Portierungsliste mit Status, Datum, KKM und Provision.
- `porting_kpi_impacts`: technische Wirkungstabelle gegen Doppelzaehlung.

Die eindeutige Kombination aus `porting_id` und `kpi_definition_id` verhindert,
dass dieselbe Portierung mehrfach auf denselben KPI gerechnet wird.

Phase 3 schreibt fuer faellige Portierungen zusaetzlich Tageswerte in
`daily_kpi_entries`:

- Mobilfunk PK: `units_mobile_pk` + 1 und `provision_mobile` + Provision
- Mobilfunk GK: `units_mobile_gk` + 1 und `provision_mobile` + Provision

Diese Tageswerte erhalten `source = 'porting'` und `source_ref_id = porting.id`.
Damit bleibt die Wirkung nachvollziehbar und kann nicht mit manuellen Tageswerten
verwechselt werden.

## Team und Kalender

- `employees`: Mitarbeitende pro Shop.
- `sick_days`: dokumentierte Krankentage.
- `special_opening_days`: manuelle Sonderoeffnungen.
- `special_closing_days`: manuelle Sonderschliessungen.
- `audit_logs`: Audit-Spur fuer wichtige Aenderungen.

Feiertage Schleswig-Holstein sind als Berechnungslogik ergaenzt und werden mit
den Sondertagen kombiniert.

Krankentage werden ueber `sick_days.day_count` automatisch aus Start- und
Enddatum berechnet. Sie sind aktuell Dokumentation und beeinflussen noch keine
KPI-Runrates.

## Phase-2-Berechnungen

Die App berechnet aktuell:

- Quartalsgrenzen
- gesamte, vergangene und verbleibende Arbeitstage
- Feiertage Schleswig-Holstein
- manuelle Sonderoeffnungen und Sonderschliessungen
- Zielerreichung
- aktueller Tagesdurchschnitt
- Runrate-Prognose
- benoetigter Tagesdurchschnitt bis Quartalsende
- Ampelstatus

Die Berechnungen liegen in `src/lib/kpi` und sind bewusst getrennt von der UI.

## tNPS

tNPS liegt in `tnps_entries` pro Shop, Jahr und Kalenderwoche. Der Zielwert kann
ueber `quarterly_targets` fuer die KPI-Definition `tnps` gepflegt werden.

## RLS-Helfer

- `is_admin()`
- `current_shop_role(shop_id)`
- `has_shop_role(shop_id, roles)`
- `can_view_shop(shop_id)`
- `can_manage_shop(shop_id)`

Diese Funktionen kapseln die Rechtepruefung fuer Policies und App-Code.
