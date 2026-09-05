import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore, priceFor, plusDays, today } from '../server/core.mjs';

// HTTP integration requirements for the separate API test suite:
// 1. Concurrent POST /api/checkout calls for one offer create one payable Stripe
//    session and return that same session. A third overlapping quote is rejected.
// 2. A timeout before Stripe creates a session can recover on retry. A timeout or
//    process restart after creation but before local persistence finds the same
//    session using unchanged saved parameters and the same idempotency key.
// 3. The desired checkout deadline does not release capacity until Stripe reports
//    expiry or explicit expiration succeeds. Provider outages retain the booking.
//    An unresolved orphan beyond the safe idempotency window enters owner review.
// 4. Forged signatures, wrong amounts/currencies, unrelated session IDs and old
//    attempt IDs cannot confirm a booking. Repeated valid webhooks send one mail.
// 5. A full refund delivered before checkout completion never produces a booking
//    confirmation. Resolve the payment's latest charge/refund state and metadata.
// 6. Cancellation releases the booking independently of refund delivery. Persist
//    refund ID/status; pending refunds recover after a lost webhook, failed
//    refunds require owner action, and late checkout events do not resurrect the
//    cancelled/refunded booking. Concurrent refund requests never refund twice.

const DAY = 86_400_000;
const confirmationText = b => `Buchungsbestätigung ${b.reference}`;

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'herzblende-review-'));
  let milliseconds = Date.now();
  const store = createStore(directory, { now: () => milliseconds });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    store,
    advance: delta => { milliseconds += delta; },
    request: (overrides = {}) => store.createRequest({
      name: 'Testkunde',
      email: 'customer@example.com',
      phone: '',
      date: plusDays(today(), 40),
      location: 'Teststraße 1, 24768 Rendsburg',
      delivery: 'delivery',
      customerType: 'private',
      message: '',
      ...overrides,
    }),
  };
}

function checkoutFixture(t) {
  const f = fixture(t);
  let booking = f.request();
  f.store.quote(booking.id, 20, 25_000);
  booking = f.store.startCheckout(booking.id);
  const sessionId = `cs_test_${booking.id}`;
  f.store.db.prepare('UPDATE bookings SET session_id=? WHERE id=?').run(sessionId, booking.id);
  booking = f.store.booking(booking.id);
  const session = {
    id: sessionId,
    metadata: { booking_id: booking.id },
    currency: 'eur',
    amount_total: booking.total_cents,
    payment_status: 'paid',
    status: 'complete',
    payment_intent: `pi_test_${booking.id}`,
  };
  return { ...f, booking, session };
}

function confirmationCount(store, booking) {
  return store.db.prepare('SELECT COUNT(*) AS count FROM outbox WHERE id=?').get(`confirmation-${booking.id}`).count;
}

test('pricing includes 10 km and charges four trips for the excess distance', () => {
  assert.deepEqual(priceFor(25_000, 0, 'delivery'), { baseCents: 25_000, travelCents: 0, totalCents: 25_000 });
  assert.deepEqual(priceFor(25_000, 10, 'delivery'), { baseCents: 25_000, travelCents: 0, totalCents: 25_000 });
  assert.deepEqual(priceFor(25_000, 20, 'delivery'), { baseCents: 25_000, travelCents: 2_400, totalCents: 27_400 });
  assert.equal(priceFor(25_000, 10.25, 'delivery').travelCents, 60);
  assert.equal(priceFor(25_000, 10.123, 'delivery').travelCents, 30);
  assert.equal(priceFor(25_000, 200, 'pickup').totalCents, 25_000);
});

test('pricing rejects invalid base prices and non-finite or out-of-range distances', () => {
  for (const base of [9_999, -1, 25_000.5, NaN, Infinity, '25000']) {
    assert.throws(() => priceFor(base, 20, 'delivery'));
  }
  for (const distance of [-1, 1000.01, NaN, Infinity, '20']) {
    assert.throws(() => priceFor(25_000, distance, 'delivery'));
  }
});

test('two overlapping quotes use separate physical boxes; the third cannot reserve', t => {
  const { store, request } = fixture(t);
  const requests = [request(), request(), request()];
  const first = store.quote(requests[0].id, 20, 25_000);
  const second = store.quote(requests[1].id, 20, 25_000);
  assert.deepEqual(new Set([first.unit, second.unit]), new Set([1, 2]));
  assert.throws(() => store.quote(requests[2].id, 20, 25_000));
  assert.equal(store.booking(requests[2].id).status, 'requested');
  assert.equal(store.booking(requests[2].id).unit, null);
  assert.deepEqual(store.available(first.event_date, first.end_date), []);
  assert.deepEqual(store.available(plusDays(first.event_date, 1), plusDays(first.event_date, 3)), []);
  assert.deepEqual(store.available(first.end_date, plusDays(first.end_date, 2)), [1, 2]);
});

test('manual calendar blocks and paid bookings cannot be overwritten by another reservation', t => {
  const { store, request } = fixture(t);
  const b = request();
  store.addBlock(1, b.event_date, b.end_date, 'Existing offline booking');
  const quoted = store.quote(b.id, 20, 25_000);
  assert.equal(quoted.unit, 2);
  assert.throws(() => store.addBlock(2, b.event_date, b.end_date, 'Conflict'));
  assert.throws(() => store.quote(request().id, 20, 25_000));
});

test('quote and checkout states retain capacity throughout unresolved payment processing', t => {
  const { store, booking } = checkoutFixture(t);
  for (const status of ['quoted', 'checkout', 'processing', 'confirmed', 'payment_review', 'refund_pending']) {
    store.db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, booking.id);
    assert.equal(store.available(booking.event_date, booking.end_date).includes(booking.unit), false, status);
  }
  for (const status of ['expired', 'cancelled', 'refunded']) {
    store.db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, booking.id);
    assert.equal(store.available(booking.event_date, booking.end_date).includes(booking.unit), true, status);
  }
});

test('matching paid confirmation is atomic and idempotent, including its email attachment', t => {
  const { store, booking, session, advance } = checkoutFixture(t);
  assert.equal(store.applySession(session, { confirmationText }), true);
  const first = store.booking(booking.id);
  assert.equal(first.status, 'confirmed');
  assert.equal(first.payment_intent, session.payment_intent);
  advance(60_000);
  assert.equal(store.applySession(session, { confirmationText }), true);
  assert.equal(store.booking(booking.id).confirmed, first.confirmed);
  assert.equal(confirmationCount(store, booking), 1);
  const mail = store.db.prepare('SELECT * FROM outbox WHERE id=?').get(`confirmation-${booking.id}`);
  assert.equal(mail.to_address, booking.email);
  assert.equal(mail.attachment, confirmationText(first));
});

test('a failure building contractual confirmation rolls back both booking and email', t => {
  const { store, booking, session } = checkoutFixture(t);
  assert.throws(() => store.applySession(session, { confirmationText: () => { throw Error('Missing contractual text'); } }));
  assert.equal(store.booking(booking.id).status, 'checkout');
  assert.equal(store.booking(booking.id).confirmed, null);
  assert.equal(confirmationCount(store, booking), 0);
});

test('an unrelated checkout session cannot confirm another booking', t => {
  const { store, booking, session } = checkoutFixture(t);
  assert.equal(store.applySession({ ...session, id: 'cs_unrelated' }, { confirmationText }), false);
  assert.equal(store.applySession({ ...session, metadata: { booking_id: 'unknown' } }, { confirmationText }), false);
  assert.equal(store.booking(booking.id).status, 'checkout');
  assert.equal(confirmationCount(store, booking), 0);
});

test('wrong provider amounts and currencies cannot confirm a booking', t => {
  const { store, booking, session } = checkoutFixture(t);
  assert.throws(() => store.applySession({ ...session, amount_total: session.amount_total - 1 }, { confirmationText }));
  assert.throws(() => store.applySession({ ...session, currency: 'usd' }, { confirmationText }));
  assert.equal(store.booking(booking.id).status, 'checkout');
  assert.equal(confirmationCount(store, booking), 0);
});

for (const terminalState of ['cancelled', 'refunded', 'refund_pending']) {
  test(`late checkout events do not resurrect ${terminalState} bookings`, t => {
    const { store, booking, session } = checkoutFixture(t);
    store.db.prepare('UPDATE bookings SET status=? WHERE id=?').run(terminalState, booking.id);
    for (const update of [
      session,
      { ...session, payment_status: 'unpaid', status: 'complete' },
      { ...session, payment_status: 'unpaid', status: 'expired' },
    ]) {
      store.applySession(update, { confirmationText });
      assert.equal(store.booking(booking.id).status, terminalState);
      assert.equal(confirmationCount(store, booking), 0);
    }
  });
}

test('a quote requires at least 15 calendar days of lead time', t => {
  const { store, request } = fixture(t);
  const tooSoon = request({ date: plusDays(today(), 14) });
  assert.throws(() => store.quote(tooSoon.id, 20, 25_000));
  assert.equal(store.booking(tooSoon.id).status, 'requested');
  const boundary = request({ date: plusDays(today(), 15) });
  assert.equal(store.quote(boundary.id, 20, 25_000).status, 'quoted');
});

test('a still-valid 48-hour offer cannot bypass lead time after 47 hours', t => {
  const { store, request, advance } = fixture(t);
  const b = request({ date: plusDays(today(), 15) });
  store.quote(b.id, 20, 25_000);
  advance(47 * 3_600_000);
  assert.throws(() => store.startCheckout(b.id));
  assert.notEqual(store.booking(b.id).status, 'checkout');
});

test('an offer cannot start a payment after its quoted deadline', t => {
  const { store, request, advance } = fixture(t);
  const b = request();
  store.quote(b.id, 20, 25_000);
  advance(2 * DAY + 1);
  assert.throws(() => store.startCheckout(b.id));
});

test('the packaged withdrawal attachment exists and contains contractual withdrawal text', () => {
  const attachment = readFileSync(new URL('../server/withdrawal.txt', import.meta.url), 'utf8');
  assert.ok(attachment.trim().length > 100, 'The statutory attachment must not be empty or a placeholder');
  assert.match(attachment, /widerruf/i);
});
