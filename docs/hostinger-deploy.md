# TS KPI auf Hostinger deployen, ohne n8n zu beruehren

Diese Variante ist fuer einen Hostinger VPS gedacht. Sie startet TS KPI als eigene Docker-Compose-App:

- eigener Compose-Projektname: `ts-kpi`
- eigener Container: `ts-kpi-app`
- eigener lokaler Port: `127.0.0.1:3010`
- keine Aenderung an bestehenden n8n-Containern, n8n-Volumes oder n8n-Compose-Dateien

## 1. Wichtige Regel

Fuehre diese Befehle **nicht** im n8n-Ordner aus und nutze dort kein `docker compose down`.

TS KPI wird in einen eigenen Ordner gelegt, zum Beispiel:

```bash
/opt/ts-kpi
```

## 2. Repository auf dem VPS holen

```bash
sudo mkdir -p /opt/ts-kpi
sudo chown -R $USER:$USER /opt/ts-kpi
cd /opt/ts-kpi
git clone https://github.com/FAesthetic/tskpi.git .
```

Wenn der Ordner schon existiert:

```bash
cd /opt/ts-kpi
git pull origin main
```

## 3. Env-Datei anlegen

```bash
cd /opt/ts-kpi
cp .env.hostinger.example .env.hostinger
nano .env.hostinger
```

Mindestens setzen:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=https://kpi.deine-domain.de
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Die n8n-Webhook-Variablen bleiben leer, bis deine n8n-Workflows fertig sind. Dann sendet TS KPI nichts an n8n und kann deine n8n-Instanz nicht fluten.

## 4. TS KPI starten

```bash
cd /opt/ts-kpi
docker compose -f deploy/hostinger/docker-compose.yml up -d --build
```

Status pruefen:

```bash
docker compose -f deploy/hostinger/docker-compose.yml ps
docker logs -f ts-kpi-app
curl -I http://127.0.0.1:3010/login
```

## 5. Domain verbinden

### Wenn du Nginx direkt nutzt

Lege einen separaten Server Block an:

```bash
sudo cp deploy/hostinger/nginx-ts-kpi.example.conf /etc/nginx/sites-available/ts-kpi.conf
sudo nano /etc/nginx/sites-available/ts-kpi.conf
sudo ln -s /etc/nginx/sites-available/ts-kpi.conf /etc/nginx/sites-enabled/ts-kpi.conf
sudo nginx -t
sudo systemctl reload nginx
```

SSL danach zum Beispiel mit Certbot fuer deine Subdomain aktivieren.

### Wenn du Nginx Proxy Manager nutzt

Einen neuen Proxy Host anlegen:

- Domain: `kpi.deine-domain.de`
- Forward Hostname/IP: `127.0.0.1`
- Forward Port: `3010`
- Websockets: aktiv
- SSL: Let's Encrypt aktivieren

Nicht den bestehenden n8n Proxy Host bearbeiten.

## 6. Supabase Redirects anpassen

In Supabase:

- Authentication -> URL Configuration
- Site URL: `https://kpi.deine-domain.de`
- Redirect URLs:
  - `https://kpi.deine-domain.de/auth/callback`
  - optional lokal: `http://localhost:3000/auth/callback`

## 7. Daily Briefing / n8n

Auf Hostinger gibt es keinen Vercel-Cron. Nutze entweder einen VPS-Cron oder n8n.

VPS-Cron Beispiel fuer 08:00 Uhr:

```bash
0 8 * * * curl -fsS -H "Authorization: Bearer DEIN_CRON_SECRET" https://kpi.deine-domain.de/api/briefing/daily >/dev/null
```

15-Minuten-Digest Beispiel:

```bash
*/15 * * * * curl -fsS -H "Authorization: Bearer DEIN_CRON_SECRET" "https://kpi.deine-domain.de/api/notifications/digest?send=1" >/dev/null
```

Wenn n8n das uebernimmt, lass diese Cronjobs weg und baue dort zwei Schedule Trigger.

## 8. Updates deployen

```bash
cd /opt/ts-kpi
git pull origin main
docker compose -f deploy/hostinger/docker-compose.yml up -d --build
docker logs -f ts-kpi-app
```

## 9. Rollback

Falls ein Update schlecht ist:

```bash
cd /opt/ts-kpi
git log --oneline -5
git checkout COMMIT_ID
docker compose -f deploy/hostinger/docker-compose.yml up -d --build
```

n8n bleibt davon getrennt.
