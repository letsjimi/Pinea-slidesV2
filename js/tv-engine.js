// PINEA TV Engine v6.1 — Server Backend Ready
import { db, initDB, DEFAULT_CONFIG } from './db.js';

let config={}, transCfg={}, layout=null, tvSide=null;
let rowTimers=[], idleTimer=null, ssTimer=null, ssCurrent=-1, ssActive='A';
const urlCache=new Map();

export async function initTV(tv) {
  tvSide=tv; await initDB();
  config=await db.config.get('global') || DEFAULT_CONFIG;
  transCfg=config.transitionSettings || {duration:1200, easing:'ease-in-out'};
  layout=await db.layouts.get(tvSide) || {
    rows:3, cols:2, timelines:[[],[],[]],
    rowAnimationModes:['cell','cell','cell'],
    rowSteps:[1,1,1], stripSteps:[1,1,1],
    rowCellGaps:[4,4,4], useMatrix:true, rowOffsets:[0,2000,4000]
  };
  applyConfig(); await render();
  if(config.idleTimeout>0) setupIdle();
  window.addEventListener('keydown', e=>{ if(e.key==='d' && e.ctrlKey){ e.preventDefault(); toggleDebug(); }});
  startPolling();
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
    if(rot===90 || rot===-90){
      const inIframe=window.self!==window.top;
      if(inIframe){
        // Preview iframe: simpler sizing to avoid vw/vh clipping in small frame
        container.style.cssText=`width:100%;height:100%;transform:rotate(${rot}deg);transform-origin:center center;`;
        document.body.classList.add('tv-rotated');
      }else{
        const vw=window.innerWidth, vh=window.innerHeight;
        container.style.cssText=`position:fixed;left:50%;top:50%;width:${vh}px;height:${vw}px;transform:translate(-50%,-50%) rotate(${rot}deg);transform-origin:center center;`;
        document.body.classList.add('tv-rotated');
      }
    }else{
      container.style.cssText='';
      document.body.classList.remove('tv-rotated');
    }
  } else if(container) {
    container.style.cssText='';
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
  clearTimers();
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
  const timelines=layout.timelines||[];
  const container=document.getElementById('tvContainer');
  if(!container) return console.error('[TV] tvContainer nicht gefunden');

  const matrix=document.createElement('div');
  matrix.className='tv-matrix';
  const isMixedModes=(layout.rowAnimationModes||[]).some((m,i,a)=>m!==a[0]);

  if(isMixedModes){
    matrix.style.cssText=`display:flex;flex-direction:column;position:absolute;inset:0;z-index:1;`;
  }else{
    const firstMode=(layout.rowAnimationModes?.[0])||'cell';
    if(firstMode==='strip' || firstMode==='timeline'){
      matrix.style.cssText=`display:flex;flex-direction:column;position:absolute;inset:0;z-index:1;`;
    }else{
      const globalGap=layout.cellGap||4;
      matrix.style.cssText=`display:grid;grid-template-rows:repeat(${rows},1fr);grid-template-columns:repeat(${cols},1fr);gap:${globalGap}px;position:absolute;inset:0;z-index:1;`;
    }
  }

  for(let r=0;r<rows;r++){
    const ids=timelines[r]||[];
    const hasImages=ids.length>0;
    const mode=(layout.rowAnimationModes?.[r])||'cell';
    const isStrip=mode==='strip';
    const isTimeline=mode==='timeline';
    const step=(isStrip||isTimeline?(layout.stripSteps?.[r]):(layout.rowSteps?.[r]))||1;
    const delay=layout.rowOffsets?.[r] || 0;
    const rowGap=(layout.rowCellGaps?.[r])!==undefined ? layout.rowCellGaps[r] : (layout.cellGap||4);

    if(isTimeline){
      renderTimelineRow(matrix, r,ids,cols,step,delay,rowGap);
    }else if(isStrip){
      const rowWrapper=document.createElement('div');
      rowWrapper.className='tv-row';
      rowWrapper.style.cssText=`flex:1;overflow:hidden;position:relative;background:#000;margin-bottom:${(r<rows-1)?rowGap+'px':'0'};`;

      const spans=(layout.timelineSpans?.[r])||[];
      // Build flat displayCells — triple the timeline for seamless looping
      const displayCells=[];
      for(let round=0; round<3; round++){
        for(let i=0; i<ids.length; i++){
          displayCells.push({slideId:ids[i], span:spans[i]||1});
        }
      }

      const strip=document.createElement('div');
      strip.className='tv-strip';
      strip.dataset.row=r;
      strip.style.cssText=`display:flex;height:100%;gap:${rowGap}px;`;

      for(const info of displayCells){
        const wPct=(Math.min(info.span,cols)/cols)*100;
        const cell=document.createElement('div');
        cell.className='tv-strip-cell';
        cell.style.cssText=`flex:0 0 ${wPct}%;height:100%;position:relative;overflow:hidden;box-sizing:border-box;`;
        const img=document.createElement('img');
        img.alt=''; img.loading='eager';
        img.style.cssText='width:100%;height:100%;object-fit:var(--crop-mode,cover);display:block;';
        loadSlideImage(info.slideId).then(url=>{ if(url){ img.src=url; } }).catch(()=>{});
        cell.appendChild(img); strip.appendChild(cell);
      }

      rowWrapper.appendChild(strip);
      matrix.appendChild(rowWrapper);

      if(hasImages){
        const delay=layout.rowOffsets?.[r] || 0;
        startStripAnim(strip, displayCells, cols, step, delay, rowGap);
      }
    }else{
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
            if(url){
              img.src=url;
              const show=()=>img.style.opacity='1';
              img.onload=show; img.onerror=show;
              if(img.complete) show();
            }
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

/* CELL ANIMATION */
function startCellAnim(rowIdx, slideIds, cols, step, delay=0){
  const speed=config.slideshowSpeed||5000;
  const dur=transCfg.duration||1200;
  const transType=config.transitionType||'fade';
  let offset=0;

  const tick=async()=>{
    if(!slideIds.length) return;
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

/* STRIP ANIMATION — scroll by step cells, seamless looping */
function startStripAnim(stripEl, displayCells, cols, step, delay=0, gap=0){
  const speed=config.slideshowSpeed||5000;
  const dur=transCfg.duration||1200;
  const totalCells=displayCells.length;
  const oneRound=totalCells/3;
  if(!oneRound) return;

  let frame=0; // index within one round
  const spans=displayCells.slice(0,oneRound).map(c=>c.span||1);

  function getRoundWidth(){
    const containerW=stripEl.parentElement?.clientWidth||stripEl.clientWidth;
    let w=0;
    spans.forEach((sp,i)=>{
      w+=(Math.min(sp,cols)/cols)*containerW;
      if(i<spans.length-1) w+=(gap||0);
    });
    return w;
  }

  function getOffsetForCellIdx(idx){
    const containerW=stripEl.parentElement?.clientWidth||stripEl.clientWidth;
    let off=0;
    for(let i=0;i<idx;i++){
      off+=(Math.min(spans[i],cols)/cols)*containerW;
      if(i<spans.length-1) off+=(gap||0);
    }
    return off;
  }

  // Start in middle copy (copy 1)
  const roundW=getRoundWidth();
  stripEl.style.transition='none';
  stripEl.style.transform=`translateX(${-roundW}px)`;

  const tick=()=>{
    const containerW=stripEl.parentElement?.clientWidth||stripEl.clientWidth;
    frame=(frame+step)%oneRound;

    const cellOffset=getOffsetForCellIdx(frame);
    const visibleX=roundW+cellOffset; // middle copy + cell offset

    stripEl.style.transition=`transform ${dur}ms ${transCfg.easing||'ease-in-out'}`;
    stripEl.style.transform=`translateX(${-visibleX}px)`;

    // If approaching end of middle copy, snap back to same position in first copy
    const endThreshold=2*roundW - containerW;
    if(visibleX >= endThreshold){
      setTimeout(()=>{
        stripEl.style.transition='none';
        stripEl.style.transform=`translateX(${-(roundW+cellOffset-roundW)}px)`; // = -cellOffset in first copy
        void stripEl.offsetWidth;
        stripEl.style.transition='';
      }, dur);
    }
  };

  const initial=setTimeout(()=>{
    tick();
    const interval=setInterval(tick, speed);
    rowTimers.push(interval);
  }, delay);
  rowTimers.push(initial);
}

/* TIMELINE SCROLL — strip-based, frame-stepped, span-aware */
function renderTimelineRow(matrixEl, r, ids, cols, step, delay, gap){
  const rowWrapper=document.createElement('div');
  rowWrapper.className='tv-row tl-viewport';
  rowWrapper.style.cssText=`flex:1;overflow:hidden;position:relative;background:#000;margin-bottom:${(r<(layout.rows||3)-1)?gap+'px':'0'};`;

  const spans=layout.timelineSpans?.[r]||[];
  // Triple timeline for seamless wrapping
  const displayCells=[];
  for(let round=0; round<3; round++){
    for(let i=0; i<ids.length; i++){
      displayCells.push({slideId:ids[i], span:spans[i]||1});
    }
  }

  const strip=document.createElement('div');
  strip.className='tv-strip tl-strip';
  strip.dataset.row=r;
  strip.style.cssText=`display:flex;height:100%;gap:${gap}px;`;

  for(const info of displayCells){
    const cell=document.createElement('div');
    cell.className='tv-strip-cell';
    const wPct=(Math.min(info.span,cols)/cols)*100;
    cell.style.cssText=`flex:0 0 ${wPct}%;height:100%;position:relative;overflow:hidden;box-sizing:border-box;`;
    const img=document.createElement('img');
    img.alt=''; img.loading='eager';
    img.style.cssText='width:100%;height:100%;object-fit:var(--crop-mode,cover);display:block;';
    loadSlideImage(info.slideId).then(url=>{ if(url){ img.src=url; } }).catch(()=>{});
    cell.appendChild(img); strip.appendChild(cell);
  }

  rowWrapper.appendChild(strip);
  matrixEl.appendChild(rowWrapper);

  if(ids.length>0){
    startTimelineStripAnim(strip, displayCells, cols, step, delay, gap);
  }
}

function startTimelineStripAnim(stripEl, displayCells, cols, step, delay, gap){
  const speed=config.slideshowSpeed||5000;
  const dur=transCfg.duration||1200;
  const totalCells=displayCells.length;
  const oneRound=totalCells/3;
  if(!oneRound) return;

  let frame=0; // index within one round
  const spans=displayCells.slice(0,oneRound).map(c=>c.span||1);

  function getRoundWidth(){
    const containerW=stripEl.parentElement?.clientWidth||stripEl.clientWidth;
    let w=0;
    spans.forEach((sp,i)=>{
      w+=(Math.min(sp,cols)/cols)*containerW;
      if(i<spans.length-1) w+=(gap||0);
    });
    return w;
  }

  function getOffsetForCellIdx(idx){
    const containerW=stripEl.parentElement?.clientWidth||stripEl.clientWidth;
    let off=0;
    for(let i=0;i<idx;i++){
      off+=(Math.min(spans[i],cols)/cols)*containerW;
      if(i<spans.length-1) off+=(gap||0);
    }
    return off;
  }

  // Start in middle copy (copy 1)
  const roundW=getRoundWidth();
  stripEl.style.transition='none';
  stripEl.style.transform=`translateX(${-roundW}px)`;

  const tick=()=>{
    const containerW=stripEl.parentElement?.clientWidth||stripEl.clientWidth;
    frame=(frame+step)%oneRound;

    const cellOffset=getOffsetForCellIdx(frame);
    const visibleX=roundW+cellOffset;

    stripEl.style.transition=`transform ${dur}ms ${transCfg.easing||'ease-in-out'}`;
    stripEl.style.transform=`translateX(${-visibleX}px)`;

    const endThreshold=2*roundW - containerW;
    if(visibleX >= endThreshold){
      setTimeout(()=>{
        stripEl.style.transition='none';
        stripEl.style.transform=`translateX(${-(roundW+cellOffset-roundW)}px)`;
        void stripEl.offsetWidth;
        stripEl.style.transition='';
      }, dur);
    }
  };

  const initial=setTimeout(()=>{
    tick();
    const interval=setInterval(tick, speed);
    rowTimers.push(interval);
  }, delay);
  rowTimers.push(initial);
}

async function runCellTransition(cell, outImg, inImg, type, dur){
  const ease=transCfg.easing||'ease';
  cell.classList.add('tl-trans');
  switch(type){
    case 'fade':{
      outImg.style.transition='none';
      inImg.style.transition=`opacity ${dur}ms ${ease}`;
      inImg.style.opacity='0';
      requestAnimationFrame(()=>{
        outImg.style.opacity='0';
        inImg.style.opacity='1';
      });
      await new Promise(r=>setTimeout(r,dur));
      break;
    }
    case 'slide':{
      const dir=transCfg.direction||'left';
      const axis=(dir==='left'||dir==='right')?'X':'Y';
      const sign=(dir==='left'||dir==='up')?1:-1;
      outImg.style.transition=`transform ${dur}ms ${ease}`;
      inImg.style.transition=`transform ${dur}ms ${ease}`;
      inImg.style.transform=`translate${axis}(${100*sign}%)`;
      requestAnimationFrame(()=>{
        outImg.style.transform=`translate${axis}(${-100*sign}%)`;
        inImg.style.transform='translate(0,0)';
      });
      await new Promise(r=>setTimeout(r,dur));
      break;
    }
    case 'zoom':{
      outImg.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      inImg.style.transition=`transform ${dur}ms ${ease},opacity ${dur}ms ${ease}`;
      inImg.style.transform='scale(0.3)'; inImg.style.opacity='0';
      requestAnimationFrame(()=>{
        outImg.style.transform='scale(1.5)'; outImg.style.opacity='0';
        inImg.style.transform='scale(1)'; inImg.style.opacity='1';
      });
      await new Promise(r=>setTimeout(r,dur));
      break;
    }
    default:{
      inImg.style.opacity='1'; outImg.style.opacity='0';
      break;
    }
  }
  // Swap classes
  inImg.classList.replace('tl-next','tl-active');
  outImg.classList.replace('tl-active','tl-next');
  // Cleanup styles
  outImg.style.transition=''; inImg.style.transition='';
  outImg.style.transform=''; inImg.style.transform='';
  outImg.style.opacity=''; inImg.style.opacity='';
  cell.classList.remove('tl-trans');
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
    const url=getCachedUrl(s);
    if(!url) return;
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
  const cleanup=()=>{}; // Server URLs, keine Revoke nötig

  switch(type){
    case 'fade':{
      img.style.transition=`opacity ${dur}ms ${ease}`;
      img.style.opacity='0';
      setTimeout(()=>{
        cleanup();
        img.src=newUrl;
        const fadeIn=()=>img.style.opacity='1';
        img.onload=fadeIn; img.onerror=fadeIn;
        if(img.complete) fadeIn();
      }, dur*0.5);
      break;
    }
    case 'slide':{
      img.style.transition=`transform ${dur}ms ${ease}`;
      img.style.transform='translateX(-100%)';
      setTimeout(()=>{
        cleanup(); img.src=newUrl;
        img.style.transition='none';
        img.style.transform='translateX(100%)';
        requestAnimationFrame(()=>{
          img.style.transition=`transform ${dur}ms ${ease}`;
          img.style.transform='translateX(0)';
        });
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

/* IMAGE URL RESOLVER (Server Backend v4.1) */
async function loadSlideImage(slideId){
  if(!slideId) return null;
  const cached=urlCache.get(slideId);
  if(cached) return cached;
  try{
    const s=await db.slides.get(slideId);
    if(!s) return null;
    // Prioritize cached server URL, then resolve from filename
    let url=s.imageUrl || null;
    if(!url && s.imageFilename) url='/api/images/'+s.imageFilename;
    if(url) urlCache.set(slideId,url);
    return url;
  }catch(e){ console.error('[TV] loadSlideImage Fehler:', slideId, e); return null; }
}
function preloadSlideImage(slideId){ loadSlideImage(slideId).catch(()=>{}); }
function getCachedUrl(slide){ 
  if(slide.imageUrl) return slide.imageUrl; 
  if(slide.imageFilename) return '/api/images/'+slide.imageFilename; 
  return null; 
}
function clearUrlCache(){ urlCache.clear(); }

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

/* POLLING */
let pollTimer=null, lastKnownModified=0;
function parseInterval(str){
  str=(str||'2m').trim().toLowerCase();
  const m=str.match(/^(\d+(?:\.\d+)?)\s*([smhd])?$/);
  if(!m) return 120000;
  const n=parseFloat(m[1]);
  const u=m[2]||'m';
  const ms={s:1000,m:60000,h:3600000,d:86400000}[u]||60000;
  return Math.max(1000, Math.min(86400000, Math.round(n*ms)));
}
async function startPolling(){
  if(pollTimer){ clearInterval(pollTimer); pollTimer=null; }
  const cfg=await db.config.get('global')||DEFAULT_CONFIG;
  const iv=parseInterval(cfg.refreshInterval);
  lastKnownModified=cfg.lastModified||0;
  console.log('[TV] Polling Intervall:',cfg.refreshInterval,'=',iv,'ms');
  pollTimer=setInterval(async()=>{
    try{
      const r=await fetch(`/api/check-update?since=${lastKnownModified}`);
      if(!r.ok){ console.warn('[TV] check-update HTTP',r.status); return; }
      const j=await r.json();
      if(j.changed){
        lastKnownModified=j.lastModified||Date.now();
        console.log('[TV] Daten geändert → reload');
        window.location.reload();
      }
    }catch(e){ console.error('[TV] poll error:',e); }
  }, iv);
}

window.refreshSlides=render;
