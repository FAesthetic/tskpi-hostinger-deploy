'use strict';
const story=document.querySelector('.product-story');
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const small=window.matchMedia('(max-width: 760px)');
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>v*v*(3-2*v);
function band(p,start,end){return clamp((p-start)/.065)*clamp((end-p)/.065);}
let queued=false;
function draw(){queued=false;if(reduced.matches)return;const rect=story.getBoundingClientRect();const p=clamp(-rect.top/(story.offsetHeight-window.innerHeight));const transition=ease(clamp((p-.06)/.2));story.style.setProperty('--intro-opacity',1-clamp(p/.17));story.style.setProperty('--intro-y',`${-p*150}px`);story.style.setProperty('--product-scale',small.matches?1+transition*.32:1+transition*.55);story.style.setProperty('--product-x',small.matches?'0vw':`${-transition*19}vw`);story.style.setProperty('--product-y',small.matches?`${-transition*23}vh`:`${-transition*20+Math.sin(p*4)*3}vh`);['one','two','three'].forEach((name,i)=>{const opacity=band(p,[.18,.46,.73][i],[.46,.73,1.1][i]);story.style.setProperty(`--${name}-opacity`,opacity);story.style.setProperty(`--${name}-y`,`${(1-opacity)*25}px`);if(name==='three')document.querySelector('.panel-three').classList.toggle('active',opacity>.8);});document.querySelectorAll('.story-progress i').forEach((el,i)=>el.style.setProperty('--fill',clamp((p-i/3)*3)));}
function requestDraw(){if(!queued){queued=true;requestAnimationFrame(draw);}}
window.addEventListener('scroll',requestDraw,{passive:true});window.addEventListener('resize',requestDraw);reduced.addEventListener('change',requestDraw);draw();
