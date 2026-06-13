# TS KPI Architektur

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL und Row Level Security
- Vercel Deployment
- GitHub Versionsverwaltung

## MVP-Phasen

### Phase 1

- Projektsetup
- Supabase-Anbindung
- Login, Registrierung, Magic Link und Logout
- Shops
- Rollen
- Shopzugriff und RLS

### Phase 2

- KPI-Definitionen nutzen
- Quartalsziele
- Tageswerte
- Arbeitstage- und Feiertagslogik
- Dashboard-Basis mit Runrate

Status: umgesetzt als erste MVP-Version.

### Phase 3

- Portierungsliste
- Tarife
- automatische Portierungswirkung
- Archivierung und Doppelzaehlungsschutz

Status: umgesetzt als MVP-Version. Die Verarbeitung laeuft aktuell beim Oeffnen
von Dashboard/Portierungsliste fuer berechtigte Nutzer sowie ueber den Button
`Faellige buchen`. Spaeter kann dieselbe Logik in einen geplanten Supabase-Job
verschoben werden.

### Phase 4

- Qualitaetsthemen
- tNPS
- Mitarbeiter-Tab
- Krankentage

Status: umgesetzt als MVP-Version. Krankentage sind dokumentarisch und werden
noch nicht in Runrates eingerechnet.

### Phase 5

- Design-Feinschliff
- Analysehinweise
- Tageswerte- und KPI-Uebersichten
- Vergleichsansichten

Status: umgesetzt als MVP-Version mit Quartalsreport, Management-Hinweisen und
Shop-Vergleich. CSV, PDF und Wochenbericht bleiben Folgeausbau.

## Seitenstruktur

- `/login`: Auth.
- `/dashboard`: Cockpit-Basis mit Runrate, Arbeitstagen und Ampelstatus.
- `/shops`: spaetere Shopverwaltung.
- `/entries`: Tageswerte erfassen.
- `/portings`: Portierungsliste mit Filtern, Erfassung und Faelligkeitsbuchung.
- `/settings/targets`: Quartalsziele pflegen.
- `/settings/tariffs`: Tarife und Provisionen pflegen.
- `/tnps`: tNPS erfassen und Verlauf sehen.
- `/employees`: Mitarbeiter und Krankentage.
- `/reports`: Quartalsreport.
- `/compare`: Vergleich sichtbarer Shops.
- `/admin/users`: spaetere Admin-Nutzerverwaltung.

## Designrichtung

TS KPI verwendet eine dunkle Cockpit-Oberflaeche mit klaren Karten,
Statusfarben, Tabellen mit ruhiger Dichte und wiederverwendbaren Komponenten fuer
KPI-Karten, Status, Fortschritt, Tabellen und Auswahlfelder.
