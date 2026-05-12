// PINEA Admin — Timeline Matrix Editor v3.2
import { db } from './db.js';

let allSlides=[], layoutData={rows:3,cols:2,timelines:[[],[],[]],step:1,cellGap:4,useMatrix:true};
let dragSrc=null, currentTV='left';

export async function initTimelineEditor() {
  console.log('[Timeline] initTimelineEditor() startet...');
  try {
    await refreshTimelineData();
    renderTVSelector(); renderPool(); renderAllRows();
    console.log('[Timeline] initTimelineEditor() fertig. Slides:', allSlides.length);
  } catch(e) {
    console.error('[Timeline] initTimelineEditor() FEHLER:', e);
    toast('Timeline-Editor Fehler: ' + e.message, 'error');
  }
}

async function refreshTimelineData() {
  console.log('[Timeline] refreshTimelineData()...');
  try {
    allSlides = await db.slides.toArray();
    console.log('[Timeline] allSlides geladen:', allSlides.length);
    const saved = await db.layouts.get(currentTV);
    if(saved) {
      layoutData=saved;
      console.log('[Timeline] Layout geladen für', currentTV, ':', layoutData);
    } else {
      layoutData={tvId:currentTV,rows:3,cols:2,timelines:[[],[],[]],step:1,cellGap:4,useMatrix:true};
      await db.layouts.put(layoutData);
      console.log('[Timeline] Default-Layout erstellt für', currentTV);
    }
  } catch(e) {
    console.error('[Timeline] refreshTimelineData() FEHLER:', e);
    throw e;
  }
}

function renderTVSelector() {
  const sel=document.getElementById('timelineTV'); if(!sel) { console.warn('[Timeline] timelineTV nicht gefunden'); return; }
  sel.value=currentTV;
  sel.addEventListener('change',async()=>{currentTV=sel.value; await refreshTimelineData(); renderAllRows(); renderPool();});
}

/* POOL */
function renderPool() {
  const pool=document.getElementById('slidePool'); if(!pool) { console.warn('[Timeline] slidePool nicht gefunden'); return; }
  pool.querySelectorAll('img[data-blob]').forEach(img=>{ if(img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src); });
  console.log('[Timeline] renderPool() — allSlides:', allSlides.length, 'currentTV:', currentTV);

  const tvSlides=allSlides.filter(s=>{
    const hasBlob = s.imageBlob instanceof Blob;
    const tvMatch = s.tvAssignment===currentTV || s.tvAssignment==='both';
    return hasBlob && tvMatch;
  });
  console.log('[Timeline] renderPool() — tvSlides (gefiltert):', tvSlides.length);

  if(!tvSlides.length){
    console.log('[Timeline] Keine Bilder für', currentTV);
    pool.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:20px;color:#555;font-size:14px;">
      🚫 Keine Bilder für diesen TV.<br><br>
      Lösung:<br>
      1. Gehe zum <strong>Slides</strong>-Tab<br>
      2. Erstelle Testbilder oder lade Bilder hoch<br>
      3. Stelle sicher, dass die Bilder TV-Zuweisung haben (🔄 📺 klicken)
    </div>`;
    return;
  }
  pool.innerHTML=tvSlides.map(s=>{
    const url=URL.createObjectURL(s.imageBlob);
    return `<div class="timeline-pool-item" draggable="true" data-slide-id="${s.id}" ondragstart="window.timelineDragStart(event,'${s.id}')">
      <img src="${url}" alt="${s.name}" data-blob="1">
      <div class="pool-overlay">
        <div class="pool-dot" style="background:${s.groupColor||'#555'}"></div>
        <div class="pool-name">${s.name.substring(0,16)}</div>
      </div>
    </div>`;
  }).join('');
  console.log('[Timeline] renderPool() fertig —', tvSlides.length, 'Bilder gerendert');
}

window.timelineDragStart=function(e,slideId){
  console.log('[Timeline] DragStart — slideId:', slideId);
  dragSrc={type:'pool',slideId:+slideId};
  e.dataTransfer.effectAllowed='copy';
  e.dataTransfer.setData('text/plain',JSON.stringify(dragSrc));
};

/* ROWS */
function renderAllRows() {
  const c=document.getElementById('timelineRows'); if(!c) { console.warn('[Timeline] timelineRows nicht gefunden'); return; }
  const {rows,timelines}=layoutData;
  console.log('[Timeline] renderAllRows() — rows:', rows, 'timelines:', timelines);
  if(!rows){ c.innerHTML=`<div style="text-align:center;padding:30px;color:#555;">Reihen > 0 einstellen.</div>`; return; }
  c.innerHTML=Array.from({length:rows},(_,ri)=>{
    const ids=timelines[ri]||[]; const has=ids.length>0;
    const fill=Math.min(100,(ids.length/(layoutData.cols||2))*100);
    return `<div class="timeline-row ${has?'has-content':'empty'}">
      <div class="row-header"><div class="row-info"><span class="row-num">Zeile ${ri+1}</span><span class="row-count">${ids.length} Bilder</span></div>
      <div class="row-fill-bar"><div class="row-fill-track"><div class="row-fill-progress" style="width:${fill}%"></div></div>
      ${has?`<button class="btn btn-ghost" onclick="window.scrollRow(${ri},-1)">◀</button><button class="btn btn-ghost" onclick="window.scrollRow(${ri},1)">▶</button>`:''}
      <button class="btn btn-ghost" onclick="window.clearRow(${ri})" title="Leeren">🗑️</button></div></div>
      <div class="row-strip ${has?'':'row-strip-empty'}" data-row="${ri}" ondragover="window.rowDragOver(event)" ondragleave="window.rowDragLeave(event)" ondrop="window.rowDrop(event,${ri})">
        ${!has?`<div class="row-empty-hint">⬇️ Bilder aus dem Pool hier reinziehen</div>`:ids.map((sid,si)=>renderSlot(ri,si,sid)).join('')}
      </div></div>`;
  }).join('');
  console.log('[Timeline] renderAllRows() fertig');
}

function renderSlot(rowIdx,slotIdx,slideId) {
  const slide=allSlides.find(s=>s.id===slideId); if(!slide) return `<div class="row-slot row-slot-empty" data-row="${rowIdx}" data-slot="${slotIdx}">?</div>`;
  const url=URL.createObjectURL(slide.imageBlob);
  return `<div class="row-slot assigned" draggable="true" data-row="${rowIdx}" data-slot="${slotIdx}" data-slide-id="${slideId}" ondragstart="window.slotDragStart(event,${slideId},${rowIdx},${slotIdx})" ondragover="window.slotDragOver(event)" ondrop="window.slotDrop(event,${rowIdx},${slotIdx})">
    <img src="${url}" alt="${slide.name}" data-blob="1"><div class="slot-overlay"><div class="slot-dot" style="background:${slide.groupColor||'#555'}"></div><div class="slot-name">${slide.name.substring(0,12)}</div></div>
    <button class="slot-del" onclick="window.removeFromRow(${rowIdx},${slotIdx})" title="Entfernen">×</button></div>`;
}

/* DRAG & DROP */
window.rowDragOver=function(e){ e.preventDefault(); e.currentTarget.classList.add('dragover'); e.dataTransfer.dropEffect=dragSrc?.type==='slot'?'move':'copy'; };
window.rowDragLeave=function(e){ e.currentTarget.classList.remove('dragover'); };

window.rowDrop=async function(e,rowIdx){
  e.preventDefault(); e.currentTarget.classList.remove('dragover'); if(!dragSrc) return;
  const timelines=layoutData.timelines.map(t=>[...t]);
  if(dragSrc.type==='pool') timelines[rowIdx]=[...(timelines[rowIdx]||[]), dragSrc.slideId];
  else if(dragSrc.type==='slot'){
    const old=[...(timelines[dragSrc.rowIdx]||[])]; old.splice(dragSrc.slotIdx,1); timelines[dragSrc.rowIdx]=old;
    timelines[rowIdx]=[...(timelines[rowIdx]||[]), dragSrc.slideId];
  }
  layoutData.timelines=timelines; await db.layouts.put(layoutData); renderAllRows(); dragSrc=null; toast('Bild zugewiesen','success');
};

window.slotDragOver=function(e){ e.preventDefault(); e.currentTarget.classList.add('dragover'); };
window.slotDragStart=function(e,slideId,rowIdx,slotIdx){ dragSrc={type:'slot',slideId,rowIdx,slotIdx}; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',JSON.stringify(dragSrc)); };

window.slotDrop=async function(e,rowIdx,slotIdx){
  e.preventDefault(); e.currentTarget.classList.remove('dragover'); if(!dragSrc) return;
  const timelines=layoutData.timelines.map(t=>[...t]);
  if(dragSrc.type==='pool'){ const row=[...(timelines[rowIdx]||[])]; row.splice(slotIdx,0,dragSrc.slideId); timelines[rowIdx]=row;}
  else if(dragSrc.type==='slot'){
    if(dragSrc.rowIdx===rowIdx && dragSrc.slotIdx===slotIdx) return;
    const from=[...(timelines[dragSrc.rowIdx]||[])]; const[moved]=from.splice(dragSrc.slotIdx,1);
    const to=dragSrc.rowIdx===rowIdx?from:[...(timelines[rowIdx]||[])]; to.splice(slotIdx,0,moved);
    timelines[dragSrc.rowIdx]=from; timelines[rowIdx]=to;
  }
  layoutData.timelines=timelines; await db.layouts.put(layoutData); renderAllRows(); dragSrc=null; toast('Reihenfolge aktualisiert','success');
};

window.removeFromRow=async function(rowIdx,slotIdx){
  const t=layoutData.timelines.map(x=>[...x]); t[rowIdx]=[...(t[rowIdx]||[])]; t[rowIdx].splice(slotIdx,1); layoutData.timelines=t;
  await db.layouts.put(layoutData); renderAllRows(); toast('Entfernt','info');
};
window.clearRow=async function(rowIdx){
  if(!confirm('Zeile '+(rowIdx+1)+' leeren?')) return; layoutData.timelines[rowIdx]=[];
  await db.layouts.put(layoutData); renderAllRows(); toast('Zeile geleert','success');
};
window.scrollRow=function(rowIdx,dir){ const s=document.querySelector(`.timeline-row:nth-child(${rowIdx+1}) .row-strip`); if(s) s.scrollBy({left:dir*100,behavior:'smooth'}); };

/* MATRIX SETTINGS */
window.updateMatrixFromSettings=async function(){
  const r=parseInt(document.getElementById('matrixRows')?.value)||3;
  const c=parseInt(document.getElementById('matrixCols')?.value)||2;
  const step=parseInt(document.getElementById('matrixStep')?.value)||1;
  const gap=parseInt(document.getElementById('cellGap')?.value)||4;
  const stagger=parseInt(document.getElementById('rowStagger')?.value)||0;
  const oldR=layoutData.rows||3, oldT=layoutData.timelines||[];
  const newT=Array.from({length:r},(_,ri)=> ri<oldR && oldT[ri]?[...oldT[ri]]:[] );
  const offsets=Array.from({length:r},(_,i)=>i*stagger);
  layoutData={...layoutData,rows:r,cols:c,step,cellGap:gap,timelines:newT,rowOffsets:offsets};
  await db.layouts.put(layoutData); renderAllRows(); toast('Layout aktualisiert','success');
};
