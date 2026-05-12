// PINEA TV Engine v3.8 — Matrix + Slideshow mit automatischer Animation
import { db, initDB, DEFAULT_CONFIG } from './db.js';

let config={}, transCfg={}, layout=null, tvSide=null;
let rowTimers=[], idleTimer=null, ssTimer=null, ssCurrent=-1, ssActive='A';
const blobCache=new Map();

export async function initTV(tv) {
  tvSide=tv; await initDB();
  config=await db.config.get('global') || DEFAULT_CONFIG;
  transCfg=config.transitionSettings || {duration:1200, easing:'ease-in-out'};
  layout=await db.layouts.get(tvSide) || {rows:3, cols:2, timelines:[[],[],[]], step:1, cellGap:4, useMatrix:true, rowOffsets:[0,2000,4000]};
  applyConfig(); await render();
  if(config.idleTimeout>0) setupIdle();
  window.addEventListener('keydown', e=>{ if(e.key==='d' && e.ctrlKey){ e.preventDefault(); toggleDebug(); }});
}

function applyConfig() {
  const grid=document.getElementById('gridOverlay');
  if(grid) grid.classList.toggle('visible', !!config.gridVisible);
  document.documentElement.style.setProperty('--grid-color', config.gridColor||'#ff3366');
  document.documentElement.style.setProperty('--grid-opacity', config.gridOpacity||0.4);
  document.documentElement.style.setProperty('--grid-width', (config.gridWidthPx||1)+'px');
  // TV-Rotation
  const container=document.getElementById('tvContainer');
  if(container && layout.rotation){
    const rot=layout.rotation;
    container.style.transform=`rotate(${rot}deg)`;
    if(rot===90 || rot===-90){
      container.style.width='100vh'; container.style.height='100vw';
      container.style.left='50%'; container.style.top='50%';
      container.style.transform=`rotate(${rot}deg) translate(-50%,-50%)`;
      container.style.transformOrigin='center center';
      document.body.classList.add('tv-rotated');
    }else{
      container.style.width=''; container.style.height='';
      container.style.left=''; container.style.top='';
      container.style.transformOrigin='';
      document.body.classList.remove('tv-rotated');
    }
  } else if(container) {
    document.body.classList.remove('tv-rotated');
  }
  const gc=config.gridCols||2, gr=config.gridRows||2;
  document.documentElement.style.setProperty('--grid-size', (100/gc)+'% '+(100/gr)+'%');
  document.documentElement.style.setProperty('--crop-mode', config.cropMode||'cover');
  document.documentElement.style.setProperty('--label-text', config.labelColor||'#ffffff');
  const label=document.getElementById('groupLabel');
  if(label){
    label.classList.remove('position-top','position-bottom');
    label.classList.add(config.groupLabelPos==='top'?'position-top':'position-bottom');
  }
}

async function render() {
  clearTimers(); clearBlobCache();
  removeMatrix();
  const totalSlides=(layout.timelines||[]).flat().filter(Boolean).length;
  if(totalSlides===0){
    showScreensaver(true);
    return;
  }
  showScreensaver(false);
  if(layout.useMatrix!==false) renderMatrix();
  else renderSlideshow();
}

function removeMatrix(){
  document.querySelectorAll('.tv-matrix').forEach(el=>el.remove());
}

function showScreensaver(show){
  const ss=document.getElementById('screensaver');
  if(ss) ss.classList.toggle('active', show);
  const label=document.getElementById('groupLabel');
  if(label && show) label.classList.remove('visible');
}

/* MATRIX */
function renderMatrix() {
  const rows=layout.rows||3, cols=layout.cols||2;
  const timelines=layout.timelines||[], step=layout.step||1, gap=layout.cellGap||0;
  const isStrip=layout.rowAnimationMode==='strip';
  const container=document.getElementById('tvContainer');
  if(!container) return console.error('[TV] tvContainer nicht gefunden');

  const matrix=document.createElement('div');
  matrix.className='tv-matrix';

  if(isStrip){
    matrix.style.cssText=`display:flex;flex-direction:column;gap:${gap}px;position:absolute;inset:0;z-index:1;`;
  }else{
    matrix.style.cssText=`display:grid;grid-template-rows:repeat(${rows},1fr);grid-template-columns:repeat(${cols},1fr);gap:${gap}px;position:absolute;inset:0;z-index:1;`;
  }

  for(let r=0;r<rows;r++){
    const ids=timelines[r]||[];
    const hasImages=ids.length>0;

    if(isStrip){
      // Strip-Modus: jede Zeile ist ein overflow:hidden Container mit horizontalem Streifen
      const rowWrapper=document.createElement('div');
      rowWrapper.className='tv-row';
      rowWrapper.style.cssText=`flex:1;overflow:hidden;position:relative;background:#000;`;

      const strip=document.createElement('div');
      strip.className='tv-strip';
      strip.dataset.row=r;
      strip.style.cssText=`display:flex;height:100%;`;
      // Dupliziere Timeline 3x für nahtlosen Ringpuffer-Loop
      const displayIds=[...ids,...ids,...ids];

      for(let i=0;i<displayIds.length;i++){
        const slideId=displayIds[i];
        const cell=document.createElement('div');
        cell.className='tv-strip-cell';
        cell.style.cssText=`width:calc(100%/${cols});height:100%;flex-shrink:0;position:relative;overflow:hidden;`;
        const img=document.createElement('img');
        img.alt=''; img.loading='eager';
        img.style.cssText='width:100%;height:100%;object-fit:var(--crop-mode,cover);display:block;';
        loadSlideImage(slideId).then(url=>{
          if(url){ img.src=url; }
        }).catch(()=>{});
        cell.appendChild(img); strip.appendChild(cell);
      }

      rowWrapper.appendChild(strip);
      matrix.appendChild(rowWrapper);

      if(hasImages){
        const delay=layout.rowOffsets?.[r] || 0;
        startStripAnim(strip, ids, cols, step, delay);
      }
    }else{
      // Cell-Modus: Grid-Zellen
      for(let c=0;c<cols;c++){
        const cell=document.createElement('div');
        cell.className='tv-cell';
        cell.dataset.row=r; cell.dataset.col=c;
        cell.style.cssText='position:relative;background:#000;overflow:hidden;';
        const img=document.createElement('img');
        img.alt=''; img.loading='eager';
        img.style.cssText='width:100%;height:100%;object-fit:var(--crop-mode,cover);display:block;transition:opacity 0.5s ease;opacity:0;';
        if(hasImages){
          const slideId=ids[c%ids.length];
          loadSlideImage(slideId).then(url=>{
            if(url){ img.src=url; img.onload=()=>img.style.opacity='1'; }
          }).catch(()=>{});
        }
        cell.appendChild(img); matrix.appendChild(cell);
      }

      if(hasImages){
        const delay=layout.rowOffsets?.[r] || 0;
        startCellAnim(r, ids, cols, step, delay);
      }
    }
  }
  container.appendChild(matrix);
}

/* CELL ANIMATION — Zellen-Modus: jede Zelle wechselt individuell (Stagger) */
function startCellAnim(rowIdx, slideIds, cols, step, delay=0){
  const speed=config.slideshowSpeed||5000;
  const dur=transCfg.duration||1200;
  const transType=config.transitionType||'fade';
  let offset=0;

  const tick=async()=>{
    if(!slideIds.length) return;
    // Voller Ringpuffer: offset läuft modulo slideIds.length
    offset=(offset+step)%slideIds.length;
    const matrix=document.querySelector('.tv-matrix'); if(!matrix) return;
    const allCells=matrix.querySelectorAll('.tv-cell');
    const rowCells=[];
    for(let c=0;c<cols;c++) rowCells.push(allCells[rowIdx*cols+c]);

    for(let c=0;c<cols;c++){
      const idx=(offset+c)%slideIds.length;
      const url=await loadSlideImage(slideIds[idx]);
      if(!url) continue;
      const img=rowCells[c]?.querySelector('img');
      if(!img) continue;
      applyTransition(img, url, img.src, transType, dur);
    }
  };

  const initial=setTimeout(()=>{
    tick();
    const interval=setInterval(tick, speed);
    rowTimers.push(interval);
  }, delay);
  rowTimers.push(initial);
}

/* STRIP ANIMATION — Streifen-Modus: ganze Zeile scrollt horizontal */
function startStripAnim(stripEl, slideIds, cols, step, delay=0){
  const speed=config.slideshowSpeed||5000;
  const dur=transCfg.duration||1200;
  const total=slideIds.length;
  if(!total) return;

  const cellWidthPct=100/cols;
  let offset=0;

  const tick=()=>{
    const rawNext=offset+step;
    const nextOffset=rawNext%total;
    const isWrapping=rawNext>=total;

    const targetX=-rawNext*cellWidthPct;

    stripEl.style.transition=`transform ${dur}ms ${transCfg.easing||'ease-in-out'}`;
    stripEl.style.transform=`translateX(${targetX}%)`;

    if(isWrapping){
      setTimeout(()=>{
        stripEl.style.transition='none';
        stripEl.style.transform=`translateX(${-nextOffset*cellWidthPct}%)`;
        requestAnimationFrame(()=>{
          stripEl.style.transition='';
        });
      }, dur);
    }

    offset=nextOffset;
  };

  const initial=setTimeout(()=>{
    tick();
    const interval=setInterval(tick, speed);
    rowTimers.push(interval);
  }, delay);
  rowTimers.push(initial);
}

/* SLIDESHOW */
function renderSlideshow() {
  const a=document.getElementById('slideA'), b=document.getElementById('slideB');
  if(!a||!b){ console.error('[TV] slideA/B nicht gefunden'); return; }
  ssCurrent=-1;
  const f=async()=>{
    try{
      const all=await db.slides.where('tvAssignment').anyOf(tvSide,'both').sortBy('sortOrder');
      if(all.length>0){
        showScreensaver(false);
        ssNext(); 
        ssTimer=setInterval(ssNext, config.slideshowSpeed||5000);
      } else {
        showScreensaver(true);
      }
    }catch(e){
      console.error('[TV] Slideshow Fehler:', e);
      showScreensaver(true);
    }
  };
  f();
}

function ssNext() {
  db.slides.where('tvAssignment').anyOf(tvSide,'both').sortBy('sortOrder').then(slides=>{
    if(!slides.length){ showScreensaver(true); return; }
    showScreensaver(false);
    ssCurrent=(ssCurrent+1)%slides.length;
    const s=slides[ssCurrent];
    const incoming=ssActive==='A'?document.getElementById('slideB'):document.getElementById('slideA');
    const outgoing=ssActive==='A'?document.getElementById('slideA'):document.getElementById('slideB');
    if(!incoming||!outgoing) return;
    const url=getCachedBlobUrl(s.id, s.imageBlob);
    incoming.style.backgroundImage=`url(${url})`;
    const label=document.getElementById('groupLabel');
    if(label && config.showGroupLabel && s.groupName){
      label.textContent=s.groupName; label.classList.add('visible');
    }
    runSsTransition(incoming, outgoing);
    ssActive=ssActive==='A'?'B':'A';
  }).catch(e=>{ console.error('[TV] ssNext Fehler:', e); showScreensaver(true); });
}

function runSsTransition(incoming, outgoing){
  const type=config.transitionType||'fade';
  const dur=transCfg.duration||1200;
  const ease=transCfg.easing||'ease-in-out';
  switch(type){
    case 'fade':
      outgoing.classList.remove('active');
      incoming.classList.add('active');
      break;
    case 'slide':{
      const dir=transCfg.direction||'left';
      const outT=dir==='left'?'translateX(-100%)':dir==='right'?'translateX(100%)':dir==='up'?'translateY(-100%)':'translateY(100%)';
      const inT =dir==='left'?'translateX(100%)':dir==='right'?'translateX(-100%)':dir==='up'?'translateY(100%)':'translateY(-100%)';
      outgoing.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      incoming.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      outgoing.style.transform=outT; outgoing.style.opacity='0';
      incoming.style.transform=inT; incoming.style.opacity='1';
      requestAnimationFrame(()=>incoming.style.transform='translate(0,0)');
      setTimeout(()=>outgoing.classList.remove('active'), dur);
      incoming.classList.add('active');
      break;
    }
    case 'zoom':{
      outgoing.classList.remove('active');
      incoming.style.transition=`transform ${dur}ms ${ease}`;
      incoming.style.transform=`scale(${transCfg.zoomScale||1.5})`;
      incoming.style.opacity='0';
      requestAnimationFrame(()=>{
        incoming.style.transform='scale(1)'; incoming.style.opacity='1';
        incoming.classList.add('active');
      });
      break;
    }
    case 'flip':{
      const axis=transCfg.flipAxis||'X';
      outgoing.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      incoming.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      outgoing.style.transform=`rotate${axis}(90deg)`; outgoing.style.opacity='0';
      incoming.style.transform=`rotate${axis}(-90deg)`; incoming.style.opacity='0';
      requestAnimationFrame(()=>{
        incoming.style.transform=`rotate${axis}(0deg)`; incoming.style.opacity='1';
        incoming.classList.add('active');
      });
      setTimeout(()=>outgoing.classList.remove('active'), dur);
      break;
    }
    case 'wipe':{
      incoming.style.transition=`clip-path ${dur}ms ${ease}`;
      incoming.style.clipPath='inset(0 100% 0 0)';
      incoming.style.opacity='1';
      incoming.classList.add('active');
      requestAnimationFrame(()=>incoming.style.clipPath='inset(0)');
      setTimeout(()=>outgoing.classList.remove('active'), dur);
      break;
    }
    case 'kenburns':{
      outgoing.classList.remove('active'); incoming.classList.add('active');
      const kbDur=config.slideshowSpeed||5000;
      incoming.style.transition=`transform ${kbDur}ms linear`;
      incoming.style.transform='scale(1)';
      setTimeout(()=>incoming.style.transform='scale(1.15) translate(2%,-2%)', 50);
      break;
    }
    default:
      outgoing.classList.remove('active'); incoming.classList.add('active');
  }
}

function applyTransition(img, newUrl, oldSrc, type, dur){
  const ease=transCfg.easing||'ease';
  const cleanup=()=>{ if(oldSrc && oldSrc.startsWith('blob:') && oldSrc!==newUrl) URL.revokeObjectURL(oldSrc); };

  switch(type){
    case 'fade':{
      img.style.transition=`opacity ${dur}ms ${ease}`;
      img.style.opacity='0';
      setTimeout(()=>{
        cleanup();
        img.src=newUrl;
        img.onload=()=>img.style.opacity='1';
      }, dur*0.5);
      break;
    }
    case 'slide':{
      img.style.transition=`transform ${dur}ms ${ease}`;
      img.style.transform='translateX(-100%)';
      setTimeout(()=>{
        cleanup(); img.src=newUrl;
        img.style.transform='translateX(100%)';
        requestAnimationFrame(()=>img.style.transform='translateX(0)');
      }, dur);
      break;
    }
    case 'zoom':{
      img.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      img.style.transform='scale(0.5)'; img.style.opacity='0';
      setTimeout(()=>{
        cleanup(); img.src=newUrl;
        requestAnimationFrame(()=>{img.style.transform='scale(1)'; img.style.opacity='1';});
      }, dur*0.5);
      break;
    }
    case 'flip':{
      const axis=transCfg.flipAxis||'Y';
      img.style.transition=`transform ${dur}ms ${ease}`;
      img.style.transform=`rotate${axis}(90deg)`;
      setTimeout(()=>{
        cleanup(); img.src=newUrl;
        img.style.transform=`rotate${axis}(-90deg)`;
        requestAnimationFrame(()=>img.style.transform=`rotate${axis}(0deg)`);
      }, dur);
      break;
    }
    case 'wipe':{
      img.style.transition=`clip-path ${dur}ms ${ease}`;
      img.style.clipPath='inset(0 100% 0 0)';
      setTimeout(()=>{
        cleanup(); img.src=newUrl;
        img.style.clipPath='inset(0 0 100% 0)';
        requestAnimationFrame(()=>img.style.clipPath='inset(0)');
      }, dur*0.3);
      break;
    }
    default:{
      cleanup(); img.src=newUrl;
    }
  }
}

/* BLOB CACHE */
async function loadSlideImage(slideId){
  if(!slideId) return null;
  const cached=blobCache.get(slideId);
  if(cached){ cached.lastUsed=Date.now(); return cached.url; }
  try{
    const s=await db.slides.get(slideId);
    if(!s||!s.imageBlob) return null;
    const url=URL.createObjectURL(s.imageBlob);
    blobCache.set(slideId,{url,lastUsed:Date.now()});
    return url;
  }catch(e){ console.error('[TV] loadSlideImage Fehler:', slideId, e); return null; }
}

function preloadSlideImage(slideId){
  if(blobCache.has(slideId)) return;
  db.slides.get(slideId).then(s=>{
    if(s?.imageBlob){
      const url=URL.createObjectURL(s.imageBlob);
      blobCache.set(slideId,{url,lastUsed:Date.now()});
    }
  }).catch(()=>{});
}

function getCachedBlobUrl(slideId,blob){
  const cached=blobCache.get(slideId);
  if(cached) return cached.url;
  const url=URL.createObjectURL(blob);
  blobCache.set(slideId,{url,lastUsed:Date.now()});
  return url;
}

function clearBlobCache(){
  blobCache.forEach(({url})=>{ try{ URL.revokeObjectURL(url); }catch{} });
  blobCache.clear();
}

/* UTILS */
function clearTimers(){
  rowTimers.forEach(t=>{ clearInterval(t); clearTimeout(t); });
  rowTimers=[];
  if(ssTimer){ clearInterval(ssTimer); ssTimer=null; }
}

function setupIdle(){
  const reset=()=>{
    document.getElementById('screensaver')?.classList.remove('active');
    if(idleTimer) clearTimeout(idleTimer);
    if(config.idleTimeout>0) idleTimer=setTimeout(()=>document.getElementById('screensaver')?.classList.add('active'), config.idleTimeout);
  };
  ['mousemove','click','touchstart'].forEach(e=>window.addEventListener(e,reset));
  reset();
}

function toggleDebug(){
  const ov=document.getElementById('debugOverlay');
  if(ov) ov.classList.toggle('visible');
}

window.refreshSlides=render;
