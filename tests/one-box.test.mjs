import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createStore, hash, passwordHash, plusDays, priceFor, today } from '../server/core.mjs';
import { backupBeforeMigration, inventoryIssues, PRICE_VERSION } from '../server/inventory.mjs';
import { createApp } from '../server/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_URL = new URL('../server/core.mjs', import.meta.url).href;
const NOW = Date.now();
const DATE = plusDays(today(NOW), 45);
const KEY = Buffer.alloc(32, 7); // Synthetic key; never reads production credentials/data.
const HELD = ['quoted', 'checkout', 'processing', 'confirmed', 'payment_review', 'refund_pending'];

function fixture(t) {
  const directory = mkdtempSync(path.join(HERE, '.one-box-test-'));
  const handles = new Set();
  t.after(() => {
    for (const handle of handles) handle.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    open() { const store = createStore(directory, { now: () => NOW }); handles.add(store); return store; },
    track(handle) { handles.add(handle); return handle; },
    close(handle) { handle.close(); handles.delete(handle); },
  };
}

function request(store, overrides = {}) {
  return store.createRequest({
    name: 'MUSTER Testkunde', email: 'test@example.invalid', phone: '',
    date: DATE, location: 'MUSTER Testlocation, Rendsburg', delivery: 'delivery',
    customerType: 'private', message: 'Lokale synthetische Testdaten', ...overrides,
  });
}

function legacy(f, { status = 'confirmed', overlap = false, block = false, invalidUnit = false } = {}) {
  writeFileSync(path.join(f.directory, 'master.key'), KEY, { mode: 0o600 });
  const db = f.track(new DatabaseSync(path.join(f.directory, 'bookings.sqlite')));
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE bookings(
      id TEXT PRIMARY KEY,reference TEXT UNIQUE NOT NULL,token_hash TEXT UNIQUE NOT NULL,
      request_key TEXT,request_fingerprint TEXT,name TEXT NOT NULL,email TEXT NOT NULL,
      phone TEXT NOT NULL,event_date TEXT NOT NULL,end_date TEXT NOT NULL,location TEXT NOT NULL,
      delivery TEXT NOT NULL,customer_type TEXT NOT NULL,message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',unit INTEGER,distance REAL,billed_distance REAL,
      base_cents INTEGER,travel_cents INTEGER,total_cents INTEGER,quote_until INTEGER,
      session_id TEXT UNIQUE,checkout_expires INTEGER,payment_intent TEXT,refund_id TEXT,
      refund_status TEXT,review_reason TEXT,created INTEGER NOT NULL,confirmed INTEGER,terms_version TEXT
    );
    CREATE TABLE blocks(id TEXT PRIMARY KEY,unit INTEGER NOT NULL CHECK(unit IN (1,2)),start_date TEXT NOT NULL,end_date TEXT NOT NULL,note TEXT NOT NULL);
    CREATE TABLE outbox(id TEXT PRIMARY KEY,to_address TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,attachment TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,sent INTEGER,last_error TEXT,pdf_payload TEXT);
    CREATE TABLE email_offers(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),snapshot TEXT NOT NULL,created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft');
    CREATE TABLE snapshot_writes(table_name TEXT NOT NULL);
    CREATE TRIGGER record_offer_updates AFTER UPDATE ON email_offers BEGIN INSERT INTO snapshot_writes VALUES('email_offers'); END;
    CREATE TRIGGER record_outbox_updates AFTER UPDATE ON outbox BEGIN INSERT INTO snapshot_writes VALUES('outbox'); END;
  `);
  const insert = (id, unit, bookingStatus, date = DATE, amount = 25000, delivery = 'delivery') => {
    db.prepare(`INSERT INTO bookings(id,reference,token_hash,name,email,phone,event_date,end_date,location,delivery,customer_type,message,status,unit,distance,billed_distance,base_cents,travel_cents,total_cents,quote_until,created,terms_version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, `HB-${id}`, hash(id), 'MUSTER Altkunde', 'legacy@example.invalid', '', date,
      plusDays(date, 2), 'MUSTER Altlocation', delivery, 'private', 'Historische Anfrage',
      bookingStatus, unit, 12.3, null, amount, amount === null ? null : 552,
      amount === null ? null : amount + 552, NOW + 48 * 3600000, NOW - 10000, '2026-09-05-v1',
    );
  };
  insert('legacy-two', invalidUnit ? null : 2, status);
  if (overlap) insert('legacy-one', 1, 'confirmed', plusDays(DATE, 1));
  if (block) db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?)').run('legacy-block', 2, DATE, plusDays(DATE, 2), 'Historische Sperre');
  insert('legacy-request', null, 'requested', plusDays(DATE, 20), null, 'pickup');
  const snapshot = JSON.stringify({ kind: 'offer', booking: { reference: 'HB-legacy-two', event_date: DATE, base_cents: 25000, travel_cents: 552, total_cents: 25552, terms_version: '2026-09-05-v1' }, options: { serviceText: 'Historische Leistung: genau 24 Stunden.' } }, null, 2);
  db.prepare('INSERT INTO email_offers VALUES(?,?,?,?,?)').run('old-preview', 'legacy-two', snapshot, NOW - 5000, 'queued');
  db.prepare('INSERT INTO outbox(id,to_address,subject,body,attachment,next_attempt,pdf_payload) VALUES(?,?,?,?,?,?,?)').run('old-mail', 'legacy@example.invalid', 'Altes Angebot', 'Historischer Betrag 255,52 €', 'Unveränderte alte Bedingungen', NOW, snapshot);
  const params = { amount: 25552, attempt: 'old-attempt', line_items: [{ price_data: { unit_amount: 25552 }, quantity: 1 }] };
  const iv = Buffer.alloc(12, 3), cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(params)), cipher.final()]);
  const encrypted = [iv, cipher.getAuthTag(), bytes].map(value => value.toString('base64')).join('.');
  db.prepare('INSERT INTO settings VALUES(?,?)').run('checkout-params-legacy-two-old-attempt', encrypted);
  const original = {
    rows: db.prepare('SELECT * FROM bookings ORDER BY id').all(),
    offers: db.prepare('SELECT * FROM email_offers').all(),
    outbox: db.prepare('SELECT * FROM outbox').all(), encrypted,
  };
  return { db, original, snapshot, params };
}

function originalColumns(row, before) {
  return Object.fromEntries(Object.keys(before).map(key => [key, row[key]]));
}

test('one physical box is the entire inventory and a second overlapping quote is rejected', t => {
  const f = fixture(t), store = f.open();
  assert.deepEqual(store.available(DATE, plusDays(DATE, 2)), [1]);
  const a = request(store), b = request(store);
  const quote = store.quote(a.id, 0, 24900);
  assert.equal(quote.unit, 1);
  assert.deepEqual(store.available(DATE, plusDays(DATE, 2)), []);
  assert.throws(() => store.quote(b.id, 0, 24900), /belegt/);
  assert.equal(store.booking(b.id).status, 'requested');
  assert.equal(store.booking(b.id).unit, null);
  assert.throws(() => store.addBlock(1, DATE, plusDays(DATE, 1), 'Konflikt'));
  assert.throws(() => store.addBlock(2, plusDays(DATE, 5), plusDays(DATE, 6), 'Keine zweite Box'));
  assert.deepEqual(store.available(quote.end_date, plusDays(quote.end_date, 2)), [1]);
});

test('two independent store connections share committed reservations', t => {
  const f = fixture(t), first = f.open(), second = f.open();
  const a = request(first), b = request(second);
  first.quote(a.id, 0, 24900);
  assert.deepEqual(second.available(DATE, plusDays(DATE, 2)), []);
  assert.throws(() => second.quote(b.id, 0, 24900), /belegt/);
  assert.equal(first.db.prepare("SELECT count(*) n FROM bookings WHERE status='quoted'").get().n, 1);
});

test('simultaneous quotes on two worker-owned SQLite connections can reserve only once', async t => {
  const f = fixture(t), store = f.open();
  const ids = [request(store).id, request(store).id];
  f.close(store);
  const gate = new SharedArrayBuffer(4);
  const workers = ids.map(id => new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    (async()=>{
      let store;
      try {
        const {createStore}=await import(workerData.module);
        store=createStore(workerData.directory);
        parentPort.postMessage({type:'ready'});
        Atomics.wait(new Int32Array(workerData.gate),0,0);
        try { const b=store.quote(workerData.id,0,24900);parentPort.postMessage({type:'result',ok:true,unit:b.unit}); }
        catch(error) { parentPort.postMessage({type:'result',ok:false,message:error.message}); }
      } catch(error) { parentPort.postMessage({type:'fatal',message:error.stack}); }
      finally { if(store)store.close(); }
    })();
  `, { eval: true, workerData: { module: CORE_URL, directory: f.directory, id, gate } }));
  t.after(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
  const controls = workers.map(worker => {
    let readyResolve, readyReject, resultResolve, resultReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const result = new Promise((resolve, reject) => { resultResolve = resolve; resultReject = reject; });
    // Attach now so a startup error cannot become an unhandled rejection.
    result.catch(() => {});
    worker.on('message', message => {
      if (message.type === 'ready') readyResolve();
      if (message.type === 'result') resultResolve(message);
      if (message.type === 'fatal') { const error = new Error(message.message); readyReject(error); resultReject(error); }
    });
    worker.on('error', error => { readyReject(error); resultReject(error); });
    return { ready, result };
  });
  await Promise.all(controls.map(control => control.ready));
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0, workers.length);
  const results = await Promise.all(controls.map(control => control.result));
  assert.equal(results.filter(result => result.ok).length, 1, JSON.stringify(results));
  assert.match(results.find(result => !result.ok).message, /belegt/);
  const reopened = f.open();
  assert.equal(reopened.db.prepare("SELECT count(*) n FROM bookings WHERE status='quoted'").get().n, 1);
  assert.equal(reopened.db.prepare("SELECT count(*) n FROM bookings WHERE status='requested'").get().n, 1);
});

for (const status of HELD) {
  test(`legacy unit=2 ${status} blocks the only resource without rewriting the row`, t => {
    const f = fixture(t), old = legacy(f, { status }), store = f.open();
    const before = old.original.rows.find(row => row.id === 'legacy-two');
    assert.deepEqual(originalColumns(store.booking(before.id), before), { ...before });
    assert.deepEqual(store.available(DATE, plusDays(DATE, 2)), []);
    assert.deepEqual(store.available(DATE, plusDays(DATE, 2), before.id), [1]);
    assert.throws(() => store.quote(request(store).id, 0, 24900), /belegt/);
    assert.equal(store.booking(before.id).unit, 2);
  });
}

test('a legacy unit=2 block occupies the box independently of the booking unit', t => {
  const f = fixture(t), old = legacy(f, { status: 'cancelled', block: true }), store = f.open();
  assert.deepEqual(store.available(DATE, plusDays(DATE, 2)), []);
  assert.throws(() => store.addBlock(1, DATE, plusDays(DATE, 1), 'Nicht frei'));
  assert.deepEqual(store.db.prepare('SELECT * FROM blocks').all(), old.db.prepare('SELECT * FROM blocks').all());
  assert.equal(store.db.prepare('SELECT unit FROM blocks').get().unit, 2);
});

test('overlapping legacy bookings are reported with their actual intersection and remain intact', t => {
  const f = fixture(t), old = legacy(f, { overlap: true }), store = f.open();
  const issues = store.conflicts();
  const overlap = issues.find(issue => issue.type === 'overlap');
  assert.ok(overlap);
  assert.deepEqual(new Set(overlap.ids), new Set(['legacy-two', 'legacy-one']));
  assert.equal(overlap.start, plusDays(DATE, 1));
  assert.equal(overlap.end, plusDays(DATE, 2));
  for (const before of old.original.rows.filter(row => row.status === 'confirmed')) {
    assert.deepEqual(originalColumns(store.booking(before.id), before), { ...before });
  }
  assert.deepEqual(store.available(DATE, plusDays(DATE, 3)), []);
  assert.equal(store.db.prepare('SELECT count(*) n FROM bookings').get().n, old.original.rows.length);
});

test('unknown legacy assignments fail closed and are explicitly reported', t => {
  const f = fixture(t); legacy(f, { invalidUnit: true }); const store = f.open();
  assert.deepEqual(store.available(DATE, plusDays(DATE, 2)), []);
  assert.ok(store.conflicts().some(issue => issue.type === 'assignment' && issue.ids.includes('legacy-two')));
});

test('historical and cancelled bookings do not create false conflict reports', t => {
  const f = fixture(t), store = f.open();
  const a = request(store), b = request(store);
  store.db.prepare("UPDATE bookings SET status='cancelled',unit=2 WHERE id=?").run(a.id);
  store.db.prepare("UPDATE bookings SET status='confirmed',unit=1,event_date=?,end_date=? WHERE id=?").run(plusDays(today(NOW), -3), plusDays(today(NOW), -1), b.id);
  assert.deepEqual(inventoryIssues(store.db, today(NOW)), []);
  assert.deepEqual(store.available(DATE, plusDays(DATE, 2)), [1]);
});

test('backupBeforeMigration includes original WAL rows and the original decryption key', t => {
  const f = fixture(t), old = legacy(f);
  assert.ok(statSync(path.join(f.directory, 'bookings.sqlite-wal')).size > 0, 'Fixture contains committed WAL data');
  const backup = backupBeforeMigration(old.db, f.directory, path.join(f.directory, 'master.key'));
  assert.equal(backup.verified, true);
  const folder = path.join(f.directory, backup.folder);
  const copied = f.track(new DatabaseSync(path.join(folder, 'bookings.sqlite'), { readOnly: true }));
  assert.equal(copied.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(copied.prepare('PRAGMA user_version').get().user_version, 0);
  assert.deepEqual(copied.prepare('SELECT * FROM bookings ORDER BY id').all(), old.original.rows);
  assert.deepEqual(copied.prepare('SELECT * FROM email_offers').all(), old.original.offers);
  assert.deepEqual(copied.prepare('SELECT * FROM outbox').all(), old.original.outbox);
  const copiedKey = readFileSync(path.join(folder, 'master.key'));
  assert.deepEqual(copiedKey, KEY);
  const [iv, tag, ciphertext] = copied.prepare('SELECT value FROM settings').get().value.split('.').map(value => Buffer.from(value, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', copiedKey, iv); decipher.setAuthTag(tag);
  assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString()), old.params);
  assert.equal(statSync(folder).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(folder, 'bookings.sqlite')).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(folder, 'master.key')).mode & 0o777, 0o600);
});

test('migration backs up before filling legacy requests, writes no old snapshots, and is idempotent', t => {
  const f = fixture(t), old = legacy(f); let store = f.open();
  const backup = store.get('one_box_backup');
  assert.equal(backup.verified, true);
  const backupDb = f.track(new DatabaseSync(path.join(f.directory, backup.folder, 'bookings.sqlite'), { readOnly: true }));
  assert.equal(backupDb.prepare("SELECT base_cents FROM bookings WHERE id='legacy-request'").get().base_cents, null);
  assert.equal(store.booking('legacy-request').base_cents, 25000, 'Historical missing price must not become the new 199-euro pickup price');
  assert.equal(store.booking('legacy-request').total_cents, 25000);
  const assertFrozen = () => {
    assert.deepEqual(store.db.prepare('SELECT * FROM email_offers').all(), old.original.offers);
    assert.deepEqual(store.db.prepare('SELECT * FROM outbox').all(), old.original.outbox);
    assert.equal(store.db.prepare('SELECT count(*) n FROM snapshot_writes').get().n, 0);
    assert.equal(store.db.prepare('SELECT value FROM settings WHERE key=?').get('checkout-params-legacy-two-old-attempt').value, old.original.encrypted);
    assert.deepEqual(store.get('checkout-params-legacy-two-old-attempt'), old.params);
    assert.equal(store.booking('legacy-two').total_cents, 25552);
    assert.equal(store.booking('legacy-two').terms_version, '2026-09-05-v1');
    assert.equal(store.booking('legacy-two').unit, 2);
    assert.equal(store.get('physical_units'), 1);
  };
  assertFrozen();
  const files = readdirSync(path.join(f.directory, 'backups'));
  const rows = store.db.prepare('SELECT * FROM bookings ORDER BY id').all();
  f.close(store); store = f.open();
  assertFrozen();
  assert.deepEqual(store.db.prepare('SELECT * FROM bookings ORDER BY id').all(), rows);
  assert.deepEqual(readdirSync(path.join(f.directory, 'backups')), files, 'A restart must not generate another migration backup');
});

test('fresh installations do not pretend a pre-migration database backup exists', t => {
  const f = fixture(t), store = f.open();
  assert.equal(store.get('one_box_backup'), null);
  assert.equal(store.get('physical_units'), 1);
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 1);
});

for (const delivery of ['pickup', 'delivery']) {
  for (const extensionDays of [0, 1]) {
    test(`${delivery} request snapshots its new base price and ${extensionDays * 24} extra hours`, t => {
      const f = fixture(t), store = f.open();
      const b = request(store, { delivery, extensionDays });
      assert.equal(b.base_cents, delivery === 'pickup' ? 19900 : 24900);
      assert.equal(b.extension_days, extensionDays);
      assert.equal(b.extension_cents, extensionDays * 4900);
      assert.equal(b.end_date, plusDays(DATE, 2 + extensionDays));
      assert.equal(b.pricing_version, PRICE_VERSION);
      assert.equal(b.status, 'requested');
      assert.equal(b.unit, null);
      assert.equal(b.total_cents, delivery === 'pickup' ? 19900 + extensionDays * 4900 : null);
      assert.deepEqual(store.available(DATE, b.end_date), [1], 'An inquiry does not reserve the box');
    });
  }
}

test('an extended quote prices 49 euros and blocks the extra day including return', t => {
  const f = fixture(t), store = f.open();
  const b = request(store, { extensionDays: 1 });
  const q = store.quote(b.id, 30, 24900, { extensionDays: 1, extensionCents: 4900 });
  assert.equal(q.end_date, plusDays(DATE, 3));
  assert.equal(q.extension_cents, 4900);
  assert.equal(q.travel_cents, 4800);
  assert.equal(q.total_cents, 34600);
  assert.equal(q.unit, 1);
  assert.deepEqual(store.available(plusDays(DATE, 2), plusDays(DATE, 3)), []);
  assert.deepEqual(store.available(plusDays(DATE, 3), plusDays(DATE, 4)), [1]);
});

test('a conflict only on the extension day rejects the whole quote without partial writes', t => {
  const f = fixture(t), store = f.open();
  store.addBlock(1, plusDays(DATE, 2), plusDays(DATE, 3), 'Rückgabetag kollidiert');
  const b = request(store, { extensionDays: 1 });
  const before = store.booking(b.id);
  assert.throws(() => store.quote(b.id, 0, 24900, { extensionDays: 1 }), /belegt/);
  assert.deepEqual(store.booking(b.id), before);
  const baseOnly = store.quote(b.id, 0, 24900, { extensionDays: 0 });
  assert.equal(baseOnly.end_date, plusDays(DATE, 2));
  assert.equal(baseOnly.extension_cents, 0);
});

test('self-pickup requires explicit operator check before reserving, including extension', t => {
  const f = fixture(t), store = f.open();
  const b = request(store, { delivery: 'pickup', extensionDays: 1 });
  const before = store.booking(b.id);
  for (const pickupChecked of [undefined, false, 'true', 1]) {
    assert.throws(() => store.quote(b.id, 0, 19900, { extensionDays: 1, pickupChecked }), /Selbstabholung/);
    assert.deepEqual(store.booking(b.id), before);
  }
  const q = store.quote(b.id, 0, 19900, { extensionDays: 1, pickupChecked: true });
  assert.equal(q.total_cents, 24800);
  assert.equal(q.travel_cents, 0);
  assert.equal(q.end_date, plusDays(DATE, 3));
});

test('priceFor adds extension once and leaves the existing four-trip five-km brackets intact', () => {
  for (const [distance, travel] of [[0, 0], [10, 0], [10.01, 1200], [15, 1200], [15.01, 2400], [30, 4800]]) {
    for (const extra of [0, 1]) {
      assert.deepEqual(priceFor(24900, distance, 'delivery', extra), {
        baseCents: 24900, travelCents: travel, extensionCents: extra * 4900, totalCents: 24900 + travel + extra * 4900,
      });
      assert.deepEqual(priceFor(19900, distance, 'pickup', extra), {
        baseCents: 19900, travelCents: 0, extensionCents: extra * 4900, totalCents: 19900 + extra * 4900,
      });
    }
  }
  assert.equal(priceFor(24900, 30, 'delivery', 1, 6000).totalCents, 35700);
});

test('invalid extension options fail before a booking or quote is modified', t => {
  const f = fixture(t), store = f.open();
  const b = request(store), before = store.booking(b.id);
  for (const value of [-1, 2, 0.5, '1', true, NaN, Infinity]) {
    assert.throws(() => priceFor(24900, 0, 'delivery', value));
    assert.throws(() => request(store, { extensionDays: value }));
    assert.throws(() => store.quote(b.id, 0, 24900, { extensionDays: value }));
    assert.deepEqual(store.booking(b.id), before);
  }
  for (const value of [-1, 0.5, '4900', NaN, Infinity]) assert.throws(() => priceFor(24900, 0, 'delivery', 1, value));
  assert.equal(store.db.prepare('SELECT count(*) n FROM bookings').get().n, 1);
});

test('a non-conflicting old unit=2 offer can still be paid at its old exact amount', t => {
  const f = fixture(t); legacy(f, { status: 'quoted' }); const store = f.open();
  let b = store.startCheckout('legacy-two');
  assert.equal(b.unit, 2);
  assert.equal(b.total_cents, 25552);
  assert.equal(b.terms_version, '2026-09-05-v1');
  store.db.prepare('UPDATE bookings SET session_id=? WHERE id=?').run('cs_legacy', b.id);
  const s = { id: 'cs_legacy', metadata: { booking_id: b.id }, amount_total: 25552, currency: 'eur', status: 'complete', payment_status: 'paid', payment_intent: 'pi_legacy' };
  store.applySession(s, { confirmationText: () => 'Historische Vertragsbestätigung' });
  b = store.booking(b.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.unit, 2);
  assert.equal(b.total_cents, 25552);
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE id='confirmation-legacy-two'").get().n, 1);
  assert.deepEqual(store.available(DATE, plusDays(DATE, 2)), []);
});

test('a late paid legacy checkout overlapping another old booking stays under review and blocks inventory', t => {
  const f = fixture(t); legacy(f, { status: 'checkout', overlap: true }); const store = f.open();
  store.db.prepare("UPDATE bookings SET session_id='cs_conflict' WHERE id='legacy-two'").run();
  const s = { id: 'cs_conflict', metadata: { booking_id: 'legacy-two' }, amount_total: 25552, currency: 'eur', status: 'complete', payment_status: 'paid', payment_intent: 'pi_conflict' };
  store.applySession(s, { confirmationText: () => 'Must not send this confirmation' });
  assert.equal(store.booking('legacy-two').status, 'payment_review');
  assert.equal(store.booking('legacy-one').status, 'confirmed');
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE id='confirmation-legacy-two'").get().n, 0);
  assert.deepEqual(store.available(DATE, plusDays(DATE, 3)), []);
  assert.ok(store.conflicts().some(issue => issue.type === 'overlap'));
});

// HTTP tests use loopback only, temporary data and fake SMTP. An unexpected Stripe
// call throws; no credentials, production databases or remote endpoints are used.
const HTTP_PASSWORD = 'MUSTER-local-one-box-password-42';
const HTTP_PASSWORD_HASH = passwordHash(HTTP_PASSWORD);
const HTTP_ORIGIN = 'http://localhost';

async function httpFixture(t, initialPrices = {}) {
  const directory = mkdtempSync(path.join(HERE, '.one-box-http-'));
  const messages = [];
  let app, server, base, cookie = '', csrf = '';
  const boot = async (prices = {}) => {
    app = createApp({
      directory, origin: HTTP_ORIGIN, bootstrapHash: HTTP_PASSWORD_HASH,
      baseCents: 24900, pickupCents: 19900, extensionCents: 4900, ...prices,
      startWorkers: false,
      stripeFactory: () => { throw Error('Unexpected Stripe call in one-box HTTP test'); },
      transportFactory: () => ({ verify: async () => true, sendMail: async mail => { messages.push(mail); return {}; } }),
    });
    server = http.createServer(app.handler);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    app.close(); server = null;
  };
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
  await boot(initialPrices);
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: HTTP_ORIGIN, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, bytes, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes.toString()) : null };
  };
  const login = async () => {
    const response = await call('admin/login', { password: HTTP_PASSWORD });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    cookie = response.headers.get('set-cookie').split(';')[0]; csrf = response.body.csrf;
  };
  const submit = async (overrides = {}) => {
    const body = {
      requestId: randomUUID(), name: 'MUSTER Testkunde', email: 'test@example.invalid', phone: '',
      date: DATE, location: 'MUSTER Testlocation, Rendsburg', delivery: 'delivery',
      customerType: 'private', message: 'Lokale synthetische Testdaten', ...overrides,
    };
    const response = await call('request', body);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const booking = app.store.db.prepare('SELECT * FROM bookings WHERE reference=?').get(response.body.reference);
    return { body, response, booking };
  };
  const preview = async (booking, overrides = {}) => {
    const response = await call('admin/offer-preview', { id: booking.id, distanceKm: 30, extensionDays: 0, ...overrides });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(Buffer.from(response.body.pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
    return response;
  };
  return {
    call, login, submit, preview, messages,
    get app() { return app; }, get store() { return app.store; },
    async restart(prices = {}) { await stop(); await boot(prices); },
  };
}

function confirmationState(store, bookingId, previewId) {
  return {
    booking: store.booking(bookingId),
    offer: store.db.prepare('SELECT * FROM email_offers WHERE id=?').get(previewId),
    confirmedOffer: store.get('confirmed_offer_' + bookingId),
    jobs: store.db.prepare('SELECT * FROM outbox ORDER BY id').all(),
  };
}

test('HTTP exposes one box and snapshots current pickup/delivery prices and requested duration', async t => {
  const f = await httpFixture(t);
  const config = await f.call('config');
  assert.equal(config.status, 200);
  for (const [key, value] of Object.entries({ units: 1, baseCents: 24900, pickupCents: 19900, extensionCents: 4900, paymentsEnabled: false })) assert.equal(config.body[key], value);
  for (const delivery of ['pickup', 'delivery']) {
    for (const extensionDays of [0, 1]) {
      const { booking: b, response } = await f.submit({ delivery, extensionDays });
      assert.equal(b.base_cents, delivery === 'pickup' ? 19900 : 24900);
      assert.equal(b.extension_days, extensionDays);
      assert.equal(b.extension_cents, extensionDays * 4900);
      assert.equal(b.end_date, plusDays(DATE, 2 + extensionDays));
      assert.equal(b.total_cents, delivery === 'pickup' ? 19900 + extensionDays * 4900 : null);
      assert.equal(b.unit, null);
      assert.equal(b.status, 'requested');
      assert.equal(response.body.emailQueued, false);
      assert.match(response.body.receiptText, extensionDays ? /48 Stunden/ : /24 Stunden/);
      assert.equal(Buffer.from(response.body.pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
      for (const prefix of ['request-received-', 'request-owner-']) {
        const job = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(prefix + b.id);
        const snapshot = JSON.parse(job.pdf_payload).booking;
        assert.equal(snapshot.base_cents, b.base_cents);
        assert.equal(snapshot.extension_cents, b.extension_cents);
        assert.equal(snapshot.end_date, b.end_date);
        assert.equal(job.sent, null);
      }
    }
  }
  assert.deepEqual(f.store.available(DATE, plusDays(DATE, 3)), [1]);
  assert.equal(f.messages.length, 0);
});

test('HTTP request retries preserve legacy zero-extension fingerprints and old price snapshots', async t => {
  const f = await httpFixture(t, { baseCents: 25000, pickupCents: 25000 });
  const { body, booking } = await f.submit({ delivery: 'pickup' });
  const { requestId, ...orderedData } = body;
  assert.equal(booking.request_fingerprint, hash(JSON.stringify(orderedData)));
  const originalBooking = f.store.booking(booking.id);
  const originalJobs = f.store.db.prepare('SELECT * FROM outbox ORDER BY id').all();
  await f.restart();
  for (const retry of [body, { ...body, extensionDays: 0 }]) {
    const response = await f.call('request', retry);
    assert.equal(response.status, 200);
    assert.equal(response.body.reference, booking.reference);
  }
  assert.equal((await f.call('request', { ...body, extensionDays: 1 })).status, 409);
  assert.deepEqual(f.store.booking(booking.id), originalBooking);
  assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox ORDER BY id').all(), originalJobs);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bookings').get().n, 1);
});

test('HTTP rejects invalid extensions and checks availability through the extra return day', async t => {
  const f = await httpFixture(t);
  const { body, booking } = await f.submit();
  await f.login();
  for (const extensionDays of [-1, 2, 0.5, '1', true]) {
    assert.equal((await f.call('request', { ...body, requestId: randomUUID(), extensionDays })).status, 400);
    assert.equal((await f.call('admin/offer-preview', { id: booking.id, distanceKm: 0, extensionDays })).status, 400);
  }
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bookings').get().n, 1);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM email_offers').get().n, 0);
  f.store.set('calendar_reviewed', true);
  f.store.addBlock(1, plusDays(DATE, 2), plusDays(DATE, 3), 'Rückgabetag belegt');
  assert.equal((await f.call('request', { ...body, requestId: randomUUID(), extensionDays: 1 })).status, 409);
  assert.equal((await f.call('request', { ...body, requestId: randomUUID(), extensionDays: 0 })).status, 200);
  assert.equal((await f.call('admin/offer-preview', { id: booking.id, distanceKm: 0, extensionDays: 1 })).status, 400);
  await f.preview(booking, { distanceKm: 0, extensionDays: 0 });
});

test('HTTP pickup preview requires explicit transport check and never reserves or reprices the request', async t => {
  const f = await httpFixture(t), { booking } = await f.submit({ delivery: 'pickup' });
  const input = { id: booking.id, extensionDays: 1 };
  assert.equal((await f.call('admin/offer-preview', input)).status, 401);
  await f.login();
  assert.equal((await f.call('admin/offer-preview', input, { 'X-CSRF-Token': 'wrong' })).status, 403);
  for (const pickupChecked of [undefined, false, 'true', 1]) assert.equal((await f.call('admin/offer-preview', { ...input, pickupChecked })).status, 400);
  const response = await f.preview(booking, { extensionDays: 1, pickupChecked: true });
  assert.equal(response.body.totalCents, 24800);
  const offer = f.store.db.prepare('SELECT * FROM email_offers WHERE id=?').get(response.body.previewId);
  const payload = JSON.parse(offer.snapshot);
  assert.equal(payload.booking.base_cents, 19900);
  assert.equal(payload.booking.travel_cents, 0);
  assert.equal(payload.booking.extension_cents, 4900);
  assert.equal(payload.booking.end_date, plusDays(DATE, 3));
  assert.match(payload.options.acceptanceText, /reserviert keine Fotobox/);
  assert.deepEqual(f.store.booking(booking.id), booking);
  assert.deepEqual(f.store.available(DATE, plusDays(DATE, 3)), [1]);
});

test('HTTP personal confirmation requires calendar/agreement/pickup checks and queues an unpaid confirmation without SMTP', async t => {
  const f = await httpFixture(t), { booking } = await f.submit({ delivery: 'pickup' });
  await f.login();
  const preview = await f.preview(booking, { extensionDays: 1, pickupChecked: true });
  const body = { previewId: preview.body.previewId, personalAgreement: true, pickupChecked: true };
  const before = confirmationState(f.store, booking.id, body.previewId);
  assert.equal((await f.call('admin/confirm-offer', body, { Cookie: '' })).status, 401);
  assert.equal((await f.call('admin/confirm-offer', body, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await f.call('admin/confirm-offer', body)).status, 400);
  f.store.set('calendar_reviewed', true);
  for (const personalAgreement of [undefined, false, 'true']) assert.equal((await f.call('admin/confirm-offer', { ...body, personalAgreement })).status, 400);
  for (const pickupChecked of [undefined, false, 'true']) assert.equal((await f.call('admin/confirm-offer', { ...body, pickupChecked })).status, 400);
  assert.deepEqual(confirmationState(f.store, booking.id, body.previewId), before);
  const response = await f.call('admin/confirm-offer', body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.emailQueued, false);
  const b = f.store.booking(booking.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.unit, 1);
  assert.equal(b.confirmation_method, 'personal');
  assert.equal(b.total_cents, 24800);
  assert.equal(b.end_date, plusDays(DATE, 3));
  assert.equal(b.terms_version, PRICE_VERSION);
  assert.equal(b.payment_intent, null);
  assert.equal(b.session_id, null);
  assert.equal(f.store.get('confirmed_offer_' + b.id), body.previewId);
  const job = f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('confirmation-' + b.id);
  assert.equal(job.sent, null);
  assert.equal(job.to_address, b.email);
  assert.match(job.body, /keinen Zahlungseingang/);
  const payload = JSON.parse(job.pdf_payload);
  assert.equal(payload.options.paymentConfirmed, false);
  assert.equal(payload.booking.total_cents, 24800);
  assert.equal(payload.booking.extension_cents, 4900);
  assert.equal(payload.booking.end_date, plusDays(DATE, 3));
  const download = await f.call('admin/confirmation-pdf?id=' + b.id);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.equal(download.bytes.subarray(0, 5).toString(), '%PDF-');
  const publicState = await f.call('quote?token=' + f.store.get('booking_access_' + b.id));
  assert.equal(publicState.body.booking.canPay, false);
  assert.equal(publicState.body.booking.extensionDays, 1);
  assert.equal(publicState.body.booking.endDate, plusDays(DATE, 3));
  assert.deepEqual(f.store.available(DATE, plusDays(DATE, 3)), []);
  assert.deepEqual(f.store.available(b.end_date, plusDays(b.end_date, 1)), [1]);
  const after = confirmationState(f.store, b.id, body.previewId);
  assert.equal((await f.call('admin/confirm-offer', body)).status, 200);
  assert.deepEqual(confirmationState(f.store, b.id, body.previewId), after);
  assert.equal(f.messages.length, 0);
});

test('HTTP concurrent confirmations of two offers reserve the sole box exactly once', async t => {
  const f = await httpFixture(t);
  const a = (await f.submit()).booking, b = (await f.submit()).booking;
  await f.login(); f.store.set('calendar_reviewed', true);
  const pa = await f.preview(a, { extensionDays: 1 }), pb = await f.preview(b, { extensionDays: 1 });
  assert.equal(pa.body.totalCents, 34600);
  const responses = await Promise.all([pa, pb].map(p => f.call('admin/confirm-offer', { previewId: p.body.previewId, personalAgreement: true })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const rows = f.store.db.prepare('SELECT * FROM bookings').all();
  const winner = rows.find(r => r.status === 'confirmed'), loser = rows.find(r => r.status === 'requested');
  assert.ok(winner); assert.ok(loser);
  assert.equal(winner.unit, 1);
  assert.equal(winner.total_cents, 34600);
  assert.equal(winner.end_date, plusDays(DATE, 3));
  assert.equal(loser.unit, null);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE 'confirmation-%'").get().n, 1);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM email_offers WHERE status='accepted'").get().n, 1);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM email_offers WHERE status='draft'").get().n, 1);
});

test('HTTP concurrent retries of the same personal confirmation are idempotent', async t => {
  const f = await httpFixture(t), { booking } = await f.submit();
  await f.login(); f.store.set('calendar_reviewed', true);
  const preview = await f.preview(booking);
  const body = { previewId: preview.body.previewId, personalAgreement: true };
  const responses = await Promise.all([f.call('admin/confirm-offer', body), f.call('admin/confirm-offer', body)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(responses[0].body.reference, responses[1].body.reference);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE 'confirmation-%'").get().n, 1);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM bookings WHERE status='confirmed'").get().n, 1);
});

test('HTTP confirmation rechecks added return-day blocks and rolls back every related write', async t => {
  const f = await httpFixture(t), { booking } = await f.submit();
  await f.login(); f.store.set('calendar_reviewed', true);
  const preview = await f.preview(booking, { extensionDays: 1 });
  f.store.addBlock(1, plusDays(DATE, 2), plusDays(DATE, 3), 'Nach Vorschau eingetragen');
  const before = confirmationState(f.store, booking.id, preview.body.previewId);
  const response = await f.call('admin/confirm-offer', { previewId: preview.body.previewId, personalAgreement: true });
  assert.equal(response.status, 409);
  assert.deepEqual(confirmationState(f.store, booking.id, preview.body.previewId), before);
  const basic = await f.preview(booking, { extensionDays: 0 });
  assert.equal((await f.call('admin/confirm-offer', { previewId: basic.body.previewId, personalAgreement: true })).status, 200);
  assert.equal(f.store.booking(booking.id).end_date, plusDays(DATE, 2));
});

test('HTTP rejects expired and inconsistent offer snapshots without partial confirmation', async t => {
  const f = await httpFixture(t), { booking } = await f.submit();
  await f.login(); f.store.set('calendar_reviewed', true);
  for (const mutate of [q => { q.quote_until = Date.now() - 1; }, q => { q.total_cents += 100; }]) {
    const preview = await f.preview(booking);
    const payload = JSON.parse(f.store.db.prepare('SELECT snapshot FROM email_offers WHERE id=?').get(preview.body.previewId).snapshot);
    mutate(payload.booking);
    f.store.db.prepare('UPDATE email_offers SET snapshot=? WHERE id=?').run(JSON.stringify(payload), preview.body.previewId);
    const before = confirmationState(f.store, booking.id, preview.body.previewId);
    assert.equal((await f.call('admin/confirm-offer', { previewId: preview.body.previewId, personalAgreement: true })).status, 400);
    assert.deepEqual(confirmationState(f.store, booking.id, preview.body.previewId), before);
  }
});

test('HTTP outbox insertion failure rolls back confirmed status, accepted offer and idempotency marker', async t => {
  const f = await httpFixture(t), { booking } = await f.submit();
  await f.login(); f.store.set('calendar_reviewed', true);
  const preview = await f.preview(booking);
  const before = confirmationState(f.store, booking.id, preview.body.previewId);
  f.store.db.exec("CREATE TRIGGER fail_confirmation_outbox BEFORE INSERT ON outbox WHEN NEW.id LIKE 'confirmation-%' BEGIN SELECT RAISE(ABORT,'Synthetic outbox failure'); END");
  const body = { previewId: preview.body.previewId, personalAgreement: true };
  assert.equal((await f.call('admin/confirm-offer', body)).status, 400);
  assert.deepEqual(confirmationState(f.store, booking.id, preview.body.previewId), before);
  f.store.db.exec('DROP TRIGGER fail_confirmation_outbox');
  assert.equal((await f.call('admin/confirm-offer', body)).status, 200);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE 'confirmation-%'").get().n, 1);
});

test('HTTP preserves an old 250 EUR offer across catalog restart and confirms its historical exact total', async t => {
  const f = await httpFixture(t, { baseCents: 25000 });
  const { booking } = await f.submit();
  await f.login();
  const preview = await f.preview(booking, { distanceKm: 12.3 });
  const original = f.store.db.prepare('SELECT snapshot FROM email_offers WHERE id=?').get(preview.body.previewId).snapshot;
  // Model a genuine older snapshot: the old versions did not carry these fields.
  const payload = JSON.parse(original);
  for (const key of ['extension_days', 'extension_cents', 'end_date', 'pricing_version', 'confirmation_method']) delete payload.booking[key];
  const historicSnapshot = JSON.stringify(payload);
  f.store.db.prepare('UPDATE email_offers SET snapshot=? WHERE id=?').run(historicSnapshot, preview.body.previewId);
  await f.restart();
  f.store.set('calendar_reviewed', true);
  const response = await f.call('admin/confirm-offer', { previewId: preview.body.previewId, personalAgreement: true });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const b = f.store.booking(booking.id);
  assert.equal(b.base_cents, 25000);
  assert.equal(b.travel_cents, 1200);
  assert.equal(b.total_cents, 26200);
  assert.equal(b.extension_days, 0);
  assert.equal(b.extension_cents, 0);
  assert.equal(b.end_date, plusDays(DATE, 2));
  assert.equal(b.terms_version, '2026-09-05-v3');
  assert.equal(f.store.db.prepare('SELECT snapshot FROM email_offers WHERE id=?').get(preview.body.previewId).snapshot, historicSnapshot);
  assert.equal(JSON.parse(f.store.db.prepare('SELECT pdf_payload FROM outbox WHERE id=?').get('confirmation-' + b.id).pdf_payload).options.paymentConfirmed, false);
});
