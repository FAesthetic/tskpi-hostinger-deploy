import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/index.mjs';
import { passwordHash, plusDays, today } from '../server/core.mjs';

// Local HTTP, fresh disposable SQLite databases, fake SMTP only. No external sends.
const PASSWORD = 'MUSTER-local-only-password-42';
const ORIGIN = 'http://localhost';
const smtpConfig = { smtpHost: 'smtp.example.invalid', smtpPort: 465, smtpUser: 'sender@example.invalid', smtpPassword: 'MUSTER-fake-only' };

async function fixture(t, { initialBaseCents = 24900 } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fotobox-mail-flow-'));
  const messages = [], sendAttempts = [];
  let app, server, base, cookie = '', csrf = '', verifies = 0, failuresRemaining = 0;
  const transportFactory = () => ({
    verify: async () => { verifies += 1; return true; },
    sendMail: async mail => {
      sendAttempts.push(mail);
      if (failuresRemaining > 0) { failuresRemaining -= 1; throw Error('MUSTER simulated SMTP failure'); }
      messages.push(mail); return { messageId: mail.messageId || 'test-mail' };
    },
  });
  const boot = async (baseCents = initialBaseCents) => {
    app = createApp({ directory, origin: ORIGIN, baseCents, bootstrapHash: passwordHash(PASSWORD), transportFactory, stripeFactory: () => { throw Error('Unexpected Stripe call in a mail-only test'); }, startWorkers: false });
    server = http.createServer(app.handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    app.close(); server = null;
  };
  await boot();
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, bytes, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes.toString()) : null };
  };
  const login = async () => {
    const response = await call('admin/login', { password: PASSWORD });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0]; csrf = response.body.csrf;
  };
  const submit = async (overrides = {}) => {
    const body = { requestId: randomUUID(), name: 'MUSTER Paar', email: 'customer@example.invalid', phone: '+49 000 0000000', date: plusDays(today(), 40), location: 'MUSTER-Saal, Beispielstraße 1, 24768 Musterort', delivery: 'delivery', customerType: 'private', message: 'Nur lokale Testdaten, keine Buchung.', ...overrides };
    const response = await call('request', body);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const booking = app.store.db.prepare('SELECT * FROM bookings WHERE reference=?').get(response.body.reference);
    return { body, response, booking };
  };
  const waitFor = async condition => {
    const deadline = Date.now() + 5000;
    while (!condition()) { if (Date.now() > deadline) assert.fail('Local fake mail flow did not settle'); await delay(10); }
  };
  const drain = async () => {
    await app.flushMail();
    await waitFor(() => app.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE sent IS NULL').get().n === 0);
  };
  const enableMail = async () => {
    assert.equal((await call('admin/settings', smtpConfig)).status, 200);
    assert.equal((await call('admin/test-mail', {})).status, 200);
    assert.equal((await call('admin/mail-confirm', { received: true })).status, 200);
    await drain();
  };
  return { call, login, submit, drain, enableMail, waitFor, messages, sendAttempts, failNextSend() { failuresRemaining += 1; }, get app() { return app; }, get store() { return app.store; }, get verifies() { return verifies; }, async restart(baseCents) { await stop(); await boot(baseCents); } };
}

function assertPdf(response) {
  assert.equal(response.body.ok, true);
  const buffer = Buffer.from(response.body.pdfBase64, 'base64');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.length > 15000);
  assert.match(response.body.filename, /\.pdf$/);
}
function requestJobs(f, id) {
  return f.store.db.prepare('SELECT * FROM outbox WHERE id IN (?,?) ORDER BY id').all('request-owner-' + id, 'request-received-' + id);
}
function unrelatedFlags(f) {
  return Object.fromEntries(['stripe_key', 'stripe_live_ready', 'webhook_secret', 'webhook_verified', 'calendar_reviewed', 'terms_reviewed', 'klarna_approved', 'live'].map(key => [key, f.store.get(key)]));
}

test('inquiry returns a PDF and two durable mail jobs before SMTP; replay and restart do not duplicate', async t => {
  const f = await fixture(t);
  const first = await f.submit();
  assertPdf(first.response);
  assert.equal(first.response.body.emailQueued, false);
  assert.match(first.response.body.receiptText, /unverbindlich/);
  const jobs = requestJobs(f, first.booking.id);
  assert.equal(jobs.length, 2);
  assert.deepEqual(new Set(jobs.map(j => j.to_address)), new Set(['customer@example.invalid', 'uhighcauseidope@gmail.com']));
  for (const job of jobs) {
    assert.equal(job.sent, null);
    const payload = JSON.parse(job.pdf_payload);
    assert.equal(payload.kind, 'inquiry');
    assert.equal(payload.booking.reference, first.booking.reference);
  }
  await f.app.flushMail();
  assert.equal(f.messages.length, 0);
  const repeated = await f.call('request', first.body);
  assert.equal(repeated.status, 200);
  assertPdf(repeated);
  assert.equal(repeated.body.reference, first.booking.reference);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM bookings').get().n, 1);
  assert.equal(requestJobs(f, first.booking.id).length, 2);
  assert.equal((await f.call('request', { ...first.body, location: 'A different location that cannot silently replace an existing request' })).status, 409);
  await f.restart();
  assert.equal(requestJobs(f, first.booking.id).length, 2);
  assert.ok(requestJobs(f, first.booking.id).every(j => j.sent === null));
  assert.equal(f.store.booking(first.booking.id).status, 'requested');
  assert.equal(f.store.booking(first.booking.id).unit, null);
});

test('outbox waits for a received test mail; mail-confirm preserves payment and calendar flags', async t => {
  const f = await fixture(t);
  const { booking } = await f.submit();
  await f.login();
  f.store.set('calendar_reviewed', true);
  f.store.set('terms_reviewed', true);
  f.store.set('stripe_live_ready', false);
  f.store.set('webhook_verified', true);
  f.store.set('klarna_approved', false);
  f.store.set('live', false);
  assert.equal((await f.call('admin/settings', smtpConfig)).status, 200);
  assert.equal(f.verifies, 1);
  const before = unrelatedFlags(f);
  assert.equal((await f.call('admin/mail-confirm', { received: true })).status, 400);
  await f.app.flushMail();
  assert.equal(f.messages.length, 0);
  assert.equal((await f.call('admin/test-mail', {})).status, 200);
  assert.equal(f.store.get('mail_test_sent'), true);
  assert.equal(f.store.get('mail_received'), false);
  await f.app.flushMail();
  assert.equal(f.messages.length, 1, 'Only the explicit test email may send before its reception is confirmed');
  assert.equal((await f.call('admin/mail-confirm', { received: false })).status, 400);
  assert.equal((await f.call('admin/mail-confirm', { received: true })).status, 200);
  await f.drain();
  assert.equal(f.store.get('mail_received'), true);
  assert.deepEqual(unrelatedFlags(f), before);
  assert.equal((await f.call('config')).body.paymentsEnabled, false);
  const attached = f.messages.filter(mail => mail.attachments?.some(a => a.contentType === 'application/pdf'));
  assert.equal(attached.length, 2);
  for (const mail of attached) {
    const attachment = mail.attachments.find(a => a.contentType === 'application/pdf');
    assert.ok(Buffer.isBuffer(attachment.content));
    assert.equal(attachment.content.subarray(0, 5).toString(), '%PDF-');
    assert.match(attachment.filename, /\.pdf$/);
  }
  assert.equal(requestJobs(f, booking.id).filter(j => j.sent !== null).length, 2);
  assert.equal((await f.call('admin/mail-confirm', { received: true })).status, 200);
  await f.drain();
  assert.equal(f.messages.length, 3, 'Repeated reception confirmation must not duplicate request notifications');
});

test('offer preview requires authentication and CSRF, prices 12.3 km at EUR 261, and reserves no box', async t => {
  const f = await fixture(t);
  const { booking } = await f.submit();
  assert.equal((await f.call('admin/offer-preview', { id: booking.id, distanceKm: 12.3 })).status, 401);
  await f.login();
  assert.equal((await f.call('admin/offer-preview', { id: booking.id, distanceKm: 12.3 }, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM email_offers').get().n, 0);
  assert.equal((await f.call('admin/offer-preview', { id: booking.id, distanceKm: '12.3' })).status, 400);
  const preview = await f.call('admin/offer-preview', { id: booking.id, distanceKm: 12.3 });
  assert.equal(preview.status, 200);
  assertPdf(preview);
  assert.equal(preview.body.totalCents, 26100);
  const record = f.store.db.prepare('SELECT * FROM email_offers WHERE id=?').get(preview.body.previewId);
  const snapshot = JSON.parse(record.snapshot);
  assert.equal(snapshot.booking.distance, 12.3);
  assert.equal(snapshot.booking.billed_distance, 15);
  assert.equal(snapshot.booking.base_cents, 24900);
  assert.equal(snapshot.booking.travel_cents, 1200);
  assert.equal(snapshot.booking.extension_cents, 0);
  assert.equal(snapshot.booking.total_cents, 26100);
  assert.match(snapshot.options.acceptanceText, /reserviert keine Fotobox/);
  assert.equal(f.store.booking(booking.id).status, 'requested');
  assert.equal(f.store.booking(booking.id).unit, null);
  assert.deepEqual(f.store.available(booking.event_date, booking.end_date), [1]);
  assert.equal((await f.call('admin/email-offer', { previewId: preview.body.previewId })).status, 400);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get('offer-' + preview.body.previewId).n, 0);
});

test('offer snapshot survives a base-price restart and the same preview sends one PDF job exactly once', async t => {
  const f = await fixture(t);
  const { booking } = await f.submit();
  await f.login();
  const preview = await f.call('admin/offer-preview', { id: booking.id, distanceKm: 12.3 });
  assert.equal(preview.status, 200);
  const previewId = preview.body.previewId;
  const savedSnapshot = f.store.db.prepare('SELECT snapshot FROM email_offers WHERE id=?').get(previewId).snapshot;
  await f.restart(29900);
  await f.login();
  assert.equal((await f.call('config')).body.baseCents, 29900);
  assert.equal(f.store.db.prepare('SELECT snapshot FROM email_offers WHERE id=?').get(previewId).snapshot, savedSnapshot);
  await f.enableMail();
  const beforeFlags = unrelatedFlags(f);
  const results = await Promise.all([
    f.call('admin/email-offer', { previewId }),
    f.call('admin/email-offer', { previewId }),
  ]);
  assert.ok(results.every(r => r.status === 200));
  await f.drain();
  const jobs = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').all('offer-' + previewId);
  assert.equal(jobs.length, 1);
  assert.equal(JSON.parse(jobs[0].pdf_payload).booking.total_cents, 26100);
  assert.match(jobs[0].body.replace(/\u00a0/g, ' '), /Gesamt: 261,00 €/);
  assert.match(jobs[0].body, /reserviert keine Fotobox/);
  const actual = f.messages.filter(mail => mail.messageId === `<offer-${previewId}@localhost>`);
  assert.equal(actual.length, 1);
  const pdf = actual[0].attachments.find(a => a.contentType === 'application/pdf');
  assert.ok(pdf);
  assert.equal(pdf.content.subarray(0, 5).toString(), '%PDF-');
  assert.equal(f.store.booking(booking.id).status, 'requested');
  assert.equal(f.store.booking(booking.id).unit, null);
  assert.deepEqual(f.store.available(booking.event_date, booking.end_date), [1]);
  assert.deepEqual(unrelatedFlags(f), beforeFlags);
  assert.equal((await f.call('admin/email-offer', { previewId })).status, 200);
  await f.drain();
  assert.equal(f.messages.filter(mail => mail.messageId === `<offer-${previewId}@localhost>`).length, 1);
});

test('an expired offer draft or changed booking state cannot enqueue an offer email', async t => {
  const f = await fixture(t);
  const { booking } = await f.submit();
  await f.login();
  await f.enableMail();
  const expired = await f.call('admin/offer-preview', { id: booking.id, distanceKm: 12.3 });
  const stale = JSON.parse(f.store.db.prepare('SELECT snapshot FROM email_offers WHERE id=?').get(expired.body.previewId).snapshot);
  stale.booking.quote_until = Date.now() - 1000;
  f.store.db.prepare('UPDATE email_offers SET snapshot=? WHERE id=?').run(JSON.stringify(stale), expired.body.previewId);
  const response = await f.call('admin/email-offer', { previewId: expired.body.previewId });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Gültigkeit/);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get('offer-' + expired.body.previewId).n, 0);
  const fresh = await f.call('admin/offer-preview', { id: booking.id, distanceKm: 12.3 });
  f.store.db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(booking.id);
  assert.equal((await f.call('admin/email-offer', { previewId: fresh.body.previewId })).status, 400);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'offer-%'").get().n, 0);
});

test('an SMTP failure preserves the PDF job and authorized retry sends it without loss', async t => {
  const f = await fixture(t);
  await f.login();
  await f.enableMail();
  f.failNextSend();
  const { booking } = await f.submit();
  await f.waitFor(() => requestJobs(f, booking.id).some(job => job.attempts === 1));
  const failed = requestJobs(f, booking.id).find(job => job.attempts === 1);
  assert.equal(failed.sent, null);
  assert.match(failed.last_error, /Versand fehlgeschlagen/);
  assert.ok(failed.next_attempt > Date.now());
  assert.equal(JSON.parse(failed.pdf_payload).kind, 'inquiry');
  const failedAttempt = f.sendAttempts.find(mail => mail.messageId === `<${failed.id}@localhost>`);
  assert.ok(failedAttempt);
  assert.equal(failedAttempt.attachments.find(a => a.contentType === 'application/pdf').content.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await f.call('admin/retry-mail', {}, { Cookie: '' })).status, 401);
  assert.equal((await f.call('admin/retry-mail', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await f.call('admin/retry-mail', {})).status, 200);
  await f.drain();
  const recovered = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(failed.id);
  assert.ok(recovered.sent);
  assert.equal(recovered.attempts, 1);
  assert.equal(recovered.last_error, null);
  assert.equal(recovered.pdf_payload, failed.pdf_payload);
  const delivered = f.messages.filter(mail => mail.messageId === `<${failed.id}@localhost>`);
  assert.equal(delivered.length, 1);
  const attachedPdf = delivered[0].attachments.find(a => a.contentType === 'application/pdf');
  assert.equal(attachedPdf.content.subarray(0, 5).toString(), '%PDF-');
  assert.equal(requestJobs(f, booking.id).filter(job => job.sent !== null).length, 2);
});

test('a queued offer expiring during an SMTP outage is not sent and reports expiration', async t => {
  const f = await fixture(t);
  const { booking } = await f.submit();
  await f.login();
  await f.enableMail();
  const preview = await f.call('admin/offer-preview', { id: booking.id, distanceKm: 12.3 });
  assert.equal(preview.status, 200);
  const previewId = preview.body.previewId, jobId = 'offer-' + previewId;
  f.failNextSend();
  assert.equal((await f.call('admin/email-offer', { previewId })).status, 200);
  await f.waitFor(() => f.store.db.prepare('SELECT attempts FROM outbox WHERE id=?').get(jobId)?.attempts === 1);
  const job = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(jobId);
  assert.equal(job.sent, null);
  assert.equal(f.store.db.prepare('SELECT status FROM email_offers WHERE id=?').get(previewId).status, 'queued');
  const payload = JSON.parse(job.pdf_payload);
  payload.booking.quote_until = Date.now() - 1000;
  f.store.db.prepare('UPDATE outbox SET pdf_payload=? WHERE id=?').run(JSON.stringify(payload), jobId);
  f.store.db.prepare('UPDATE email_offers SET snapshot=? WHERE id=?').run(JSON.stringify(payload), previewId);
  assert.equal((await f.call('admin/retry-mail', {})).status, 200);
  await f.waitFor(() => /abgelaufen/.test(f.store.db.prepare('SELECT last_error FROM outbox WHERE id=?').get(jobId).last_error));
  const expired = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(jobId);
  assert.equal(expired.sent, null);
  assert.equal(expired.attempts, 1);
  assert.match(expired.last_error, /Angebot abgelaufen/);
  assert.ok(expired.next_attempt > Date.now() + 365 * 86400000);
  assert.equal(f.messages.filter(mail => mail.messageId === `<${jobId}@localhost>`).length, 0);
  assert.equal(f.sendAttempts.filter(mail => mail.messageId === `<${jobId}@localhost>`).length, 1, 'Only the original failed attempt may reach SMTP');
  assert.equal((await f.call('admin/retry-mail', {})).status, 200);
  await f.waitFor(() => f.store.db.prepare('SELECT next_attempt FROM outbox WHERE id=?').get(jobId).next_attempt > Date.now() + 365 * 86400000);
  assert.equal(f.sendAttempts.filter(mail => mail.messageId === `<${jobId}@localhost>`).length, 1);
  assert.equal(f.store.booking(booking.id).status, 'requested');
});

test('inquiry price snapshots stay at EUR 250 through restart, replay and delayed email after a price change', async t => {
  // Explicitly boot the historical price; never reinterpret this saved inquiry
  // as today's EUR 249 delivery package when testing migration/replay.
  const f = await fixture(t, { initialBaseCents: 25000 });
  const original = await f.submit();
  const before = requestJobs(f, original.booking.id);
  assert.ok(before.every(job => JSON.parse(job.pdf_payload).booking.base_cents === 25000));
  await f.restart(29900);
  const replay = await f.call('request', original.body);
  assert.equal(replay.status, 200);
  assertPdf(replay);
  assert.equal(replay.body.reference, original.booking.reference);
  const afterReplay = requestJobs(f, original.booking.id);
  assert.deepEqual(afterReplay.map(job => job.pdf_payload), before.map(job => job.pdf_payload));
  const fresh = await f.submit({ name: 'MUSTER Neuer Preis', email: 'new-price@example.invalid' });
  assert.ok(requestJobs(f, fresh.booking.id).every(job => JSON.parse(job.pdf_payload).booking.base_cents === 29900));
  await f.login();
  await f.enableMail();
  const afterSend = requestJobs(f, original.booking.id);
  assert.ok(afterSend.every(job => job.sent !== null && JSON.parse(job.pdf_payload).booking.base_cents === 25000));
  assert.deepEqual(afterSend.map(job => job.pdf_payload), before.map(job => job.pdf_payload));
  for (const job of afterSend) {
    const delivered = f.messages.find(mail => mail.messageId === `<${job.id}@localhost>`);
    assert.ok(delivered);
    assert.equal(delivered.attachments.find(a => a.contentType === 'application/pdf').content.subarray(0, 5).toString(), '%PDF-');
  }
});
