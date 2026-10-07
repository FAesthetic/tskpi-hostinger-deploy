import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/immersive.js',import.meta.url),'utf8');
function fixture({mobile=false,reduced=false}={}){
 const listeners=new Map(),frames=[],media=[];let reads=0,writes=0,top=0;
 const el=()=>({inert:true,style:{setProperty(){writes++;}},classList:{toggle(){}}});
 const intro=el(),panels=[el(),el(),el()],progress=[el(),el(),el()];
 const story={...el(),offsetHeight:3000,getBoundingClientRect(){reads++;return {top};}};
 const context={document:{querySelector:s=>s==='.product-story'?story:s==='.story-intro'?intro:panels[['.panel-one','.panel-two','.panel-three'].indexOf(s)],querySelectorAll:s=>s.includes('story-intro')?[...panels,intro]:progress},window:{innerHeight:800,matchMedia:q=>{const m={matches:q.includes('max-width')?mobile:reduced,addEventListener(_,fn){this.change=fn;}};media.push(m);return m;},addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)},requestAnimationFrame:fn=>frames.push(fn)};
 vm.runInNewContext(source,context);
 return {listeners,panels,media,frames,flush(){while(frames.length)frames.shift()();},get reads(){return reads;},get writes(){return writes;},move(v){top=v;}};
}
test('mobile and reduced motion have no scroll handler or animation work and leave every panel interactive',()=>{
 for(const options of [{mobile:true},{reduced:true},{mobile:true,reduced:true}]){const f=fixture(options);assert.equal(f.listeners.has('scroll'),false);f.listeners.get('resize')();f.flush();assert.equal(f.reads,0);assert.equal(f.writes,0);assert.ok(f.panels.every(p=>!p.inert));}
});
test('desktop coalesces scroll frames and stops writes beyond the story',()=>{
 const f=fixture();f.flush();f.move(-9000);for(let i=0;i<100;i++)f.listeners.get('scroll')();assert.equal(f.frames.length,1);f.flush();const count=f.writes;f.listeners.get('scroll')();f.flush();assert.equal(f.writes,count);
});
test('switching from desktop to mobile cancels pending animation work and restores interaction',()=>{
 const f=fixture();f.flush();f.move(-800);f.listeners.get('scroll')();const reads=f.reads;f.media[1].matches=true;f.media[1].change();f.flush();assert.equal(f.reads,reads);assert.equal(f.listeners.has('scroll'),false);assert.ok(f.panels.every(p=>!p.inert));f.media[1].matches=false;f.media[1].change();f.flush();assert.ok(f.listeners.has('scroll'));
});
