'use strict';
(() => {
 const root=document.documentElement,key='fotobox-theme',modes=['system','light','dark'];
 const system=matchMedia('(prefers-color-scheme: dark)');
 let preference='system';
 try{const saved=localStorage.getItem(key);if(modes.includes(saved))preference=saved;}catch{}
 const effective=()=>preference==='system'?(system.matches?'dark':'light'):preference;
 function apply(){
  const mode=effective();root.dataset.theme=mode;root.dataset.themePreference=preference;
  document.querySelectorAll('[data-theme-source]').forEach(source=>source.media=mode==='dark'?'all':'not all');
  document.querySelectorAll('[data-theme-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeMode===preference)));
  const label={system:'Systemeinstellung',light:'Hell',dark:'Dunkel'}[preference];
  document.querySelectorAll('.theme-picker summary').forEach(summary=>{summary.setAttribute('aria-label','Darstellung: '+label+'. Farbschema ändern');summary.title='Darstellung: '+label;});
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.content=mode==='dark'?'#11100f':'#f7f1e8');
 }
 function choose(mode){if(!modes.includes(mode))return;preference=mode;try{if(mode==='system')localStorage.removeItem(key);else localStorage.setItem(key,mode);}catch{}apply();document.querySelectorAll('.theme-picker').forEach(picker=>picker.open=false);}
 apply();
 // Apply saved choices as the parser inserts picture sources, before DOMContentLoaded.
 const parserObserver=new MutationObserver(()=>apply());
 parserObserver.observe(root,{childList:true,subtree:true});
 system.addEventListener('change',()=>{if(preference==='system')apply();});
 window.addEventListener('storage',event=>{if(event.key!==key&&event.key!==null)return;preference=modes.includes(event.newValue)?event.newValue:'system';apply();});
 document.addEventListener('DOMContentLoaded',()=>{
  parserObserver.disconnect();
  apply();
  document.querySelectorAll('[data-theme-mode]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.themeMode)));
  document.addEventListener('click',event=>{document.querySelectorAll('.theme-picker[open]').forEach(picker=>{if(!picker.contains(event.target))picker.open=false;});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.theme-picker[open]').forEach(picker=>{picker.open=false;picker.querySelector('summary').focus();});});
 });
})();
