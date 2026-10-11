import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore,today,plusDays} from '../server/core.mjs';
test('new evening offers have no transport-time surcharge and historical offers remain intact',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fotobox-evening-'));const s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});
 const b=s.createRequest({name:'Muster',email:'test@example.invalid',date:plusDays(today(),45),location:'Musterlocation',delivery:'pickup',customerType:'private',message:'Bitte zwei Tage früher übergeben.'});
 assert.equal(b.pricing_version,'2026-10-11-v5');assert.equal(b.extension_cents,0);assert.equal(b.total_cents,19900);
 const q=s.quote(b.id,0,19900,{pickupChecked:true});assert.equal(q.total_cents,19900);assert.equal(q.terms_version,'2026-10-11-v5');
 s.db.prepare("UPDATE bookings SET pricing_version='2026-09-06-v4',terms_version='2026-09-06-v4',extension_days=1,extension_cents=4900,total_cents=24800 WHERE id=?").run(b.id);
 assert.equal(s.booking(b.id).total_cents,24800);assert.match(readFileSync(new URL('../server/terms-v4.txt',import.meta.url),'utf8'),/bis zu 24 Stunden/);
 assert.match(readFileSync(new URL('../server/terms.txt',import.meta.url),'utf8'),/frühere Anlieferung.*kostet nicht extra/);
});
test('main landing page and both request forms offer evenings without an extension control',()=>{
 for(const name of ['index.html','termin/index.html']){const html=readFileSync(new URL('../public/'+name,import.meta.url),'utf8');assert.doesNotMatch(html,/name="extensionDays"|bis zu weitere 24 Stunden|Bis zu 24 Stunden/);assert.match(html,/Für euren Abend/);}
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/<link rel="canonical" href="https:\/\/fotobox.bierlich.cloud\/"/);assert.doesNotMatch(html,/http-equiv="refresh"/);assert.match(html,/Drive-Link schicken wir euch persönlich/);
});
