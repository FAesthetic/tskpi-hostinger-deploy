import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createStore, priceFor, plusDays, today } from '../server/core.mjs';

const source = new URL(existsSync(new URL('../site/pricing.js', import.meta.url)) ? '../site/pricing.js' : '../public/pricing.js', import.meta.url);
const context = {};
runInNewContext(readFileSync(source, 'utf8'), context);
const cases = [[0,0,0],[9.9,10,0],[10,10,0],[10.01,15,1200],[12,15,1200],[15,15,1200],[15.01,20,2400],[20,20,2400],[23.4,25,3600],[29.9,30,4800],[30,30,4800],[30.1,35,6000],[999.9,1000,237600],[1000,1000,237600]];

test('browser and server charge the same five-km brackets for both packages with optional extension', () => {
  for (const [distance, billed, travel] of cases) {
    for (const delivery of ['delivery', 'pickup']) {
      for (const extensionDays of [0, 1]) {
        const base = delivery === 'pickup' ? 19900 : 24900;
        const expectedTravel = delivery === 'pickup' ? 0 : travel;
        const label = `${delivery}, ${distance} km, extension ${extensionDays}`;
        const ui = context.fotoboxPricing.quote(distance, delivery, extensionDays);
        const server = priceFor(base, distance, delivery, extensionDays);
        assert.equal(ui.baseCents, base, label);
        assert.equal(ui.billedDistanceKm, delivery === 'pickup' ? 0 : billed, label);
        assert.equal(ui.travelCents, expectedTravel, label);
        assert.equal(server.travelCents, expectedTravel, label);
        assert.equal(ui.extensionCents, extensionDays * 4900, label);
        assert.equal(server.extensionCents, ui.extensionCents, label);
        assert.equal(ui.totalCents, base + expectedTravel + extensionDays * 4900, label);
        assert.equal(server.totalCents, ui.totalCents, label);
      }
    }
  }
});

test('browser rejects invalid distances instead of silently rounding them', () => {
  for (const value of [-1, 1000.01, Infinity, NaN, '12', null]) {
    assert.throws(() => context.fotoboxPricing.quote(value));
  }
});

test('new offers retain exact route and rounded billing snapshot, old offers survive migration', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hb-rounding-'));
  let store = createStore(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const data = { name:'Test', email:'test@example.invalid', phone:'', date:plusDays(today(),45), location:'Rendsburg Testlocation', delivery:'delivery', customerType:'private', message:'' };
  const booking = store.createRequest(data);
  const quote = store.quote(booking.id, 12.3, 24900);
  assert.equal(quote.distance, 12.3);
  assert.equal(quote.billed_distance, 15);
  assert.equal(quote.base_cents, 24900);
  assert.equal(quote.travel_cents, 1200);
  assert.equal(quote.extension_cents, 0);
  assert.equal(quote.total_cents, 26100);
  assert.equal(quote.terms_version, '2026-09-06-v4');

  // Model an already-issued EUR 250, kilometer-exact offer. Its price and legal
  // snapshot must survive independently of today's EUR 249 delivery package.
  store.db.prepare("UPDATE bookings SET base_cents=25000,distance=12.3,travel_cents=552,total_cents=25552,extension_days=0,extension_cents=0,pricing_version=NULL,terms_version='2026-09-05-v1' WHERE id=?").run(booking.id);
  store.db.exec('ALTER TABLE bookings DROP COLUMN billed_distance');
  store.close();
  store = createStore(dir);
  const old = store.booking(booking.id);
  assert.equal(old.billed_distance, null);
  assert.equal(old.base_cents, 25000);
  assert.equal(old.extension_cents, 0);
  assert.equal(old.total_cents, 25552);
  assert.equal(old.terms_version, '2026-09-05-v1');
  const payable = store.startCheckout(booking.id);
  assert.equal(payable.total_cents, 25552);
  assert.equal(payable.terms_version, '2026-09-05-v1');
  assert.ok(readFileSync(new URL('../server/terms-v1.txt', import.meta.url), 'utf8').includes('2026-09-05-v1'));
});
