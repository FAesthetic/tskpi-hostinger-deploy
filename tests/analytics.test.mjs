import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/index.mjs';
import { createAnalytics } from '../server/analytics.mjs';
import { createStore, passwordHash, plusDays, today } from '../server/core.mjs';

const context = () => ({ mode:'aggregate',source:'meta',medium:'paid_social',campaign:'FBX_Hochzeit2026_Lokal_Test14T',content:'B_Quatschbilder' });
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(),'fotobox-analytics-'));
  const store = createStore(dir); let milliseconds = Date.now();
  const analytics = createAnalytics(store.db,{now:()=>milliseconds});
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {store,analytics,advance:n=>milliseconds+=n};
}
const inquiry = () => ({name:'Test only',email:'test@example.invalid',date:plusDays(today(),40),location:'Local test location',delivery:'pickup',customerType:'private'});

test('requires aggregate mode, validates events, stores only daily counters and excludes tests',t=>{
  const {store,analytics} = fixture(t), c=context();
  const event={...c,id:randomUUID(),event:'page_view',page:'/',name:'PRIVATE',email:'PRIVATE@example.com',message:'PRIVATE'};
  assert.equal(analytics.record({...event,mode:'disabled'}),false);
  assert.equal(analytics.record({...event,event:'request_saved'}),false);
  assert.equal(analytics.record({...event,page:'/verwaltung/'}),false);
  assert.equal(analytics.record(event),true);
  analytics.record({...event,id:randomUUID(),test:true});
  const rows=store.db.prepare('SELECT * FROM analytics_counts').all();
  assert.equal(rows.length,2);assert.equal(Object.hasOwn(rows[0],'flow'),false);assert.equal(Object.hasOwn(rows[0],'device'),false);assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);
  assert.equal(analytics.summary().events[0].events,1);
  analytics.record({...c,id:randomUUID(),event:'validation_error',page:'/termin/',detail:'PRIVATE@example.com'});
  assert.equal(analytics.summary().errors[0].detail,'other');
});

test('verified requests are counted once with current booking and mail status; retention preserves bookings',t=>{
  const {store,analytics,advance}=fixture(t),c=context(),b=store.createRequest(inquiry());
  analytics.saved(b,{...c,mode:'disabled'});assert.equal(analytics.summary().requests.length,0);
  analytics.saved(b,c);analytics.saved(b,c);
  let row=analytics.summary().requests[0];assert.equal(row.requests,1);assert.equal(row.confirmed,0);
  store.db.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(b.id);
  store.enqueue(b.email,'Test','Test',null,'request-received-'+b.id);
  row=analytics.summary().requests[0];assert.equal(row.confirmed,1);assert.equal(row.receiptMailsPending,1);
  store.db.prepare('UPDATE outbox SET sent=? WHERE id=?').run(Date.now(),'request-received-'+b.id);
  assert.equal(analytics.summary().requests[0].receiptMailsSent,1);
  advance(91*86400000);assert.equal(analytics.summary(90).events.length,0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM analytics_requests').get().n,0);
  assert.ok(store.booking(b.id));
});

test('public event endpoint enforces origin; report requires owner login; successful request is authoritative',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'fotobox-analytics-api-'));
  const origin='http://localhost',password='Local-analytics-test-password-42';
  const app=createApp({directory:dir,origin,bootstrapHash:passwordHash(password),startWorkers:false});
  const server=http.createServer(app.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.close();rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const call=(url,body,headers={})=>fetch(base+url,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  const c=context(),event={...c,id:randomUUID(),event:'page_view',page:'/'};
  assert.equal((await call('/api/analytics/event',event,{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await call('/api/analytics/event',{...event,mode:'disabled'})).status,400);
  assert.equal((await call('/api/analytics/event',event)).status,200);
  assert.equal((await call('/api/admin/analytics')).status,401);
  const login=await call('/api/admin/login',{password});const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/analytics?days=999',null,{Cookie:cookie})).status,400);
  const request={...inquiry(),requestId:randomUUID(),analytics:c};
  const first=await call('/api/request',request);assert.equal(first.status,200);const saved=await first.json();
  const second=await call('/api/request',request);assert.equal(second.status,200);assert.equal((await second.json()).reference,saved.reference);
  const report=await (await call('/api/admin/analytics?days=7',null,{Cookie:cookie})).json();assert.equal(report.requests[0].requests,1);
  assert.equal(report.events.find(e=>e.event==='request_saved').events,1);
  assert.equal(JSON.stringify(report).includes('test@example.invalid'),false);
  await call('/api/request',{...request,requestId:randomUUID(),email:'wrong'});
  assert.equal(app.analytics.summary().errors.find(e=>e.event==='server_error').events,1);
});
