// PINEA Admin — Timeline Matrix Editor v4.1 (Server Backend)
import { db } from './db.js';

function getSlideUrl(s){
  if(s.imageUrl) return s.imageUrl;
  if(s.imageFilename) return '/api/images/'+s.imageFilename;
  return '';
}
function hasImage(s){ return !!(s.imageUrl || s.imageFilename); }

let allSlides=[], layoutData={rows:3,cols:2,timelines:[[],[],[]],rowAnimationModes:['cell','cell','cell'],rowSteps:[1,1,1],stripSteps:[1,1,1],cellGap:4,useMatrix:true};
let dragSrc=null, currentTV='left';
let poolSelection = new Set(); // Mehrfachauswahl im Pool
let activeGroupFilter = null;  // Gruppenfilter im Pool
let poolZoomScale = parseFloat(localStorage.getItem('timelinePoolZoom')) || 1.0;

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
      const rows=layoutData.rows||3;
      // Ensure arrays exist and match row count
      if(!layoutData.rowAnimationModes||!Array.isArray(layoutData.rowAnimationModes)){
        const oldMode=layoutData.rowAnimationMode||'cell';
        layoutData.rowAnimationModes=Array.from({length:rows},()=>oldMode);
      }
      if(!layoutData.rowSteps||!Array.isArray(layoutData.rowSteps)){
        const oldStep=layoutData.step||1;
        layoutData.rowSteps=Array.from({length:rows},()=>oldStep);
      }
      if(!layoutData.stripSteps||!Array.isArray(layoutData.stripSteps)){
        layoutData.stripSteps=Array.from({length:rows},()=>1);
      }
      if(!layoutData.rowCellGaps||!Array.isArray(layoutData.rowCellGaps)){
        const oldGap=layoutData.cellGap||4;
        layoutData.rowCellGaps=Array.from({length:rows},()=>oldGap);
      }
      if(!layoutData.rowOffsets||!Array.isArray(layoutData.rowOffsets)){
        layoutData.rowOffsets=Array.from({length:rows},(_,i)=>i*2000);
      }
      // Resize arrays to match current row count
      while(layoutData.rowAnimationModes.length<rows) layoutData.rowAnimationModes.push(layoutData.rowAnimationModes[0]||'cell');
      while(layoutData.rowSteps.length<rows) layoutData.rowSteps.push(layoutData.rowSteps[0]||1);
      while(layoutData.stripSteps.length<rows) layoutData.stripSteps.push(1);
      while(layoutData.rowOffsets.length<rows) layoutData.rowOffsets.push((layoutData.rowOffsets.length||0)*2000);
      layoutData.rowAnimationModes.length=rows;
      layoutData.rowSteps.length=rows;
      layoutData.stripSteps.length=rows;
      layoutData.rowOffsets.length=rows;
      // Resize timelines
      const oldT=layoutData.timelines||[];
      const newT=Array.from({length:rows},(_,ri)=>ri<oldT.length&&oldT[ri]?[...oldT[ri]]:[]);
      layoutData.timelines=newT;
      const rotEl=document.getElementById('tvRotation');
      if(rotEl) rotEl.value=layoutData.rotation||'0';
      console.log('[Timeline] Layout geladen für', currentTV, ':', layoutData);
    } else {
      layoutData={tvId:currentTV,rows:3,cols:2,timelines:[[],[],[]],rowAnimationModes:['cell','cell','cell'],rowSteps:[1,1,1],stripSteps:[1,1,1],rowCellGaps:[4,4,4],cellGap:4,useMatrix:true,rowOffsets:[0,2000,4000]};
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
  pool.querySelectorAll('img[data-src]').forEach(img=>{ img.src=''; });
  // Dynamische Grid-Spalten basierend auf Zoom
  const minCol=Math.max(60,Math.round(100*poolZoomScale));
  pool.style.gridTemplateColumns=`repeat(auto-fill,minmax(${minCol}px,1fr))`;
  // Zoom-Anzeige updaten
  const zoomEl=document.getElementById('poolZoomValue');
  if(zoomEl) zoomEl.textContent=Math.round(poolZoomScale*100)+'%';

  renderPoolGroupFilter();
  console.log('[Timeline] renderPool() — allSlides:', allSlides.length, 'currentTV:', currentTV);

  const tvSlides=allSlides.filter(s=>{
    const tvMatch = s.tvAssignment===currentTV || s.tvAssignment==='both';
    const groupMatch = !activeGroupFilter || s.groupName === activeGroupFilter;
    return hasImage(s) && tvMatch && groupMatch;
  });
  console.log('[Timeline] renderPool() — tvSlides (gefiltert):', tvSlides.length);

  if(!tvSlides.length){
    console.log('[Timeline] Keine Bilder für', currentTV);
    pool.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:20px;color:#555;font-size:14px;">
      🚫 Keine Bilder für diesen TV.${activeGroupFilter?' (Gruppe: '+activeGroupFilter+')':''}\n<br><br>
      Lösung:\n<br>
      1. Gehe zum <strong>Slides</strong>-Tab\n<br>
      2. Erstelle Testbilder oder lade Bilder hoch\n<br>
      3. Stelle sicher, dass die Bilder TV-Zuweisung haben (🔄 📺 klicken)
    </div>`;
    return;
  }
  pool.innerHTML=tvSlides.map(s=>{
    const url=getSlideUrl(s);
    const isSelected=poolSelection.has(s.id);
    return `<div class="timeline-pool-item ${isSelected?'selected':''}" data-slide-id="${s.id}" onclick="window.togglePoolSelection(event,${s.id})" draggable="true" ondragstart="window.timelineDragStart(event,'${s.id}')">
      <div style="position:absolute;top:4px;left:4px;z-index:10;"><input type="checkbox" ${isSelected?'checked':''} onclick="event.stopPropagation(); window.togglePoolSelection(event,${s.id})" style="width:18px;height:18px;accent-color:#ff3366;"></div>
      <img src="${url}" alt="${s.name}" data-src="1">
      <div class="pool-overlay">
        <div class="pool-dot" style="background:${s.groupColor||'#555'}"></div>
        <div class="pool-name">${s.name.substring(0,16)}</div>
      </div>
    </div>`;
  }).join('');
  console.log('[Timeline] renderPool() fertig —', tvSlides.length, 'Bilder gerendert');
}

function renderPoolGroupFilter() {
  const container=document.getElementById('poolGroupFilter'); if(!container) return;
  const groupsMap=new Map();
  allSlides.forEach(s=>{ if(s.groupName && s.groupName!=='—') groupsMap.set(s.groupName, s.groupColor||'#555'); });
  if(!groupsMap.size){ container.innerHTML=''; return; }
  const pills=Array.from(groupsMap.entries()).map(([name,color])=>{
    const active=activeGroupFilter===name;
    return `<button class="group-pill ${active?'active':''}" style="background:${active?color:'#222'};color:#fff;border:1px solid ${active?color:'#333'};padding:4px 10px;border-radius:12px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px;" onclick="window.setPoolGroupFilter('${name}')">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};"></span>${name}
    </button>`;
  }).join('');
  const reset=activeGroupFilter?`<button class="group-pill" style="background:#333;color:#fff;border:1px solid #444;padding:4px 10px;border-radius:12px;font-size:11px;cursor:pointer;" onclick="window.setPoolGroupFilter(null)">✕ Filter löschen</button>`:'';
  container.innerHTML=`<button class="group-pill ${!activeGroupFilter?'active':''}" style="background:${!activeGroupFilter?'#ff3366':'#222'};color:#fff;border:1px solid ${!activeGroupFilter?'#ff3366':'#333'};padding:4px 10px;border-radius:12px;font-size:11px;cursor:pointer;" onclick="window.setPoolGroupFilter(null)">Alle</button>`+pills+reset;
}

window.setPoolGroupFilter=function(name){
  activeGroupFilter=name;
  renderPool();
};

/* POOL SELECTION */
window.togglePoolSelection=function(e,slideId){
  e.stopPropagation(); e.preventDefault();
  if(poolSelection.has(slideId)) poolSelection.delete(slideId); else poolSelection.add(slideId);
  renderPool();
  const count=poolSelection.size;
  const btn=document.getElementById('poolSelectAllBtn');
  if(btn) btn.textContent=count>0?`☐ ${count} ausgewählt`:'☑️ Alle';
};
window.togglePoolSelectAll=function(){
  const tvSlides=allSlides.filter(s=>{ const tvMatch=s.tvAssignment===currentTV||s.tvAssignment==='both'; return hasImage(s)&&tvMatch; });
  if(poolSelection.size===tvSlides.length){ poolSelection.clear(); }
  else{ tvSlides.forEach(s=>poolSelection.add(s.id)); }
  renderPool();
  const btn=document.getElementById('poolSelectAllBtn');
  if(btn) btn.textContent=poolSelection.size>0?`☐ ${poolSelection.size} ausgewählt`:'☑️ Alle';
};

/* BATCH ADD */
window.showBatchAddDialog=function(){
  if(!poolSelection.size){ toast('Bitte wähle mindestens ein Bild aus dem Pool aus.','info'); return; }
  const rows=layoutData.rows||3;
  const sel=document.getElementById('batchAddRowSelect');
  sel.innerHTML=Array.from({length:rows},(_,i)=>
    `<option value="${i}">Zeile ${i+1} (${(layoutData.timelines[i]||[]).length} Bilder)</option>`
  ).join('')+'<option value="new">✨ Neue Zeile</option>';
  document.getElementById('batchAddDialog').style.display='block';
};
window.confirmBatchAdd=async function(){
  const rowIdx=document.getElementById('batchAddRowSelect').value;
  if(rowIdx==='new'){
    // add new row
    const rows=(layoutData.rows||3)+1;
    layoutData.rows=rows;
    layoutData.timelines=[...(layoutData.timelines||[]),[]];
    layoutData.rowAnimationModes=[...(layoutData.rowAnimationModes||[]),'cell'];
    layoutData.rowSteps=[...(layoutData.rowSteps||[]),1];
    layoutData.stripSteps=[...(layoutData.stripSteps||[]),1];
    layoutData.rowOffsets=[...(layoutData.rowOffsets||[]),(rows-1)*2000];
    layoutData.rowCellGaps=[...(layoutData.rowCellGaps||[]),4];
    await db.layouts.put(layoutData);
    renderAllRows();
    toast('Neue Zeile hinzugefügt','success');
    document.getElementById('batchAddDialog').style.display='none';
    return;
  }
  const r=parseInt(rowIdx);
  const timelines=layoutData.timelines.map(t=>[...t]);
  const arr=poolSelection.size?[...poolSelection]:[];
  if(r<0||r>=timelines.length){ toast('Ungültige Zeile','error'); return; }
  timelines[r]=[...(timelines[r]||[]),...arr];
  layoutData.timelines=timelines;
  await db.layouts.put(layoutData);
  poolSelection.clear();
  renderPool();
  renderAllRows();
  document.getElementById('batchAddDialog').style.display='none';
  toast(`${arr.length} Bilder zu Zeile ${r+1} hinzugefügt`,'success');
  const btn=document.getElementById('poolSelectAllBtn');
  if(btn) btn.textContent='☑️ Alle';
};

window.timelineDragStart=function(e,slideId){
  console.log('[Timeline] DragStart — slideId:', slideId);
  dragSrc={type:'pool',slideId:+slideId};
  e.dataTransfer.effectAllowed='copy';
  e.dataTransfer.setData('text/plain',JSON.stringify(dragSrc));
};

window.adjustPoolZoom=function(delta){
  poolZoomScale=Math.max(0.4,Math.min(2.5,poolZoomScale+delta));
  localStorage.setItem('timelinePoolZoom',poolZoomScale.toFixed(2));
  const pct=Math.round(poolZoomScale*100);
  const el=document.getElementById('poolZoomValue');
  if(el) el.textContent=pct+'%';
  updateSlotAspectRatio(); // CSS-Variablen sofort aktualisieren
  renderPool();
};

/* ASPECT RATIO */
function updateSlotAspectRatio(){
  const cols=layoutData.cols||2;
  const rows=layoutData.rows||3;
  const rotation=layoutData.rotation||0;
  const isPortrait=Math.abs(rotation)===90;
  let arW,arH;
  if(isPortrait){ arW=rows; arH=cols; }else{ arW=cols; arH=rows; }
  // Slot: fixed width 240px (~20% bigger than 200px), height from matrix ratio
  const slotWidth=240;
  const slotHeight=Math.round((slotWidth/arW)*arH);
  document.documentElement.style.setProperty('--slot-width',slotWidth+'px');
  document.documentElement.style.setProperty('--slot-height',slotHeight+'px');
  // Pool: base 100px * zoom scale
  const poolWidth=Math.round(100*poolZoomScale);
  const poolHeight=Math.round((poolWidth/arW)*arH);
  document.documentElement.style.setProperty('--pool-width',poolWidth+'px');
  document.documentElement.style.setProperty('--pool-height',poolHeight+'px');
  document.querySelectorAll('.row-strip').forEach(s=> s.style.minHeight=(slotHeight+24)+'px');
}

/* ROWS */
function renderAllRows() {
  const c=document.getElementById('timelineRows'); if(!c) { console.warn('[Timeline] timelineRows nicht gefunden'); return; }
  const {rows,timelines,rowAnimationModes,rowSteps,stripSteps,rowCellGaps}=layoutData;
  console.log('[Timeline] renderAllRows() — rows:', rows, 'timelines:', timelines);
  updateSlotAspectRatio();
  if(!rows){ c.innerHTML=`<div style="text-align:center;padding:30px;color:#555;">Reihen > 0 einstellen.</div>`; return; }
  c.innerHTML=Array.from({length:rows},(_,ri)=>{
    const ids=timelines[ri]||[]; const has=ids.length>0;
    const mode=(rowAnimationModes?.[ri])||'cell';
    const step=(mode==='strip'?(stripSteps?.[ri]):(rowSteps?.[ri]))||1;
    return `<div class="timeline-row ${has?'has-content':'empty'}">
      <div class="row-header"><div class="row-info"><span class="row-num">Zeile ${ri+1}</span><span class="row-count">${ids.length} Bilder</span></div>
      <div style="display:flex;gap:6px;align-items:center;">
      ${has?`<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="window.scrollRow(${ri},-1)" title="Links scrollen">◀</button><button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="window.scrollRow(${ri},1)" title="Rechts scrollen">▶</button>`:''}
      <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="window.clearRow(${ri})" title="Leeren">🗑️</button></div></div>
      <div class="row-controls" style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 12px;background:#14141a;border-radius:8px;margin-bottom:8px;align-items:center;">
        <div class="form-row" style="margin:0;gap:6px;"><label style="min-width:auto;white-space:nowrap;">Modus:</label>
          <select onchange="window.updateRowMode(${ri},this.value)" style="width:auto;min-width:120px;">
            <option value="cell" ${mode==='cell'?'selected':''}>Zellen-Wechsel</option>
            <option value="strip" ${mode==='strip'?'selected':''}>Scroll-Streifen</option>
          </select>
        </div>
        <div class="form-row" style="margin:0;gap:6px;"><label style="min-width:auto;white-space:nowrap;">${mode==='strip'?'Strip-Schritt':'Zellen-Schritt'}:</label>
          <input type="number" value="${step}" min="1" max="10" style="width:64px;" onchange="window.updateRowStep(${ri},this.value)">
        </div>
        <div class="form-row" style="margin:0;gap:6px;"><label style="min-width:auto;white-space:nowrap;">Stagger (ms):</label>
          <input type="number" value="${(layoutData.rowOffsets?.[ri]||0)}" min="0" max="20000" step="500" style="width:80px;" onchange="window.updateRowOffset(${ri},this.value)">
        </div>
        <div class="form-row" style="margin:0;gap:6px;"><label style="min-width:auto;white-space:nowrap;">Lücke (px):</label>
          <input type="number" value="${(rowCellGaps?.[ri])!==undefined?rowCellGaps[ri]:(layoutData.cellGap||4)}" min="0" max="50" style="width:64px;" onchange="window.updateRowCellGap(${ri},this.value)">
        </div>
      </div>
      <div class="row-strip ${has?'':'row-strip-empty'}" data-row="${ri}" ondragover="window.rowDragOver(event)" ondragleave="window.rowDragLeave(event)" ondrop="window.rowDrop(event,${ri})">
        ${!has?`<div class="row-empty-hint">⬇️ Bilder aus dem Pool hier reinziehen</div>`:ids.map((sid,si)=>renderSlot(ri,si,sid)).join('')}
      </div></div>`;
  }).join('');
  console.log('[Timeline] renderAllRows() fertig');
}

function renderSlot(rowIdx,slotIdx,slideId) {
  const slide=allSlides.find(s=>s.id===slideId); if(!slide) return `<div class="row-slot row-slot-empty" data-row="${rowIdx}" data-slot="${slotIdx}">?</div>`;
  const url=getSlideUrl(slide);
  return `<div class="row-slot assigned" draggable="true" data-row="${rowIdx}" data-slot="${slotIdx}" data-slide-id="${slideId}" ondragstart="window.slotDragStart(event,${slideId},${rowIdx},${slotIdx})" ondragover="window.slotDragOver(event)" ondrop="window.slotDrop(event,${rowIdx},${slotIdx})">
    <img src="${url}" alt="${slide.name}" data-src="1">
    <div class="slot-sort-btns">
      <button onclick="window.moveSlot(${rowIdx},${slotIdx},-1);event.stopPropagation();" title="Nach links">◀</button>
      <button onclick="window.moveSlot(${rowIdx},${slotIdx},1);event.stopPropagation();" title="Nach rechts">▶</button>
    </div>
    <div class="slot-overlay"><div class="slot-dot" style="background:${slide.groupColor||'#555'}"></div><div class="slot-name">${slide.name.substring(0,12)}</div></div>
    <button class="slot-del" onclick="window.removeFromRow(${rowIdx},${slotIdx})" title="Entfernen">×</button></div>`;
}

window.moveSlot=async function(rowIdx,slotIdx,dir){
  const t=layoutData.timelines.map(x=>[...x]); const row=t[rowIdx]; if(!row||!row.length) return;
  const newIdx=slotIdx+dir; if(newIdx<0||newIdx>=row.length) return;
  [row[slotIdx],row[newIdx]]=[row[newIdx],row[slotIdx]];
  t[rowIdx]=row; layoutData.timelines=t;
  await db.layouts.put(layoutData); renderAllRows();
  toast('Reihenfolge geändert','success');
};

/* ROW-LEVEL UPDATES */
window.updateRowMode=async function(ri,newMode){
  const modes=[...(layoutData.rowAnimationModes||[])];
  while(modes.length<(layoutData.rows||3)) modes.push('cell');
  modes[ri]=newMode;
  layoutData.rowAnimationModes=modes;
  await db.layouts.put(layoutData); renderAllRows(); toast(`Zeile ${ri+1}: ${newMode==='strip'?'Strip':'Cell'}-Modus`,'success');
};

window.updateRowStep=async function(ri,newVal){
  const val=parseInt(newVal)||1;
  const mode=(layoutData.rowAnimationModes?.[ri])||'cell';
  if(mode==='strip'){
    const steps=[...(layoutData.stripSteps||[])];
    while(steps.length<(layoutData.rows||3)) steps.push(1);
    steps[ri]=val;
    layoutData.stripSteps=steps;
  }else{
    const steps=[...(layoutData.rowSteps||[])];
    while(steps.length<(layoutData.rows||3)) steps.push(1);
    steps[ri]=val;
    layoutData.rowSteps=steps;
  }
  await db.layouts.put(layoutData); toast(`Zeile ${ri+1}: Schritt = ${val}`,'success');
};

window.updateRowOffset=async function(ri,newVal){
  const offsets=[...(layoutData.rowOffsets||[])];
  while(offsets.length<(layoutData.rows||3)) offsets.push(offsets.length*2000);
  offsets[ri]=parseInt(newVal)||0;
  layoutData.rowOffsets=offsets;
  await db.layouts.put(layoutData); toast(`Zeile ${ri+1}: Offset = ${newVal}ms`,'success');
};

window.updateRowCellGap=async function(ri,newVal){
  const gaps=[...(layoutData.rowCellGaps||[])];
  while(gaps.length<(layoutData.rows||3)) gaps.push(layoutData.cellGap||4);
  gaps[ri]=parseInt(newVal)||0;
  layoutData.rowCellGaps=gaps;
  await db.layouts.put(layoutData); toast(`Zeile ${ri+1}: Lücke = ${newVal}px`,'success');
};

/* DRAG & DROP */
window.rowDragOver=function(e){ e.preventDefault(); e.currentTarget.classList.add('dragover'); e.dataTransfer.dropEffect=dragSrc?.type==='slot'?'move':'copy'; };
window.rowDragLeave=function(e){ e.currentTarget.classList.remove('dragover'); };

window.rowDrop=async function(e,rowIdx){
  e.preventDefault(); e.currentTarget.classList.remove('dragover'); if(!dragSrc) return;
  const timelines=layoutData.timelines.map(t=>[...t]);
  if(dragSrc.type==='pool'){
    const selectedIds = poolSelection.size > 0 ? [...poolSelection] : [dragSrc.slideId];
    timelines[rowIdx]=[...(timelines[rowIdx]||[]), ...selectedIds];
    if(poolSelection.size > 0){ poolSelection.clear(); renderPool(); const btn=document.getElementById('poolSelectAllBtn'); if(btn) btn.textContent='☑️ Alle'; }
  }
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
  if(dragSrc.type==='pool'){
    const selectedIds = poolSelection.size > 0 ? [...poolSelection] : [dragSrc.slideId];
    const row=[...(timelines[rowIdx]||[])];
    row.splice(slotIdx,0,...selectedIds);
    timelines[rowIdx]=row;
    if(poolSelection.size > 0){ poolSelection.clear(); renderPool(); const btn=document.getElementById('poolSelectAllBtn'); if(btn) btn.textContent='☑️ Alle'; }
  }
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
  const gap=parseInt(document.getElementById('cellGap')?.value)||4;
  const rotation=parseInt(document.getElementById('tvRotation')?.value)||0;
  const oldR=layoutData.rows||3;
  const oldT=layoutData.timelines||[];
  const newT=Array.from({length:r},(_,ri)=> ri<oldR && oldT[ri]?[...oldT[ri]]:[] );
  // Resize per-row arrays
  const modes=[...(layoutData.rowAnimationModes||[])];
  const rowSteps=[...(layoutData.rowSteps||[])];
  const stripSteps=[...(layoutData.stripSteps||[])];
  const offsets=[...(layoutData.rowOffsets||[])];
  const rowGaps=[...(layoutData.rowCellGaps||[])];
  while(modes.length<r) modes.push(modes[0]||'cell');
  while(rowSteps.length<r) rowSteps.push(rowSteps[0]||1);
  while(stripSteps.length<r) stripSteps.push(1);
  while(offsets.length<r) offsets.push(offsets.length*2000);
  while(rowGaps.length<r) rowGaps.push(gap);
  modes.length=r; rowSteps.length=r; stripSteps.length=r; offsets.length=r; rowGaps.length=r;
  layoutData={...layoutData,rows:r,cols:c,cellGap:gap,timelines:newT,rowAnimationModes:modes,rowSteps,stripSteps,rowOffsets:offsets,rowCellGaps:rowGaps,rotation};
  await db.layouts.put(layoutData); renderAllRows(); toast('Layout aktualisiert','success');
};
