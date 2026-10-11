# Fotobox: Abendmiete und Startseite, 11. Oktober 2026

## Beauftragter Ablauf
Die allgemeine Landingpage unter `/` ist die Startseite. Die Hochzeitsseite bleibt eine ergänzende Unterseite. Miete pro Veranstaltungsabend, keine starre 24-Stunden-Frist. Lieferung, Abholung und Rückgabe persönlich vereinbaren; eine vereinbarte frühere Anlieferung, auch zwei Tage früher, ohne Aufpreis. Finn lädt die Fotos selbst in Google Drive hoch und verteilt den freigegebenen Link selbst. Keine Galerie, Linkverwaltung oder Drive-Integration bauen.

## Lokal umgesetzt
Startseite, eigenständige Anfrage, Hochzeits-Unterseite, Anfragezusammenfassung, Angebots-/Bestätigungstexte, Buchungsübersicht und Paket-PDF angepasst. Verlängerungswahl aus öffentlicher Anfrage und normalen neuen Angeboten entfernt. Neue Standardanfragen/-angebote speichern Version 2026-10-11-v5. Bestehende Datensätze, Angebote und Mail-/PDF-Snapshots werden nicht umgeschrieben. Frühere v4-Bedingungen als terms-v4.txt und /buchungsbedingungen/v4/ archiviert; frühere ausdrücklich angefragte Verlängerungen bleiben technisch lesbar und behalten v4. Keine automatischen Zusatzkosten anhand verstrichener Zeit. Preise 199/249 Euro und Fahrtkosten unverändert. Auch den falschen 12-km-Beispielpreis der Hochzeitsseite von 262 auf 261 Euro korrigiert.

Die bestehende Belegungslogik mit Rückgabepuffer bleibt unverändert. Frühe Übergabe und tatsächliche Transportzeiten müssen weiterhin persönlich geprüft und nötigenfalls über bestehende Kalendersperren abgesichert werden; es wurden keine Termine erfunden oder bestehende Belegungen geändert.

## Prüfung
143/143 lokale Tests bestanden (einschließlich neuer Abendmiete-/Altbestand-Tests). Syntaxprüfungen bestanden. Startseite lokal im Browser mit neuem Preis-/Übergabetext gelesen; statische Vorschau hat absichtlich kein Produktiv-API-Backend. Paket-PDF gerendert und visuell geprüft. CSP-Hashes der Inline-Daten angepasst. Keine Buchung, Nachricht, Zahlung oder echte Anfrage durch Tests ausgelöst.

## Veröffentlichung offen
Hostinger vps_docker_list für VPS 1192698 lieferte HTTP 500 [VPS:9999], correlation a2f4c181-775d-4e7f-9630-84da7ccdda84. Keine Deploy-Schreibaktion versucht, kein unbekannter Compose-Stand ersetzt. Diese Änderungen sind lokal, nicht als online veröffentlicht bestätigt. Nach Wiederherstellung des regulären Zugriffs aktuellen Compose-/Artefakt-/Datenstand und aktive externe Vorgänge lesen, Sicherung prüfen, dann kontrolliert veröffentlichen und zurücklesen.
