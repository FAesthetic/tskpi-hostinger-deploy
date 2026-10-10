import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const code=readFileSync(new URL('../public/analytics.js',import.meta.url),'utf8');
function browserFixture(url='https://fotobox.fobagent.de/?utm_source=meta&utm_medium=paid_social&utm_campaign=Campaign&utm_content=B_Quatschbilder') {
  const sent=[], options=[],listeners={};
  const location=new URL(url);
  const link={href:'https://fotobox.fobagent.de/termin/',getAttribute:()=>'/termin/'};
  const context=vm.createContext({URL,URLSearchParams,Set,Object,JSON,location,fetch:async(url,opts)=>{options.push(opts);sent.push(JSON.parse(opts.body));},document:{querySelector:()=>null,querySelectorAll:()=>[link],addEventListener:(k,fn)=>listeners[k]=fn}});
  for (const key of ['localStorage','sessionStorage','crypto','innerWidth','navigator']) Object.defineProperty(context,key,{get(){throw Error('Forbidden visitor/storage access: '+key);}});
  vm.runInContext(code,context);
  return {context,sent,options,link};
}
test('counts automatically without storage, cookie credentials, visitor identifiers or a popup; campaign follows booking link',()=>{
  const f=browserFixture();assert.equal(f.sent.length,1);assert.equal(f.sent[0].event,'page_view');assert.equal(f.sent[0].source,'meta');assert.equal(f.options[0].credentials,'omit');
  assert.deepEqual(Object.keys(f.sent[0]).sort(),['campaign','mode','content','detail','event','medium','page','source','test'].sort());
  assert.ok(f.link.href.includes('utm_content=B_Quatschbilder'));
  f.context.fotoboxAnalytics.track('form_started','',true);f.context.fotoboxAnalytics.track('form_started','',true);assert.equal(f.sent.length,2);
  const booking=browserFixture(new URL(f.link.href,'https://fotobox.fobagent.de').href);
  assert.equal(booking.context.fotoboxAnalytics.context().content,'B_Quatschbilder');
});
test('legal and protected pages send no event; test traffic is labelled',()=>{
  assert.equal(browserFixture('https://fotobox.fobagent.de/verwaltung/').sent.length,0);
  assert.equal(browserFixture('https://fotobox.fobagent.de/datenschutz/').sent.length,0);
  assert.equal(browserFixture('https://fotobox.fobagent.de/?analytics_test=1').sent[0].test,true);
});
