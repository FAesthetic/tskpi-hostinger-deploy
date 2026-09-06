import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync, chmodSync, openSync, fsyncSync, closeSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const HELD = "'quoted','checkout','processing','confirmed','payment_review','refund_pending'";
export const PRICE_VERSION = '2026-09-06-v4';
export function extensionDays(value = 0) {
 if (value !== 0 && value !== 1) throw Error('Eine Verlängerung ist nur um bis zu weitere 24 Stunden möglich.');
 return value;
}

// Run before schema/data changes. The full SQLite snapshot includes WAL contents.
export function backupBeforeMigration(db, directory, keyPath) {
 if (db.prepare('PRAGMA user_version').get().user_version >= 1) return null;
 if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bookings'").get()) return null;
 const folder = path.join(directory, 'backups', 'before-one-box-' + randomUUID());
 mkdirSync(folder, { recursive: true, mode: 0o700 });
 const file = path.join(folder, 'bookings.sqlite');
 db.prepare('VACUUM INTO ?').run(file);
 chmodSync(file, 0o600);
 const check = new DatabaseSync(file, { readOnly: true });
 try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Die Datensicherung konnte nicht geprüft werden.'); } finally { check.close(); }
 copyFileSync(keyPath, path.join(folder, 'master.key')); chmodSync(path.join(folder, 'master.key'), 0o600);
 for (const name of ['bookings.sqlite', 'master.key']) { const fd = openSync(path.join(folder, name), 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
 return { folder: path.relative(directory, folder), created: Date.now(), verified: true };
}

export function inventoryIssues(db, from) {
 const rows = db.prepare(`SELECT id,reference,event_date AS start,end_date AS end,unit,status FROM bookings WHERE status IN (${HELD}) AND end_date>? UNION ALL SELECT id,'Sperre: '||note,start_date,end_date,unit,'block' FROM blocks WHERE end_date>? ORDER BY start`).all(from, from);
 const issues = [];
 for (let i = 0; i < rows.length; i++) {
  const a = rows[i];
  if (![1,2].includes(a.unit)) issues.push({ type: 'assignment', start: a.start, end: a.end, references: [a.reference], ids: [a.id] });
  for (let j = i + 1; j < rows.length && rows[j].start < a.end; j++) {
   const b = rows[j]; if (b.end <= a.start) continue;
   issues.push({ type: 'overlap', start: a.start > b.start ? a.start : b.start, end: a.end < b.end ? a.end : b.end, references: [a.reference, b.reference], ids: [a.id, b.id] });
  }
 }
 return issues;
}
