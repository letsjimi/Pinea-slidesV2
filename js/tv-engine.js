// PINEA TV Engine v3.1 — Matrix + Slideshow with Blobs
import { db, initDB } from './db.js';

let config={}, transCfg={}, layout=null, tvSide=null;
let rowTimers=[], idleTimer=null, ssTimer=null, ssCurrent=-1, ssActive='A';
const blobCache=new Map();
const container=document.getElementById('tvContainer');

export async function initTV(tv) {
  tvSide=tv; await initDB();
  config=await db.config.get('global')||{};
  transCfg=config.transitionSettings||{duration:1200,easing:'ease-in-out'};
  layout=await db.layouts.get(tvSide)||{rows:3,cols:2,timelines:[],step:1,useMatrix:true};
  applyConfig(); render();
  if(config.idleTimeout>0 && !layout.useMatrix) setupIdle();
  window.addEventListener('keydown',e=>{ if(e.key==='d' && e.ctrlKey){ e.preventDefault(); toggleDebug(); }});
}

function applyConfig() {
  const grid=document.getElementById('gridOverlay'); grid?.classList.toggle('visible', config.gridVisible);
  document.documentElement.style.setProperty('--grid-color', config.gridColor||'#ff3366');
  document.documentElement.style.setProperty('--grid-opacity', config.gridOpacity||0.4);
  document.documentElement.style.setProperty('--grid-width', (config.gridWidthPx||1)+'px');
  const gc = config.gridCols || 2;
  const gr = config.gridRows || 2;
  const szX = (100 / gc) + '%';
  const szY = (100 / gr) + '%';
  document.documentElement.style.setProperty('--grid-size', szX + ' ' + szY);
  document.documentElement.style.setProperty('--crop-mode', config.cropMode||'cover');
  document.documentElement.style.setProperty('--label-text', config.labelColor||'#ffffff');
  const label=document.getElementById('groupLabel');
  if(label){ label.classList.remove('position-top','position-bottom');
    label.classList.add(config.groupLabelPos==='top'?'position-top':'position-bottom');
  }
}

function render() {
  clearTimers(); clearBlobCache();
  const existing=container.querySelector('.tv-matrix'); if(existing) existing.remove();
  layout.useMatrix?renderMatrix():renderSlideshow();
}

/* MATRIX */
function renderMatrix() {
  const rows=layout.rows||3, cols=layout.cols||2, timelines=layout.timelines||[], step=layout.step||1, gap=layout.cellGap||0;
  const matrix=document.createElement('div'); matrix.className='tv-matrix';
  matrix.style.gridTemplateRows=`repeat(${rows},1fr)`;
  matrix.style.gridTemplateColumns=`repeat(${cols},1fr)`;
  matrix.style.gap=`${gap}px`;
  for(let r=0;r<rows;r++){
    const ids=timelines[r]||[];
    for(let c=0;c<cols;c++){
      const cell=document.createElement('div'); cell.className='tv-cell';
      const img=document.createElement('img'); img.alt=''; img.loading='eager';
      if(ids.length>0){
        loadSlideImage(ids[c%ids.length]).then(url=>{ if(url) img.src=url; }).catch(()=>{});
      }
      cell.appendChild(img); matrix.appendChild(cell);
    }
    if(ids.length>cols){
      const offset=layout.rowOffsets?.[r]||0;
      startRowStrip(r,ids,cols,step,offset);
    }
  }
  container.appendChild(matrix);
}

function startRowStrip(rowIdx,slideIds,cols,step,delay=0){
  const allCells=container.querySelectorAll('.tv-cell');
  const rowCells=[]; for(let c=0;c<cols;c++) rowCells.push(allCells[rowIdx*cols+c]);
  let offset=0;
  const speed=config.slideshowSpeed||5000, dur=transCfg.duration||1200, transType=config.transitionType||'fade';
  const tick=async()=>{
    offset=(offset+step)%slideIds.length;
    for(let c=0;c<cols;c++){
      const idx=(offset+c)%slideIds.length;
      const nextIdx=(offset+c+step)%slideIds.length;
      const url=await loadSlideImage(slideIds[idx]); preloadSlideImage(slideIds[nextIdx]);
      if(!url) continue;
      const img=rowCells[c].querySelector('img'); if(!img) continue;
      applyTransition(img,url,img.src,transType,dur);
    }
  };
  const initial=setTimeout(()=>{ tick(); rowTimers.push(setInterval(tick,speed)); }, delay);
  rowTimers.push(initial);
}

function applyTransition(img,newUrl,oldSrc,type,dur){
  const ease=transCfg.easing||'ease';
  const cleanup=()=>{ if(oldSrc && oldSrc.startsWith('blob:') && oldSrc!==newUrl) URL.revokeObjectURL(oldSrc); };
  switch(type){
    case 'fade': img.style.transition=`opacity ${dur}ms ${ease}`; img.style.opacity='0'; setTimeout(()=>{cleanup();img.src=newUrl;img.onload=()=>img.style.opacity='1';},dur*.5); break;
    case 'slide': img.style.transition=`transform ${dur}ms ${ease}`; img.style.transform='translateX(-100%)'; setTimeout(()=>{cleanup();img.src=newUrl;img.style.transform='translateX(100%)';requestAnimationFrame(()=>img.style.transform='translateX(0)');},dur); break;
    case 'zoom': img.style.transition=`transform ${dur}ms ${ease}`; img.style.transform='scale(0.8)'; img.style.opacity='0'; setTimeout(()=>{cleanup();img.src=newUrl;requestAnimationFrame(()=>{img.style.transform='scale(1)';img.style.opacity='1';});},dur*.5); break;
    case 'flip': img.style.transition=`transform ${dur}ms ${ease}`; img.style.transform='rotateY(90deg)'; setTimeout(()=>{cleanup();img.src=newUrl;img.style.transform='rotateY(-90deg)';requestAnimationFrame(()=>img.style.transform='rotateY(0deg)');},dur); break;
    case 'wipe': img.style.transition=`clip-path ${dur}ms ${ease}`; img.style.clipPath='inset(0 100% 0 0)'; setTimeout(()=>{cleanup();img.src=newUrl;requestAnimationFrame(()=>img.style.clipPath='inset(0)');},dur*.3); break;
    default: cleanup(); img.src=newUrl;
  }
}

/* SLIDESHOW */
function renderSlideshow() {
  const a=document.getElementById('slideA'), b=document.getElementById('slideB');
  if(!a||!b) return; a.style.display=b.style.display='';
  ssCurrent=-1;
  const f = async()=>{
    const all = await db.slides.where('tvAssignment').anyOf(tvSide,'both').sortBy('sortOrder');
    if(all.length>0){ ssNext(); ssTimer=setInterval(ssNext, config.slideshowSpeed||5000); }
    else document.getElementById('screensaver')?.classList.add('active');
  }; f();
}

function ssNext() {
  db.slides.where('tvAssignment').anyOf(tvSide,'both').sortBy('sortOrder').then(slides=>{
    if(!slides.length) return;
    ssCurrent=(ssCurrent+1)%slides.length;
    const s=slides[ssCurrent];
    const incoming=ssActive==='A'?document.getElementById('slideB'):document.getElementById('slideA');
    const outgoing=ssActive==='A'?document.getElementById('slideA'):document.getElementById('slideB');
    if(!incoming||!outgoing) return;
    const url=getCachedBlobUrl(s.id,s.imageBlob);
    incoming.style.backgroundImage=`url(${url})`;
    const label=document.getElementById('groupLabel');
    if(label && config.showGroupLabel && s.groupName){ label.textContent=s.groupName; label.classList.add('visible'); }
    runSsTransition(incoming,outgoing);
    ssActive=ssActive==='A'?'B':'A';
  });
}

function runSsTransition(incoming,outgoing){
  const type=config.transitionType||'fade', dur=transCfg.duration||1200, ease=transCfg.easing||'ease-in-out';
  switch(type){
    case 'fade': outgoing.classList.remove('active'); incoming.classList.add('active'); break;
    case 'slide': {
      const dir=transCfg.direction||'left';
      const outT=dir==='left'?'translateX(-100%)':dir==='right'?'translateX(100%)':dir==='up'?'translateY(-100%)':'translateY(100%)';
      const inT =dir==='left'?'translateX(100%)':dir==='right'?'translateX(-100%)':dir==='up'?'translateY(100%)':'translateY(-100%)';
      outgoing.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      incoming.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      outgoing.style.transform=outT; outgoing.style.opacity='0';
      incoming.style.transform=inT; incoming.style.opacity='1';
      requestAnimationFrame(()=>incoming.style.transform='translate(0,0)');
      setTimeout(()=>outgoing.classList.remove('active'),dur);
      incoming.classList.add('active'); break;
    }
    case 'zoom':{
      outgoing.classList.remove('active');
      incoming.style.transition=`transform ${dur}ms ${ease}`;
      incoming.style.transform=`scale(${transCfg.zoomScale||1.5})`; incoming.style.opacity='0';
      requestAnimationFrame(()=>{incoming.style.transform='scale(1)';incoming.style.opacity='1';incoming.classList.add('active');}); break;
    }
    case 'flip':{
      const axis=transCfg.flipAxis||'X';
      outgoing.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      incoming.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      outgoing.style.transform=`rotate${axis}(90deg)`; outgoing.style.opacity='0';
      incoming.style.transform=`rotate${axis}(-90deg)`; incoming.style.opacity='0';
      requestAnimationFrame(()=>{incoming.style.transform=`rotate${axis}(0deg)`;incoming.style.opacity='1';incoming.classList.add('active');});
      setTimeout(()=>outgoing.classList.remove('active'),dur); break;
    }
    case 'kenburns':{
      outgoing.classList.remove('active'); incoming.classList.add('active');
      incoming.style.transition=`transform ${config.slideshowSpeed||5000}ms linear`;
      incoming.style.transform=`scale(${transCfg.zoomFrom||1})`;
      const pans=['left','right','up','down'], chosen=transCfg.pan||pans[0];
      const tx=chosen==='left'?'5%':chosen==='right'?'-5%':'0';
      const ty=chosen==='up'?'5%':chosen==='down'?'-5%':'0';
      setTimeout(()=>incoming.style.transform=`scale(${transCfg.zoomTo||1.3}) translate(${tx},${ty})`,50); break;
    }
    default: outgoing.classList.remove('active'); incoming.classList.add('active');
  }
}

/* BLOB CACHE */
async function loadSlideImage(slideId){
  const cached=blobCache.get(slideId);
  if(cached){ cached.lastUsed=Date.now(); return cached.url; }
  try{ const s=await db.slides.get(slideId); if(!s) return null; const url=URL.createObjectURL(s.imageBlob); blobCache.set(slideId,{url,lastUsed:Date.now()}); return url; } catch{ return null; }
}
function preloadSlideImage(slideId){
  if(blobCache.has(slideId)) return;
  db.slides.get(slideId).then(s=>{ if(s){ const url=URL.createObjectURL(s.imageBlob); blobCache.set(slideId,{url,lastUsed:Date.now()}); } }).catch(()=>{});
}
function getCachedBlobUrl(slideId,blob){
  const cached=blobCache.get(slideId); if(cached) return cached.url;
  const url=URL.createObjectURL(blob); blobCache.set(slideId,{url,lastUsed:Date.now()}); return url;
}
function clearBlobCache(){
  blobCache.forEach(({url})=>{ try{ URL.revokeObjectURL(url); }catch{} });
  blobCache.clear();
}

/* UTILS */
function clearTimers(){
  rowTimers.forEach(t=>{ clearInterval(t); clearTimeout(t); }); rowTimers=[];
  if(ssTimer){ clearInterval(ssTimer); ssTimer=null; }
}
function setupIdle(){
  const reset=()=>{
    document.getElementById('screensaver')?.classList.remove('active');
    if(idleTimer) clearTimeout(idleTimer);
    if(config.idleTimeout>0) idleTimer=setTimeout(()=>document.getElementById('screensaver')?.classList.add('active'), config.idleTimeout);
  };
  ['mousemove','click','touchstart'].forEach(e=>window.addEventListener(e,reset)); reset();
}
function toggleDebug(){
  const ov=document.getElementById('debugOverlay'); if(ov) ov.classList.toggle('visible');
}
window.refreshSlides=render;
