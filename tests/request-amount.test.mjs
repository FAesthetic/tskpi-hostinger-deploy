import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createStore,passwordHash,plusDays,today} from '../server/core.mjs';
import {createApp} from '../server/index.mjs';
const data=()=>({name:'Test',email:'test@example.invalid',date:plusDays(today(),45),location:'Testlocation in Rendsburg',delivery:'delivery',customerType:'private'});
test('Owner request amount persists, rejects invalid/conflicting edits and never rewrites financial fields or offer snapshots',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fotobox-request-amount-'));let store=createStore(dir);
 try{const b=store.createRequest(data()),before=store.booking(b.id);store.db.prepare('INSERT INTO email_offers VALUES(?,?,?,?,?)').run('offer',b.id,'{"preserved":true}',Date.now(),'draft');
 assert.equal(store.setRequestAmount(b.id,27500,null).request_amount_cents,27500);
 assert.deepEqual({...store.booking(b.id),request_amount_cents:null},{...before});
 for(const value of [-1,1.5,'27500',undefined,Infinity,1000000001])assert.throws(()=>store.setRequestAmount(b.id,value,27500));
 assert.throws(()=>store.setRequestAmount(b.id,20000,null),e=>e.status===409);assert.equal(store.booking(b.id).request_amount_cents,27500);
 store.close();store=createStore(dir);assert.equal(store.booking(b.id).request_amount_cents,27500);assert.equal(store.setRequestAmount(b.id,0,27500).request_amount_cents,0);assert.equal(store.setRequestAmount(b.id,null,0).request_amount_cents,null);
 for(const status of ['quoted','confirmed','checkout','processing','payment_review','cancelled','refunded']){store.db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,b.id);assert.throws(()=>store.setRequestAmount(b.id,10000,null));}
 assert.equal(store.db.prepare('SELECT snapshot FROM email_offers').get().snapshot,'{"preserved":true}');assert.equal(store.db.prepare('SELECT count(*) AS n FROM outbox').get().n,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('Adding the request field backs up an existing version-one database and its key before migration, preserving all records',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fotobox-amount-migration-'));let store=createStore(dir);
 try{const b=store.createRequest(data());store.set('preserved','PRIVATE SETTING');store.db.exec('ALTER TABLE bookings DROP COLUMN request_amount_cents');const before=store.booking(b.id),key=readFileSync(join(dir,'master.key'));store.close();store=createStore(dir);assert.deepEqual({...store.booking(b.id),request_amount_cents:undefined},{...before,request_amount_cents:undefined});assert.equal(store.get('preserved'),'PRIVATE SETTING');
 const folders=readdirSync(join(dir,'backups')).filter(x=>x.startsWith('before-request-amount-'));assert.equal(folders.length,1);const folder=join(dir,'backups',folders[0]);assert.deepEqual(readFileSync(join(folder,'master.key')),key);const backup=new DatabaseSync(join(folder,'bookings.sqlite'),{readOnly:true});try{assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(backup.prepare('SELECT id FROM bookings').get().id,b.id);assert.ok(!backup.prepare('PRAGMA table_info(bookings)').all().some(x=>x.name==='request_amount_cents'));}finally{backup.close();}
 store.close();store=createStore(dir);assert.equal(readdirSync(join(dir,'backups')).filter(x=>x.startsWith('before-request-amount-')).length,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('Request amount API requires existing admin session, origin and CSRF; only the internal request value changes with no external calls',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'fotobox-amount-api-')),origin='http://localhost',password='local-test-password-12345';const app=createApp({directory:dir,origin,bootstrapHash:passwordHash(password),startWorkers:false,stripeFactory:()=>{throw Error('No payment calls');},transportFactory:()=>{throw Error('No mail calls');}}),server=http.createServer(app.handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));app.close();rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,b=app.store.createRequest(data());let cookie='',csrf='';
 const post=(route,body,headers={})=>fetch(base+'/api/admin/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,...headers},body:JSON.stringify(body)});
 const input={id:b.id,amountCents:27500,expectedAmountCents:null};assert.equal((await post('request-amount',input)).status,401);const login=await post('login',{password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 assert.equal((await post('request-amount',input,{Origin:'https://evil.invalid'})).status,403);assert.equal((await post('request-amount',input,{'X-CSRF-Token':'bad'})).status,403);
 const before=app.store.booking(b.id);assert.equal((await post('request-amount',input)).status,200);assert.deepEqual({...app.store.booking(b.id),request_amount_cents:null},{...before});assert.equal((await post('request-amount',input)).status,409);assert.equal((await post('request-amount',{...input,amountCents:1.5,expectedAmountCents:27500})).status,400);assert.equal((await post('request-amount',{...input,totalCents:1})).status,400);
 assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM outbox').get().n,0);assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM email_offers').get().n,0);
});
