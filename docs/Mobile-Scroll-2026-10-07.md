# Mobiles Scrollen

Bestehende Live-Animation und CSS mit dem ausgelieferten Artefakt verglichen. Die aktuelle Website enthält zusätzliche Branding-Anpassungen gegenüber dem Booking-Quellcommit; deshalb beim Deployment die vorhandene HTML-Datei beibehalten und ausschließlich die Asset-Versionen ändern.

Bis 760 px und bei reduzierter Bewegung: natürlicher Seitenfluss, keine Sticky-Zoom-Sequenz, keine Scroll-Handler, alle Texte und Links zugänglich. Desktop: bestehende Choreografie, DOM-Referenzen einmal ermittelt, unveränderte Endpositionen schreiben keine Styles erneut.

Validierung: 138 bestehende und neue Tests bestanden, darunter drei Tests für mobile/reduzierte Bewegung, Frame-Bündelung und Wechsel der Bildschirmbreite. Kein gemessener FPS-Vergleich: Browserprüfung aktuell nicht verfügbar. Visueller Test auf echtem iPhone/Android bleibt erforderlich.

Deployment: `scripts/package-mobile-scroll.py` ergänzt ausschließlich den Startbefehl des bestehenden Nginx-Dienstes. Originalartefakt und neue CSS/JS werden per SHA-256 geprüft. Buchungsdienst, Datenbank, Zugang und Preise bleiben unverändert. Rücknahme über den zuvor gesicherten Compose-Stand. Live-Veröffentlichung noch nicht bestätigt; erster Hostinger-Aufruf durch vorgeschaltete Zugriffskontrolle abgewiesen.
