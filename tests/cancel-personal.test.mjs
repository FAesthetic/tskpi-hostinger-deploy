import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { passwordHash, plusDays, today } from '../server/core.mjs';

import { createApp } from '../server/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = 'MUSTER-local-cancel-personal-42';
const PASSWORD_HASH = passwordHash(PASSWORD);
const DATE = plusDays(today(), 45);
const ORIGIN = 'http://localhost';

async function fixture(t) {
  const directory = mkdtempSync(path.join(HERE, '.cancel-personal-'));
  const messages = [];
  const app = createApp({ directory, origin: ORIGIN, bootstrapHash: PASSWORD_HASH, startWorkers: false,
    stripeFactory: () => { throw Error('Unexpected Stripe call in personal-cancellation test'); },
    transportFactory: () => ({ verify: async () => true, sendMail: async message => { messages.push(message); return {}; } }),
  });
  const store = app.store, server = http.createServer(app.handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    app.close(); rmSync(directory, { recursive: true, force: true });
  });
  let cookie = '', csrf = '';
  const call = async (route, body, extraHeaders = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/${route}`, {
      method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extraHeaders }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const login = async () => {
    const response = await call('login', { password: PASSWORD });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0]; csrf = response.body.csrf;
  };
  const request = () => store.createRequest({ name: 'MUSTER Testkunde', email: 'customer@example.invalid', phone: '', date: DATE,
    location: 'MUSTER Testlocation, Rendsburg', delivery: 'pickup', customerType: 'private', message: 'Nur lokale synthetische Testdaten', extensionDays: 1 });
  const personal = () => {
    const b = request();
    store.db.prepare("UPDATE bookings SET status='confirmed',unit=1,confirmation_method='personal',confirmed=? WHERE id=?").run(Date.now(), b.id);
    const fresh = store.booking(b.id), previewId = 'preview-' + b.id;
    const snapshot = JSON.stringify({ kind: 'offer', booking: fresh, options: { acceptanceText: 'Historischer Angebotstext' } });
    store.db.prepare('INSERT INTO email_offers(id,booking_id,snapshot,created,status) VALUES(?,?,?,?,?)').run(previewId, b.id, snapshot, Date.now(), 'accepted');
    store.set('confirmed_offer_' + b.id, previewId);
    store.enqueue(b.email, 'MUSTER Buchungsbestätigung', 'Persönlich bestätigt. Kein Zahlungseingang bestätigt.', null, 'confirmation-' + b.id,
      { kind: 'confirmation', booking: fresh, options: { paymentConfirmed: false } });
    return fresh;
  };
  const cancel = (id, overrides = {}, headers = {}) => call('cancel-personal', { id, agreedCancellation: true, ...overrides }, headers);
  const snapshot = () => ({ bookings: store.db.prepare('SELECT * FROM bookings ORDER BY id').all(), offers: store.db.prepare('SELECT * FROM email_offers ORDER BY id').all(), jobs: store.db.prepare('SELECT * FROM outbox ORDER BY id').all(), settings: store.db.prepare('SELECT * FROM settings ORDER BY key').all() });
  return { app, store, call, login, request, personal, cancel, snapshot, messages };
}

test('personal cancellation requires authentication, CSRF and the exact origin', async t => {
  const f = await fixture(t), b = f.personal();
  assert.equal((await f.cancel(b.id)).status, 401);
  await f.login();
  const before = f.snapshot();
  assert.equal((await f.cancel(b.id, {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await f.cancel(b.id, {}, { Origin: 'http://wrong.example.invalid' })).status, 403);
  assert.deepEqual(f.snapshot(), before);
});

test('personal cancellation requires literal agreedCancellation=true and a known confirmed personal booking', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  const before = f.snapshot();
  for (const agreedCancellation of [undefined, false, 'true', 1]) assert.equal((await f.cancel(b.id, { agreedCancellation })).status, 400);
  assert.equal((await f.cancel('missing-booking')).status, 400);
  assert.deepEqual(f.snapshot(), before);
  for (const status of ['requested', 'quoted', 'checkout', 'processing', 'expired', 'payment_review', 'refunded']) {
    f.store.db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, b.id);
    const state = f.snapshot();
    assert.equal((await f.cancel(b.id)).status, 400, status);
    assert.deepEqual(f.snapshot(), state);
  }
  f.store.db.prepare("UPDATE bookings SET status='confirmed',confirmation_method=NULL WHERE id=?").run(b.id);
  const state = f.snapshot();
  assert.equal((await f.cancel(b.id)).status, 400);
  assert.deepEqual(f.snapshot(), state);
});

test('cancelling a personal extended booking releases capacity and preserves historic prices and documents', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  const oldOffer = f.store.db.prepare('SELECT * FROM email_offers WHERE booking_id=?').get(b.id);
  const oldJob = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('confirmation-' + b.id);
  assert.deepEqual(f.store.available(DATE, plusDays(DATE, 3)), []);
  const started = Date.now(), response = await f.cancel(b.id);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body, { ok: true, reference: b.reference, status: 'cancelled', emailQueued: false, customerNoticeRequired: true });
  assert.deepEqual({ ...f.store.booking(b.id) }, { ...b, status: 'cancelled' });
  assert.deepEqual(f.store.available(DATE, plusDays(DATE, 3)), [1]);
  assert.deepEqual(f.store.db.prepare('SELECT * FROM email_offers WHERE booking_id=?').get(b.id), oldOffer);
  const job = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('confirmation-' + b.id);
  assert.equal(job.pdf_payload, oldJob.pdf_payload);
  assert.equal(job.body, oldJob.body);
  assert.equal(job.sent, null);
  assert.equal(job.next_attempt, 8640000000000000);
  assert.match(job.last_error, /storniert/);
  const audit = f.store.get('personal_cancellation_' + b.id);
  assert.equal(audit.reference, b.reference);
  assert.equal(audit.previousStatus, 'confirmed');
  assert.equal(audit.agreedCancellation, true);
  assert.equal(audit.customerNoticeRequired, true);
  assert.ok(audit.cancelledAt >= started && audit.cancelledAt <= Date.now());
  assert.equal(f.messages.length, 0);
});

test('personal cancellation retries are idempotent even after the box is reserved for another customer', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  const results = await Promise.all([f.cancel(b.id), f.cancel(b.id)]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  assert.deepEqual(results[0].body, results[1].body);
  const next = f.request();
  f.store.quote(next.id, 0, 19900, { extensionDays: 1, pickupChecked: true });
  const before = f.snapshot();
  assert.equal((await f.cancel(b.id)).status, 200);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.store.available(DATE, plusDays(DATE, 3)), []);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM settings WHERE key LIKE 'personal_cancellation_%'").get().n, 1);
});

test('personal cancellation refuses every provider-linked booking including already cancelled records', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  for (const status of ['confirmed', 'cancelled']) {
    for (const [column, value] of [['session_id', 'cs_synthetic'], ['payment_intent', 'pi_synthetic'], ['refund_id', 're_synthetic'], ['refund_status', 'pending']]) {
      f.store.db.prepare(`UPDATE bookings SET status=?,session_id=NULL,payment_intent=NULL,refund_id=NULL,refund_status=NULL,${column}=? WHERE id=?`).run(status, value, b.id);
      const before = f.snapshot();
      assert.equal((await f.cancel(b.id)).status, 400, status + ' ' + column);
      assert.deepEqual(f.snapshot(), before);
    }
  }
});

test('an audit failure rolls back cancellation and queued-mail changes atomically', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  f.store.db.exec("CREATE TRIGGER fail_cancellation_audit BEFORE INSERT ON settings WHEN NEW.key LIKE 'personal_cancellation_%' BEGIN SELECT RAISE(ABORT,'Synthetic cancellation audit failure'); END");
  const before = f.snapshot();
  assert.equal((await f.cancel(b.id)).status, 400);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.store.available(DATE, plusDays(DATE, 3)), []);
  f.store.db.exec('DROP TRIGGER fail_cancellation_audit');
  assert.equal((await f.cancel(b.id)).status, 200);
});

test('a queued-mail update failure rolls back status and durable audit together', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  f.store.db.exec("CREATE TRIGGER fail_cancellation_queue BEFORE UPDATE ON outbox BEGIN SELECT RAISE(ABORT,'Synthetic cancellation queue failure'); END");
  const before = f.snapshot();
  assert.equal((await f.cancel(b.id)).status, 400);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.store.get('personal_cancellation_' + b.id), null);
});

test('a cancelled booking confirmation is not sent when SMTP is connected later', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  assert.equal((await f.cancel(b.id)).status, 200);
  f.store.set('smtp', { host: 'smtp.example.invalid', user: 'sender@example.invalid', pass: 'MUSTER synthetic credential', port: 465 });
  f.store.set('mail_received', true);
  await f.app.flushMail();
  assert.equal(f.messages.length, 0);
  assert.equal(f.store.db.prepare('SELECT sent FROM outbox WHERE id=?').get('confirmation-' + b.id).sent, null);
});

test('previously sent confirmation history stays unchanged after personal cancellation', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  f.store.db.prepare('UPDATE outbox SET sent=? WHERE id=?').run(Date.now() - 5000, 'confirmation-' + b.id);
  const oldJob = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('confirmation-' + b.id);
  assert.equal((await f.cancel(b.id)).status, 200);
  assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('confirmation-' + b.id), oldJob);
});

test('retrying the mail queue cannot send a cancelled personal booking confirmation', async t => {
  const f = await fixture(t), b = f.personal(); await f.login();
  assert.equal((await f.cancel(b.id)).status, 200);
  f.store.set('smtp', { host: 'smtp.example.invalid', user: 'sender@example.invalid', pass: 'MUSTER synthetic credential', port: 465 });
  f.store.set('mail_received', true);
  assert.equal((await f.call('retry-mail', {})).status, 200);
  // The route starts an asynchronous PDF render. Wait for the guard to restore
  // the hold, rather than passing before the background send has been attempted.
  const deadline = Date.now() + 5000;
  while (f.store.db.prepare('SELECT next_attempt FROM outbox WHERE id=?').get('confirmation-' + b.id).next_attempt < 8640000000000000) {
    if (Date.now() >= deadline) assert.fail('Cancelled confirmation was not put back on hold');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(f.messages.length, 0);
  assert.equal(f.store.db.prepare('SELECT sent FROM outbox WHERE id=?').get('confirmation-' + b.id).sent, null);
});
