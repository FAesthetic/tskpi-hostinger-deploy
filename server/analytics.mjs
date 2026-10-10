const DAY = 86400000;
const EVENTS = new Set(['page_view','booking_click','calendar_view','date_selected','details_view','form_started','review_view','validation_error','submit_attempt','receipt_shown','request_error','calendar_error','whatsapp_click','phone_click','email_click','package_changed']);
const PAGES = new Set(['/','/fotobox-hochzeit/','/termin/']);
const FIELDS = new Set(['names','email','location','date','delivery','extensionDays','other']);
const tag = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : '';

export function analyticsContext(value) {
  if (!value || value.mode !== 'aggregate') return null;
  return { flow: '', source: tag(value.source) || 'unbekannt', medium: tag(value.medium), campaign: tag(value.campaign), content: tag(value.content), device: '', test: value.test === true ? 1 : 0 };
}

export function createAnalytics(db, { now = () => Date.now() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS analytics_events(id TEXT PRIMARY KEY, created INTEGER NOT NULL, flow TEXT NOT NULL, event TEXT NOT NULL, page TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, content TEXT NOT NULL, device TEXT NOT NULL, detail TEXT NOT NULL, test INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS analytics_counts(day INTEGER NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL,source TEXT NOT NULL,medium TEXT NOT NULL,campaign TEXT NOT NULL,content TEXT NOT NULL,detail TEXT NOT NULL,test INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,event,page,source,medium,campaign,content,detail,test));
    CREATE INDEX IF NOT EXISTS analytics_events_window ON analytics_events(created, test);
    CREATE TABLE IF NOT EXISTS analytics_requests(booking_id TEXT PRIMARY KEY REFERENCES bookings(id), created INTEGER NOT NULL, flow TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, content TEXT NOT NULL, device TEXT NOT NULL, test INTEGER NOT NULL);`);
  let lastPruned = 0;
  function prune() {
    if (now() - lastPruned < DAY) return;
    db.prepare('DELETE FROM analytics_events WHERE created<?').run(now() - 90 * DAY);
    db.prepare('DELETE FROM analytics_requests WHERE created<?').run(now() - 90 * DAY);
    db.prepare('DELETE FROM analytics_counts WHERE day<?').run(Math.floor(now()/DAY)*DAY - 90 * DAY);
    lastPruned = now();
  }
  const write = (context, event, page, detail = '') => {
    prune();
    db.prepare('INSERT INTO analytics_counts VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(day,event,page,source,medium,campaign,content,detail,test) DO UPDATE SET count=count+1').run(Math.floor(now()/DAY)*DAY,event,page,context.source,context.medium,context.campaign,context.content,detail,context.test);
  };
  function record(body) {
    const c = analyticsContext(body);
    if (!c || !EVENTS.has(body.event) || !PAGES.has(body.page)) return false;
    const detail = body.event === 'validation_error' ? (FIELDS.has(body.detail) ? body.detail : 'other') : body.event === 'package_changed' ? (['pickup','delivery'].includes(body.detail) ? body.detail : '') : '';
    write(c, body.event, body.page, detail);
    return true;
  }
  // Analytics never prevents a customer request from being saved or answered.
  function saved(booking, context) {
    const c = analyticsContext(context); if (!c) return;
    try {
      prune();
      const inserted = db.prepare('INSERT OR IGNORE INTO analytics_requests VALUES(?,?,?,?,?,?,?,?,?)').run(booking.id, booking.created, c.flow, c.source, c.medium, c.campaign, c.content, c.device, c.test);
      if (inserted.changes) write(c, 'request_saved', '/termin/');
    } catch { /* Booking is authoritative even if measurement fails. */ }
  }
  function failed(context, status) {
    const c = analyticsContext(context); if (!c) return;
    try { write(c, 'server_error', '/termin/', [400,409,429,500,503].includes(status) ? String(status) : 'other'); } catch { /* Measurement must not replace the original error. */ }
  }
  function summary(days = 7) {
    prune();
    const start = Math.floor(now()/DAY)*DAY - (days-1)*DAY;
    const events = db.prepare(`SELECT event,SUM(count) AS events FROM analytics_counts WHERE day>=? AND test=0 GROUP BY event`).all(start);
    const campaigns = db.prepare(`SELECT source,medium,campaign,content,event,SUM(count) AS events FROM analytics_counts WHERE day>=? AND test=0 GROUP BY source,medium,campaign,content,event`).all(start);
    const requests = db.prepare(`SELECT a.source,a.medium,a.campaign,a.content,COUNT(*) AS requests, SUM(b.status='confirmed') AS confirmed, SUM(EXISTS(SELECT 1 FROM email_offers e WHERE e.booking_id=b.id)) AS offers, SUM(EXISTS(SELECT 1 FROM outbox o WHERE o.id='request-received-'||b.id AND o.sent IS NOT NULL)) AS receiptMailsSent, SUM(EXISTS(SELECT 1 FROM outbox o WHERE o.id='request-received-'||b.id AND o.sent IS NULL)) AS receiptMailsPending FROM analytics_requests a JOIN bookings b ON b.id=a.booking_id WHERE a.created>=? AND a.test=0 GROUP BY a.source,a.medium,a.campaign,a.content`).all(start);
    const errors = db.prepare(`SELECT event,detail,SUM(count) AS events FROM analytics_counts WHERE day>=? AND test=0 AND event IN ('validation_error','calendar_error','request_error','server_error') GROUP BY event,detail`).all(start);
    const since = db.prepare('SELECT MIN(day) AS since FROM analytics_counts WHERE test=0').get().since;
    return { mode:'aggregate', days, start, end: now(), since, events, campaigns, requests, errors };
  }
  return { record, saved, failed, summary };
}
