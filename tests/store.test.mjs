import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore, priceFor, plusDays, today } from '../server/core.mjs';

// HTTP integration requirements for the separate API test suite:
// 1. Concurrent POST /api/checkout calls for one offer create one payable Stripe
//    session and return that same session. Every other overlapping quote is rejected.
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
  // Explicit price override keeps existing contract/idempotency cases independent
  // of the current public package price.
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

test('pricing includes 10 km and rounds the one-way distance up to five km', () => {
  assert.deepEqual(priceFor(24_900, 0, 'delivery'), { baseCents: 24_900, travelCents: 0, extensionCents: 0, totalCents: 24_900 });
  assert.deepEqual(priceFor(24_900, 10, 'delivery'), { baseCents: 24_900, travelCents: 0, extensionCents: 0, totalCents: 24_900 });
  assert.deepEqual(priceFor(24_900, 20, 'delivery'), { baseCents: 24_900, travelCents: 2_400, extensionCents: 0, totalCents: 27_300 });
  assert.equal(priceFor(24_900, 10.25, 'delivery').travelCents, 1200);
  assert.equal(priceFor(24_900, 10.123, 'delivery').travelCents, 1200);
  assert.deepEqual(priceFor(19_900, 200, 'pickup'), { baseCents: 19_900, travelCents: 0, extensionCents: 0, totalCents: 19_900 });
  assert.equal(priceFor(19_900, 200, 'pickup', 1).totalCents, 24_800);
  assert.equal(priceFor(24_900, 20, 'delivery', 1).totalCents, 32_200);
});

test('pricing rejects invalid base prices and non-finite or out-of-range distances', () => {
  for (const base of [9_999, -1, 25_000.5, NaN, Infinity, '25000']) {
    assert.throws(() => priceFor(base, 20, 'delivery'));
  }
  for (const distance of [-1, 1000.01, NaN, Infinity, '20']) {
    assert.throws(() => priceFor(25_000, distance, 'delivery'));
  }
});

test('one physical box permits one overlapping quote; all additional reservations are rejected', t => {
  const { store, request } = fixture(t);
  const requests = [request(), request(), request()];
  const first = store.quote(requests[0].id, 20, 24_900);
  assert.equal(first.unit, 1);
  for (const additional of requests.slice(1)) {
    assert.throws(() => store.quote(additional.id, 20, 24_900));
    assert.equal(store.booking(additional.id).status, 'requested');
    assert.equal(store.booking(additional.id).unit, null);
  }
  assert.deepEqual(store.available(first.event_date, first.end_date), []);
  assert.deepEqual(store.available(plusDays(first.event_date, 1), plusDays(first.event_date, 3)), []);
  assert.deepEqual(store.available(first.end_date, plusDays(first.end_date, 2)), [1]);
});

test('manual calendar blocks and paid bookings cannot be overwritten by another reservation', t => {
  const { store, request } = fixture(t);
  const b = request();
  const blockId = store.addBlock(1, b.event_date, b.end_date, 'Existing offline booking');
  assert.throws(() => store.quote(b.id, 20, 24_900));
  assert.equal(store.booking(b.id).status, 'requested');
  assert.equal(store.booking(b.id).unit, null);
  assert.throws(() => store.addBlock(1, b.event_date, b.end_date, 'Conflict'));

  // A non-overlapping booking may proceed; once paid it prevents both a second
  // quote and an offline block, while the original manual block stays intact.
  const paidRequest = request({ date: b.end_date });
  store.quote(paidRequest.id, 20, 24_900);
  const checkout = store.startCheckout(paidRequest.id);
  const sessionId = 'cs_test_' + checkout.id;
  store.db.prepare('UPDATE bookings SET session_id=? WHERE id=?').run(sessionId, checkout.id);
  store.applySession({ id: sessionId, metadata: { booking_id: checkout.id }, currency: 'eur', amount_total: checkout.total_cents, payment_status: 'paid', status: 'complete', payment_intent: 'pi_test_' + checkout.id }, { confirmationText });
  const paid = store.booking(checkout.id);
  assert.equal(paid.status, 'confirmed');
  assert.equal(paid.unit, 1);
  assert.throws(() => store.addBlock(1, paid.event_date, paid.end_date, 'Paid booking conflict'));
  assert.throws(() => store.quote(request({ date: paid.event_date }).id, 20, 24_900));
  assert.ok(store.db.prepare('SELECT id FROM blocks WHERE id=?').get(blockId));
  assert.equal(store.booking(paid.id).status, 'confirmed');
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
