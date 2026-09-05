import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {createStore,priceFor,plusDays,today} from '../server/core.mjs';
const source=new URL(existsSync(new URL('../site/pricing.js',import.meta.url))?'../site/pricing.js':'../public/pricing.js',import.meta.url);
const context={};runInNewContext(readFileSync(source,'utf8'),context);
const cases=[[0,0,0],[9.9,10,0],[10,10,0],[10.01,15,1200],[12,15,1200],[15,15,1200],[15.01,20,2400],[20,20,2400],[23.4,25,3600],[29.9,30,4800],[30,30,4800],[30.1,35,6000],[999.9,1000,237600],[1000,1000,237600]];
test('browser and server charge the same five-km brackets at every boundary',()=>{for(const [distance,billed,travel]of cases){const ui=context.fotoboxPricing.quote(distance),server=priceFor(25000,distance,'delivery');assert.equal(ui.billedDistanceKm,billed,'billed distance '+distance);assert.equal(ui.travelCents,travel,'browser travel '+distance);assert.equal(server.travelCents,travel,'server travel '+distance);assert.equal(ui.totalCents,25000+travel);assert.equal(server.totalCents,ui.totalCents);assert.equal(priceFor(25000,distance,'pickup').travelCents,0);}});
test('browser rejects invalid distances instead of silently rounding them',()=>{for(const v of [-1,1000.01,Infinity,NaN,'12',null])assert.throws(()=>context.fotoboxPricing.quote(v));});
test('new offers retain exact route and rounded billing snapshot, old offers survive migration',t=>{const dir=mkdtempSync(path.join(tmpdir(),'hb-rounding-'));let store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});const data={name:'Test',email:'test@example.invalid',phone:'',date:plusDays(today(),45),location:'Rendsburg Testlocation',delivery:'delivery',customerType:'private',message:''};const b=store.createRequest(data);const q=store.quote(b.id,12.3,25000);assert.equal(q.distance,12.3);assert.equal(q.billed_distance,15);assert.equal(q.travel_cents,1200);assert.equal(q.total_cents,26200);assert.equal(q.terms_version,'2026-09-05-v3');
// Model a previously issued kilometer-exact offer without the new billing column.
store.db.prepare("UPDATE bookings SET distance=12.3,travel_cents=552,total_cents=25552,terms_version='2026-09-05-v1' WHERE id=?").run(b.id);store.db.exec('ALTER TABLE bookings DROP COLUMN billed_distance');store.close();store=createStore(dir);const old=store.booking(b.id);assert.equal(old.billed_distance,null);assert.equal(old.total_cents,25552);assert.equal(old.terms_version,'2026-09-05-v1');const payable=store.startCheckout(b.id);assert.equal(payable.total_cents,25552);assert.equal(payable.terms_version,'2026-09-05-v1');assert.ok(readFileSync(new URL('../server/terms-v1.txt',import.meta.url),'utf8').includes('2026-09-05-v1'));});
