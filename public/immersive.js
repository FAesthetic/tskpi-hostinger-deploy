'use strict';
const story=document.querySelector('.product-story');
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const small=window.matchMedia('(max-width: 760px)');
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>v*v*(3-2*v);
function band(p,start,end){return clamp((p-start)/.065)*clamp((end-p)/.065);}
let queued=false;
function cameraAt(p){
 const frames=small.matches
  ?[[0,1,0,0],[.3,1.35,0,-25],[.62,1.55,0,-30],[1,1.25,0,-35]]
  :[[0,1,0,0],[.3,1.5,-22,-27],[.62,1.7,-22,-20],[1,1.25,-22,-39]];
 let end=frames.findIndex(frame=>frame[0]>p);if(end<0)return frames.at(-1).slice(1);if(end===0)return frames[0].slice(1);
 const a=frames[end-1],b=frames[end],t=ease(clamp((p-a[0])/(b[0]-a[0])));
 return a.slice(1).map((value,i)=>value+(b[i+1]-value)*t);
}
function draw(){queued=false;if(reduced.matches){document.querySelectorAll('.story-panel,.story-intro').forEach(el=>el.inert=false);return;}const rect=story.getBoundingClientRect();const p=clamp(-rect.top/(story.offsetHeight-window.innerHeight));const [scale,x,y]=cameraAt(p);story.style.setProperty('--intro-opacity',1-clamp(p/.17));document.querySelector('.story-intro').inert=p>.16;story.style.setProperty('--intro-y',`${-p*150}px`);story.style.setProperty('--product-scale',scale);story.style.setProperty('--product-x',`${x}vw`);story.style.setProperty('--product-y',`${y}vh`);['one','two','three'].forEach((name,i)=>{const opacity=band(p,[.18,.46,.73][i],[.46,.73,1.1][i]);story.style.setProperty(`--${name}-opacity`,opacity);story.style.setProperty(`--${name}-y`,`${(1-opacity)*25}px`);document.querySelector('.panel-'+name).inert=opacity<.8;if(name==='three')document.querySelector('.panel-three').classList.toggle('active',opacity>.8);});document.querySelectorAll('.story-progress i').forEach((el,i)=>el.style.setProperty('--fill',clamp((p-i/3)*3)));}
function requestDraw(){if(!queued){queued=true;requestAnimationFrame(draw);}}
window.addEventListener('scroll',requestDraw,{passive:true});window.addEventListener('resize',requestDraw);reduced.addEventListener('change',requestDraw);draw();
