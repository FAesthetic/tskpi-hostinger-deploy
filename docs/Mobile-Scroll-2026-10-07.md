# Mobiles Scrollen

Bestehende Live-Animation und CSS mit dem ausgelieferten Artefakt verglichen. Die aktuelle Website enthält zusätzliche Branding-Anpassungen gegenüber dem Booking-Quellcommit; deshalb beim Deployment die vorhandene HTML-Datei beibehalten und ausschließlich die Asset-Versionen ändern.

Bis 760 px und bei reduzierter Bewegung: natürlicher Seitenfluss, keine Sticky-Zoom-Sequenz, keine Scroll-Handler, alle Texte und Links zugänglich. Desktop: bestehende Choreografie, DOM-Referenzen einmal ermittelt, unveränderte Endpositionen schreiben keine Styles erneut.

Validierung: 138 bestehende und neue Tests bestanden, darunter drei Tests für mobile/reduzierte Bewegung, Frame-Bündelung und Wechsel der Bildschirmbreite. Kein gemessener FPS-Vergleich: Browserprüfung aktuell nicht verfügbar. Visueller Test auf echtem iPhone/Android bleibt erforderlich.

Deployment: `scripts/package-mobile-scroll.py` ergänzt ausschließlich den Startbefehl des bestehenden Nginx-Dienstes. Originalartefakt und neue CSS/JS werden per SHA-256 geprüft. Buchungsdienst, Datenbank, Zugang und Preise bleiben unverändert. Rücknahme über den zuvor gesicherten Compose-Stand. Live-Veröffentlichung noch nicht bestätigt; erster Hostinger-Aufruf durch vorgeschaltete Zugriffskontrolle abgewiesen.

## Anfragebetrag (Nutzerkorrektur)

Neues internes optionales Feld `bookings.request_amount_cents` in derselben Datenbank, nur für offene Anfragen bearbeitbar. Authentifizierter POST mit vorhandener Origin-/CSRF-Prüfung und erwartetem Altwert gegen verlorene Änderungen. Kein Versand, keine Zahlung, keine Änderung an Angeboten, Reservierungen oder verbindlichen Gesamtpreisen. Feld leer: Dashboard verwendet gespeicherten Paketpreis plus angefragter Verlängerung; ungeprüfte Fahrtkosten bleiben ausdrücklich offen. Individuelle Anfragen ohne belastbaren Paketpreis bleiben ohne Betrag, bis dieser hinterlegt wird.

Vor Ergänzung der Spalte: konsistentes geprüftes Backup einer bestehenden Datenbank samt vorhandenem Schlüssel, wiederholte Starts legen kein weiteres Migrationsbackup an. Tests decken Neustart, Werte-/Status-/Versionsgrenzen, Migrationserhalt und API-Sitzung/Origin/CSRF ab. Insgesamt 141 Tests bestanden.

Standardmäßige Git-Zugangsdaten sind für das vorhandene Repository verfügbar (Dry-Run erfolgreich), während der GitHub-App-Connector keine Schreibberechtigung besitzt. Für die Veröffentlichung wird daher ein normales versioniertes statisches Release über Git vorbereitet. `scripts/package-site.py` erhält das SHA256-geprüfte reale Live-Artefakt einschließlich Branding und aller übrigen Assets; nur immersive.js/CSS, admin.js und zugehörige Asset-Versionen ändern sich. Keine eingebetteten Code-Patches im Produktions-Compose nötig. Noch keine Veröffentlichung dieses neuen Release bestätigt.
