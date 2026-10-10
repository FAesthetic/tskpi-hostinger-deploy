import { randomUUID } from 'node:crypto';

const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENTS = new Set(['page_view','booking_click','calendar_view','date_selected','details_view','form_started','review_view','validation_error','submit_attempt','receipt_shown','request_error','calendar_error','whatsapp_click','phone_click','email_click','package_changed']);
const PAGES = new Set(['/','/fotobox-hochzeit/','/termin/']);
const FIELDS = new Set(['names','email','location','date','delivery','extensionDays','other']);
const tag = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : '';

export function analyticsContext(value) {
  if (!value || value.consent !== true || !UUID.test(value.flow || '')) return null;
  return { flow: value.flow, source: tag(value.source) || 'unbekannt', medium: tag(value.medium), campaign: tag(value.campaign), content: tag(value.content), device: ['mobil','tablet','desktop'].includes(value.device) ? value.device : 'unbekannt', test: value.test === true ? 1 : 0 };
}

export function createAnalytics(db, { now = () => Date.now() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS analytics_events(id TEXT PRIMARY KEY, created INTEGER NOT NULL, flow TEXT NOT NULL, event TEXT NOT NULL, page TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, content TEXT NOT NULL, device TEXT NOT NULL, detail TEXT NOT NULL, test INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS analytics_events_window ON analytics_events(created, test);
    CREATE TABLE IF NOT EXISTS analytics_requests(booking_id TEXT PRIMARY KEY REFERENCES bookings(id), created INTEGER NOT NULL, flow TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, content TEXT NOT NULL, device TEXT NOT NULL, test INTEGER NOT NULL);`);
  let lastPruned = 0;
  function prune() {
    if (now() - lastPruned < DAY) return;
    db.prepare('DELETE FROM analytics_events WHERE created<?').run(now() - 90 * DAY);
    db.prepare('DELETE FROM analytics_requests WHERE created<?').run(now() - 90 * DAY);
    lastPruned = now();
  }
  const write = (id, context, event, page, detail = '') => {
    prune();
    db.prepare('INSERT OR IGNORE INTO analytics_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, now(), context.flow, event, page, context.source, context.medium, context.campaign, context.content, context.device, detail, context.test);
  };
  function record(body) {
    const c = analyticsContext(body);
    if (!c || !UUID.test(body.id || '') || !EVENTS.has(body.event) || !PAGES.has(body.page)) return false;
    const detail = body.event === 'validation_error' ? (FIELDS.has(body.detail) ? body.detail : 'other') : body.event === 'package_changed' ? (['pickup','delivery'].includes(body.detail) ? body.detail : '') : '';
    write(body.id, c, body.event, body.page, detail);
    return true;
  }
  // Analytics never prevents a customer request from being saved or answered.
  function saved(booking, context) {
    const c = analyticsContext(context); if (!c) return;
    try {
      prune();
      db.prepare('INSERT OR IGNORE INTO analytics_requests VALUES(?,?,?,?,?,?,?,?,?)').run(booking.id, booking.created, c.flow, c.source, c.medium, c.campaign, c.content, c.device, c.test);
      write('saved-' + booking.id, c, 'request_saved', '/termin/');
    } catch { /* Booking is authoritative even if measurement fails. */ }
  }
  function failed(context, status) {
    const c = analyticsContext(context); if (!c) return;
    try { write(randomUUID(), c, 'server_error', '/termin/', [400,409,429,500,503].includes(status) ? String(status) : 'other'); } catch { /* Measurement must not replace the original error. */ }
  }
  function summary(days = 7) {
    prune();
    const start = now() - days * DAY;
    const events = db.prepare(`SELECT event, COUNT(*) AS events, COUNT(DISTINCT flow) AS sessions FROM analytics_events WHERE created>=? AND test=0 GROUP BY event`).all(start);
    const campaigns = db.prepare(`SELECT source, medium, campaign, content, device, event, COUNT(DISTINCT flow) AS sessions FROM analytics_events WHERE created>=? AND test=0 GROUP BY source, medium, campaign, content, device, event`).all(start);
    const requests = db.prepare(`SELECT a.source,a.medium,a.campaign,a.content,a.device,COUNT(*) AS requests, SUM(b.status='confirmed') AS confirmed, SUM(EXISTS(SELECT 1 FROM email_offers e WHERE e.booking_id=b.id)) AS offers, SUM(EXISTS(SELECT 1 FROM outbox o WHERE o.id='request-received-'||b.id AND o.sent IS NOT NULL)) AS receiptMailsSent, SUM(EXISTS(SELECT 1 FROM outbox o WHERE o.id='request-received-'||b.id AND o.sent IS NULL)) AS receiptMailsPending FROM analytics_requests a JOIN bookings b ON b.id=a.booking_id WHERE a.created>=? AND a.test=0 GROUP BY a.source,a.medium,a.campaign,a.content,a.device`).all(start);
    const errors = db.prepare(`SELECT event,detail,COUNT(*) AS events,COUNT(DISTINCT flow) AS sessions FROM analytics_events WHERE created>=? AND test=0 AND event IN ('validation_error','calendar_error','request_error','server_error') GROUP BY event,detail`).all(start);
    const since = db.prepare('SELECT MIN(created) AS since FROM analytics_events WHERE test=0').get().since;
    return { days, start, end: now(), since, events, campaigns, requests, errors };
  }
  return { record, saved, failed, summary };
}
