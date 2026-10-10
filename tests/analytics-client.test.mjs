import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const code=readFileSync(new URL('../public/analytics.js',import.meta.url),'utf8');
function storage() { const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map}; }
function browserFixture() {
  const nodes=[], sent=[], local=storage(),session=storage(),listeners={};
  function element(tag) { const n={tag,children:[],listeners:{},append(...children){this.children.push(...children);},setAttribute(){},addEventListener(k,fn){this.listeners[k]=fn;},remove(){this.removed=true;}};nodes.push(n);return n; }
  const location=new URL('https://fotobox.fobagent.de/?utm_source=meta&utm_medium=paid_social&utm_campaign=Campaign&utm_content=B_Quatschbilder');
  const link={href:'https://fotobox.fobagent.de/termin/',getAttribute:()=>'/termin/'};
  const context=vm.createContext({URL,URLSearchParams,Date,Set,Object,JSON,crypto:{randomUUID},innerWidth:390,navigator:{},location,localStorage:local,sessionStorage:session,fetch:async(url,opts)=>{sent.push(JSON.parse(opts.body));},document:{createElement:element,querySelector:()=>null,querySelectorAll:()=>[link],body:element('body'),addEventListener:(k,fn)=>listeners[k]=fn}});
  vm.runInContext(code,context);
  return {context,nodes,sent,local,session,link};
}
test('no event or session storage before consent; attribution follows booking link; only approved metadata leaves browser',()=>{
  const f=browserFixture();assert.equal(f.sent.length,0);assert.equal(f.local.map.size,0);assert.equal(f.session.map.size,0);
  assert.ok(f.link.href.includes('utm_content=B_Quatschbilder'));
  f.nodes.find(n=>n.textContent==='Auswertung erlauben').listeners.click();
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].event,'page_view');assert.equal(f.sent[0].source,'meta');assert.equal(f.sent[0].device,'mobil');
  assert.deepEqual(Object.keys(f.sent[0]).sort(),['campaign','consent','content','detail','device','event','flow','id','medium','page','source','test'].sort());
  f.context.fotoboxAnalytics.track('form_started','',true);f.context.fotoboxAnalytics.track('form_started','',true);assert.equal(f.sent.length,2);
  f.nodes.find(n=>n.textContent==='Nur notwendig').listeners.click();
  f.context.fotoboxAnalytics.track('page_view');assert.equal(f.sent.length,2);assert.equal(f.session.map.size,0);assert.equal(f.context.fotoboxAnalytics.context(),null);
});
test('rejecting consent leaves booking usable and sends no measurement',()=>{
  const f=browserFixture();f.nodes.find(n=>n.textContent==='Nur notwendig').listeners.click();
  f.context.fotoboxAnalytics.track('booking_click');assert.equal(f.sent.length,0);assert.equal(f.session.map.size,0);
});
