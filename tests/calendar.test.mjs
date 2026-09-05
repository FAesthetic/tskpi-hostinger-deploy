import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/index.mjs';
import { passwordHash, plusDays, today } from '../server/core.mjs';

const origin = 'http://localhost';
const password = 'calendar-review-test-password';
const monthOf = date => date.slice(0, 7);
const monthLength = month => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const dayIn = (response, date) => response.body.days.find(day => day.date === date);
const payload = (date = plusDays(today(), 45)) => ({
  name: 'Test Hochzeit', email: 'paar@example.invalid', phone: '0123456789',
  date, location: 'Testlocation, Wallstraße 34, Rendsburg', delivery: 'delivery',
  customerType: 'private', message: 'Nur ein lokaler automatisierter Test.',
  requestId: randomUUID(),
});

async function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'herzblende-calendar-'));
  const sent = [];
  const app = createApp({
    directory, origin, bootstrapHash: passwordHash(password), startWorkers: false,
    stripeFactory: () => { throw Error('Calendar tests must not contact Stripe.'); },
    transportFactory: () => ({ verify: async () => true, sendMail: async message => { sent.push(message); return { messageId: 'local-fake-mail' }; } }),
  });
  const server = http.createServer(app.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', csrf = '';
  const call = async (route, body, extraHeaders = {}) => {
    const response = await fetch(`${base}/api/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  const login = async () => {
    const response = await call('admin/login', { password });
    assert.equal(response.status, 200);
    cookie = response.cookie.split(';')[0];
    csrf = response.body.csrf;
  };
  t.after(async () => {
    server.closeIdleConnections();
    await new Promise(resolve => server.close(resolve));
    app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { app, store: app.store, call, login, sent };
}

test('unreviewed current month distinguishes past days from unknown dates and discloses no availability', async t => {
  const { call } = await fixture(t);
  const date = today(), response = await call(`availability?month=${monthOf(date)}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.reviewed, false);
  assert.equal(response.body.minDate, date);
  assert.equal(response.body.maxDate, plusDays(date, 540));
  assert.equal(response.body.days.length, monthLength(monthOf(date)));
  assert.equal('events' in response.body, false);
  assert.equal('blocks' in response.body, false);
  for (const day of response.body.days) {
    assert.equal(day.available, day.date < date ? 0 : null);
    assert.equal(day.status, day.date < date ? 'past' : 'unknown');
  }
});

test('month API returns actual calendar months, including February and year boundaries', async t => {
  const { call, store } = await fixture(t);
  store.set('calendar_reviewed', true);
  const first = monthOf(today()) + '-01';
  const [year, month] = first.split('-').map(Number);
  for (let offset = 0; offset < 18; offset++) {
    const candidate = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
    if (candidate + '-01' > plusDays(today(), 540)) continue;
    const response = await call(`availability?month=${candidate}`);
    assert.equal(response.status, 200, candidate);
    assert.equal(response.body.days.length, monthLength(candidate), candidate);
    assert.equal(response.body.days[0].date, candidate + '-01');
    assert.equal(response.body.days.at(-1).date, `${candidate}-${String(monthLength(candidate)).padStart(2, '0')}`);
    assert.equal(new Set(response.body.days.map(day => day.date)).size, monthLength(candidate));
  }
});

test('from API clamps at the inclusive 540-day horizon and month cells outside it are disabled', async t => {
  const { call, store } = await fixture(t);
  store.set('calendar_reviewed', true);
  const max = plusDays(today(), 540);
  const from = await call(`availability?from=${max}`);
  assert.equal(from.status, 200);
  assert.deepEqual(from.body.days.map(day => day.date), [max]);
  assert.equal(dayIn(from, max).available, 2);
  assert.equal((await call(`availability?from=${plusDays(max, 1)}`)).status, 400);
  assert.equal((await call(`availability?from=${plusDays(today(), -1)}`)).status, 400);
  const month = await call(`availability?month=${monthOf(max)}`);
  assert.equal(month.status, 200);
  for (const day of month.body.days.filter(day => day.date > max)) {
    assert.equal(day.status, 'outside_range');
    assert.equal(day.available, 0);
  }
});

test('invalid calendar query dates and months return a validation error', async t => {
  const { call, store } = await fixture(t);
  store.set('calendar_reviewed', true);
  for (const query of ['month=2027-00', 'month=2027-13', 'month=2027-2', 'from=2027-02-30', 'from=not-a-date']) {
    assert.equal((await call(`availability?${query}`)).status, 400, query);
  }
});

test('two physical boxes remain occupied through next-day pickup and free on day two', async t => {
  const { call, store } = await fixture(t);
  store.set('calendar_reviewed', true);
  const date = plusDays(today(), 45), end = plusDays(date, 2);
  store.addBlock(1, date, end, 'Box 1: Feier plus Rückgabe');
  let response = await call(`availability?from=${date}`);
  assert.equal(dayIn(response, date).available, 1);
  assert.equal(dayIn(response, plusDays(date, 1)).available, 1);
  store.addBlock(2, date, end, 'Box 2: Feier plus Rückgabe');
  response = await call(`availability?from=${date}`);
  assert.equal(dayIn(response, date).available, 0);
  assert.equal(dayIn(response, date).status, 'unavailable');
  assert.equal(dayIn(response, plusDays(date, 1)).available, 0);
  assert.equal(dayIn(response, end).available, 2);
  assert.equal(dayIn(response, end).status, 'available');
});

test('an unreviewed inquiry persists without SMTP and returns an honest durable receipt', async t => {
  const { call, store, sent } = await fixture(t);
  const data = payload(), response = await call('request', data);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.match(response.body.reference, /^HB-/);
  assert.equal(response.body.emailQueued, false);
  assert.equal(typeof response.body.receiptText, 'string');
  assert.ok(response.body.receiptText.includes(response.body.reference));
  const saved = store.db.prepare('SELECT * FROM bookings WHERE reference=?').get(response.body.reference);
  assert.equal(saved.event_date, data.date);
  assert.equal(saved.status, 'requested');
  assert.equal(saved.unit, null, 'A request must not claim or reserve a physical box.');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, 0);
  assert.equal(sent.length, 0);
});

test('same request ID survives retries with one reference; changed payload cannot reuse it', async t => {
  const { call, store } = await fixture(t);
  const data = payload();
  const first = await call('request', data);
  assert.equal(first.status, 200);
  const retry = await call('request', data);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.reference, first.body.reference);
  assert.equal(retry.body.receiptText, first.body.receiptText);
  const changed = await call('request', { ...data, date: plusDays(data.date, 1) });
  assert.equal(changed.status, 409);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 1);
});

test('concurrent identical request retries produce one stored inquiry', async t => {
  const { call, store } = await fixture(t);
  const data = payload();
  const results = await Promise.all([call('request', data), call('request', data)]);
  assert.deepEqual(results.map(response => response.status), [200, 200]);
  assert.equal(results[0].body.reference, results[1].body.reference);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 1);
});

test('configured request emails use only the fake transport and are not duplicated by retries', async t => {
  const { call, store, sent, app } = await fixture(t);
  store.set('smtp', { host: 'smtp.example.invalid', port: 465, user: 'local@example.invalid', pass: 'test-only' });
  store.set('mail_received', true);
  const data = payload(), first = await call('request', data);
  assert.equal(first.status, 200);
  assert.equal(first.body.emailQueued, true);
  await app.flushMail();
  const rowsBefore = store.db.prepare('SELECT COUNT(*) AS count FROM outbox').get().count;
  const retry = await call('request', data);
  await app.flushMail();
  assert.equal(retry.body.reference, first.body.reference);
  assert.equal(retry.body.emailQueued, true);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, rowsBefore);
  assert.equal(sent.filter(message => message.to === data.email).length, 1);
});

test('a successful retry remains the same receipt even after the calendar becomes full', async t => {
  const { call, store } = await fixture(t);
  store.set('calendar_reviewed', true);
  const data = payload(), first = await call('request', data);
  assert.equal(first.status, 200);
  store.addBlock(1, data.date, plusDays(data.date, 2), 'Neu belegt');
  store.addBlock(2, data.date, plusDays(data.date, 2), 'Neu belegt');
  const retry = await call('request', data);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.reference, first.body.reference);
});

test('submission rejects a date taken since availability was shown', async t => {
  const { call, store } = await fixture(t);
  store.set('calendar_reviewed', true);
  const data = payload();
  const before = await call(`availability?from=${data.date}`);
  assert.equal(dayIn(before, data.date).available, 2);
  store.addBlock(1, data.date, plusDays(data.date, 2), 'Belegt');
  store.addBlock(2, data.date, plusDays(data.date, 2), 'Belegt');
  assert.equal((await call('request', data)).status, 409);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 0);
});

test('request date validation permits the last bookable day and rejects the day after', async t => {
  const { call, store } = await fixture(t);
  const max = plusDays(today(), 540);
  assert.equal((await call('request', payload(max))).status, 200);
  assert.equal((await call('request', payload(plusDays(max, 1)))).status, 400);
  assert.equal((await call('request', payload(plusDays(today(), -1)))).status, 400);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 1);
});

test('private owner calendar and its review action require authentication and CSRF', async t => {
  const { call, login } = await fixture(t);
  assert.equal((await call(`admin/calendar?month=${monthOf(today())}`)).status, 401);
  assert.equal((await call('admin/calendar-review', { reviewed: true })).status, 401);
  await login();
  assert.equal((await call(`admin/calendar?month=${monthOf(today())}`)).status, 200);
  assert.equal((await call('admin/calendar-review', { reviewed: true }, { 'X-CSRF-Token': 'incorrect' })).status, 403);
});

test('calendar review changes only calendar readiness and preserves payment and mail flags', async t => {
  const { call, login, store } = await fixture(t);
  const unchanged = { mail_received: true, mail_test_sent: true, terms_reviewed: true, klarna_approved: true, stripe_live_ready: true, webhook_verified: true, live: true };
  for (const [key, value] of Object.entries(unchanged)) store.set(key, value);
  await login();
  assert.equal((await call('admin/calendar-review', { reviewed: true })).status, 200);
  assert.equal(store.get('calendar_reviewed'), true);
  for (const [key, value] of Object.entries(unchanged)) assert.equal(store.get(key), value, key);
  assert.equal((await call('admin/calendar-review', { reviewed: false })).status, 200);
  assert.equal(store.get('calendar_reviewed'), false);
  for (const [key, value] of Object.entries(unchanged)) assert.equal(store.get(key), value, key);
});

test('owner calendar finds an older confirmed booking behind more than 300 newer requests', async t => {
  const { call, login, store } = await fixture(t);
  const date = plusDays(today(), 45), data = payload(date);
  const booking = store.createRequest(data);
  store.db.prepare("UPDATE bookings SET status='confirmed',unit=1,created=0 WHERE id=?").run(booking.id);
  for (let index = 0; index < 305; index++) store.createRequest({ ...data, date: plusDays(date, 60), name: `Neuere Anfrage ${index}` });
  const blockId = store.addBlock(2, date, plusDays(date, 2), 'Manuelle Bestandssperre');
  await login();
  const response = await call(`admin/calendar?month=${monthOf(date)}`);
  assert.equal(response.status, 200);
  assert.equal(dayIn(response, date).available, 0);
  assert.deepEqual(dayIn(response, date).units, []);
  assert.ok(response.body.events.some(event => event.id === booking.id), 'Month query must include older overlapping bookings.');
  assert.ok(response.body.blocks.some(block => block.id === blockId));
  assert.equal(response.body.events.some(event => event.name === 'Neuere Anfrage 304'), false, 'A month query must not include unrelated future events.');
});
