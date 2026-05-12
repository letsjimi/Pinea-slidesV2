// PINEA Admin v3.0 — Tabs, Upload, Gruppen, Slides, Timeline, Settings
import { db, initDB, DEFAULT_CONFIG } from './db.js';

let groups = [], slides = [], selectedUploadGroup = null, draggedSlide = null;
let dbReady = false, timelineLoaded = false, currentTransition = 'fade';
let serverIP = 'localhost';

/* INIT */
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs(); setupUpload(); detectIP(); renderIPLinks();
  try {
    await initDB(); dbReady = true;
    await loadGroups(); await loadSlides(); await loadConfig();
    setupFilters(); renderGroups(); renderSlides(); renderGroupPills();
    // lazy timeline
    import('./admin-timeline.js').then(m => { if(m.initTimelineEditor) m.initTimelineEditor(); timelineLoaded = true; }).catch(()=>{});
    console.log('PINEA Admin v3.0 ready');
  } catch(err) { toast('Fehler beim Starten: ' + err.message, 'error'); }
});

function detectIP() {
  const h = window.location.hostname;
  if (h !== 'localhost' && h !== '127.0.0.1') serverIP = h;
  const b = document.getElementById('ipBadge');
  if (b) b.textContent = `📡 ${serverIP}:3000`;
}
function renderIPLinks() {
  const base = `http://${serverIP}:3000`;
  const ids = ['linkAdminA','linkLeftA','linkRightA'];
  const urls = [`${base}/admin`,`${base}/tv-left`,`${base}/tv-right`];
  ids.forEach((id,i) => {
    const el = document.getElementById(id);
    if (el) { el.href = urls[i]; el.textContent = urls[i]; }
  });
  // Setze iframe-previews (wenn Tab sichtbar)
  const pl = document.getElementById('previewLeft');
  const pr = document.getElementById('previewRight');
  if (pl) pl.src = urls[1];
  if (pr) pr.src = urls[2];
}

window.startSlideshow = function() {
  window.open(`http://${serverIP}:3000/tv-left`, '_blank');
  window.open(`http://${serverIP}:3000/tv-right`, '_blank');
};

window.openTV = function(side) {
  window.open(`http://${serverIP}:3000/tv-${side}`, '_blank');
};

/* TABS */
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tab = btn.dataset.tab; if(!tab) return;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const t = document.getElementById('tab-'+tab); if(t) t.classList.add('active');
      if(tab==='timeline' && !timelineLoaded) {
        import('./admin-timeline.js').then(m => { if(m.initTimelineEditor) m.initTimelineEditor(); timelineLoaded = true; }).catch(()=>{});
      }
    });
  });
}

/* TOAST */
function toast(msg, type='info') {
  const c = document.getElementById('toastContainer'); if(!c) return;
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
  el.style.cssText = 'padding:14px 20px;border-radius:10px;background:#1a1a20;border:1px solid ' + (type==='success'?'#00ff88':type==='error'?'#ff4444':'#333') + ';color:#fff;font-size:14px;margin-top:8px;animation:toastIn .3s ease;';
  c.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, 2500);
}
window.toast = toast;

/* GROUPS */
async function loadGroups() { 
  groups = await db.groups.orderBy('sortOrder').toArray();
  if(!selectedUploadGroup && groups.length) selectedUploadGroup = groups[0].id;
}
async function addGroup() {
  const name = document.getElementById('newGroupName').value.trim();
  const color = document.getElementById('newGroupColor').value;
  if(!name){ toast('Gruppenname eingeben','error'); return; }
  const max = groups.length? Math.max(...groups.map(g=>g.sortOrder)) : -1;
  await db.groups.add({name, color, sortOrder: max+1});
  await loadGroups(); renderGroups(); renderGroupPills(); updateFilterOptions();
  document.getElementById('newGroupName').value='';
  toast('Gruppe hinzugefügt','success');
}
async function deleteGroup(id) {
  if(!confirm('Gruppe und alle Slides löschen?')) return;
  await db.slides.where('groupId').equals(id).delete();
  await db.groups.delete(id);
  await loadGroups(); await loadSlides();
  renderGroups(); renderGroupPills(); renderSlides(); updateFilterOptions();
  toast('Gruppe gelöscht','success');
}
function renderGroups() {
  const c = document.getElementById('groupList'); if(!c) return;
  c.innerHTML = groups.map(g => `
    <div class="group-pill" style="background:${g.color}" data-id="${g.id}">
      <span class="dot" style="background:#fff"></span>${g.name}
      <span class="delete-btn" onclick="window.deleteGroup(${g.id})">×</span>
    </div>`).join('');
}
function renderGroupPills() {
  const c = document.getElementById('uploadGroupSelect'); if(!c) return;
  c.innerHTML = groups.map(g => `
    <div class="group-pill ${selectedUploadGroup===g.id?'selected':''}" style="background:${g.color}" onclick="window.selectUploadGroup(${g.id})">
      <span class="dot" style="background:#fff"></span>${g.name}
    </div>`).join('');
}
function selectUploadGroup(id) { selectedUploadGroup=id; renderGroupPills(); }
window.addGroup = addGroup; window.deleteGroup = deleteGroup; window.selectUploadGroup = selectUploadGroup;

/* UPLOAD */
function setupUpload() {
  const zone = document.getElementById('uploadZone'), input = document.getElementById('fileInput');
  if(!zone || !input) return;
  zone.addEventListener('click', e => { if(!zone.classList.contains('uploading') && e.target!==input) input.click(); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); dbReady?handleFiles(e.dataTransfer.files):toast('DB nicht bereit','error'); });
  input.addEventListener('change', e => { dbReady?handleFiles(e.target.files):toast('DB nicht bereit','error'); });
}
async function handleFiles(files) {
  if(!selectedUploadGroup && groups.length){ selectedUploadGroup=groups[0].id; toast('Gruppe auto-gewählt','info'); }
  if(!selectedUploadGroup){ toast('Zuerst Gruppe anlegen','error'); return; }
  const group = groups.find(g=>g.id===selectedUploadGroup);
  const imgs = Array.from(files).filter(f=>f.type.startsWith('image/'));
  if(!imgs.length){ toast('Keine Bilder','error'); return; }
  const zone = document.getElementById('uploadZone'); zone.classList.add('uploading');
  const maxS = slides.length? Math.max(...slides.map(s=>s.sortOrder)) : -1;
  const newSlides = [];
  for(let i=0;i<imgs.length;i++){
    const blob = new Blob([await imgs[i].arrayBuffer()], {type:imgs[i].type});
    newSlides.push({groupId:selectedUploadGroup, groupName:group.name, groupColor:group.color, tvAssignment:'both', imageBlob:blob, name:imgs[i].name, sortOrder:maxS+1+i, uploadedAt:Date.now()});
    const p = zone.querySelector('p'); if(p) p.textContent = `⏳ ${i+1}/${imgs.length}...`;
  }
  await db.slides.bulkAdd(newSlides);
  zone.classList.remove('uploading'); const p=zone.querySelector('p'); if(p) p.textContent='Dateien hier reinziehen oder klicken';
  await loadSlides(); renderSlides(); renderGroupPills();
  toast(`${imgs.length} Bilder hochgeladen`,'success');
}
window.handleFiles = handleFiles;

/* TEST IMAGES */
async function generateTestImages() {
  if(!dbReady){ toast('DB nicht bereit','error'); return; }
  if(!selectedUploadGroup && groups.length){ selectedUploadGroup=groups[0].id; }
  if(!selectedUploadGroup){ toast('Gruppe anlegen','error'); return; }
  const count = parseInt(document.getElementById('testImageCount')?.value)||6;
  const group = groups.find(g=>g.id===selectedUploadGroup);
  const maxS = slides.length? Math.max(...slides.map(s=>s.sortOrder)) : -1;
  const colors = [['#FF3366','#FF6B8A'],['#00AAFF','#66CCFF'],['#00FF88','#66FFBB'],['#FFAA00','#FFCC66'],['#AA00FF','#CC66FF'],['#00FFCC','#66FFE6'],['#FF5500','#FF9966'],['#5500FF','#9966FF']];
  const newSlides=[];
  for(let i=0;i<count;i++){
    const [c1,c2]=colors[i%colors.length];
    const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1920;
    const ctx=canvas.getContext('2d');
    const grd=ctx.createLinearGradient(0,0,1080,1920); grd.addColorStop(0,c1); grd.addColorStop(1,c2);
    ctx.fillStyle=grd; ctx.fillRect(0,0,1080,1920);
    ctx.fillStyle='rgba(255,255,255,.1)'; for(let j=0;j<5;j++){ ctx.beginPath(); ctx.arc(200+Math.random()*680,400+Math.random()*1120,80+Math.random()*200,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#fff'; ctx.font='bold 72px "Segoe UI"'; ctx.textAlign='center'; ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=20;
    ctx.fillText('TESTBILD',540,900); ctx.font='48px "Segoe UI"'; ctx.fillText(`${i+1}/${count}`,540,1000);
    ctx.font='36px "Segoe UI"'; ctx.fillStyle='rgba(255,255,255,.8)'; ctx.fillText(group.name,540,1100);
    ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=8; ctx.strokeRect(40,40,1000,1840);
    const blob = await new Promise(r=>canvas.toBlob(r,'image/png'));
    newSlides.push({groupId:selectedUploadGroup, groupName:group.name, groupColor:group.color, tvAssignment:'both', imageBlob:blob, name:`Test_${String(i+1).padStart(2,'0')}.png`, sortOrder:maxS+1+i, uploadedAt:Date.now()});
  }
  await db.slides.bulkAdd(newSlides); await loadSlides(); renderSlides();
  toast(`${count} Testbilder generiert`,'success');
}
window.generateTestImages = generateTestImages;

/* SLIDES */
async function loadSlides() { slides = await db.slides.orderBy('sortOrder').toArray(); }
function renderSlides() {
  const grid = document.getElementById('slideGrid'); if(!grid) return;
  const fg = document.getElementById('filterGroup')?.value||'';
  const ft = document.getElementById('filterTV')?.value||'';
  let filtered = slides;
  if(fg) filtered = filtered.filter(s=>String(s.groupId)===fg);
  if(ft) filtered = filtered.filter(s=>s.tvAssignment===ft || s.tvAssignment==='both');
  grid.querySelectorAll('img[data-blob]').forEach(img=>{ if(img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src); });
  if(!filtered.length){ grid.innerHTML=''; document.getElementById('slideEmptyHint').style.display='block'; return; }
  document.getElementById('slideEmptyHint').style.display='none';
  grid.innerHTML = filtered.map((s,idx)=>{
    const url=URL.createObjectURL(s.imageBlob);
    return `<div class="thumb-item" draggable="true" data-id="${s.id}" data-idx="${idx}" ondragstart="window.slideDragStart(${s.id})" ondragover="event.preventDefault()" ondrop="window.slideDrop(event,${idx})" ondragend="window.slideDragEnd()">
      <img src="${url}" alt="${s.name}" data-blob="1">
      <div class="thumb-overlay"><span>${s.name.substring(0,20)}</span><span style="font-size:10px;opacity:.7">${s.tvAssignment} | ${s.groupName}</span></div>
      <div class="thumb-actions"><button onclick="window.deleteSlide(${s.id})" title="Löschen">🗑️</button><button onclick="window.cycleTV(${s.id})" title="TV">📺</button></div>
    </div>`;
  }).join('');
}
function setupFilters() {
  const fg=document.getElementById('filterGroup'), ft=document.getElementById('filterTV');
  if(fg) fg.addEventListener('change', renderSlides);
  if(ft) ft.addEventListener('change', renderSlides);
}
function updateFilterOptions() {
  const sel=document.getElementById('filterGroup'); if(!sel) return;
  const v=sel.value; sel.innerHTML='<option value="">Alle Gruppen</option>'+groups.map(g=>`<option value="${g.id}">${g.name}</option>`).join(''); sel.value=v||'';
}
function slideDragStart(id){ draggedSlide=slides.find(s=>s.id===id); }
async function slideDrop(e,dropIdx){ e.preventDefault(); if(!draggedSlide) return; const di=slides.findIndex(s=>s.id===draggedSlide.id); if(di===-1||di===dropIdx) return; const[moved]=slides.splice(di,1); slides.splice(dropIdx,0,moved); for(let i=0;i<slides.length;i++) await db.slides.update(slides[i].id,{sortOrder:i}); await loadSlides(); renderSlides(); toast('Reihenfolge aktualisiert','success'); }
function slideDragEnd(){ draggedSlide=null; }
async function deleteSlide(id){ if(!confirm('Löschen?')) return; await db.slides.delete(id); await loadSlides(); renderSlides(); toast('Gelöscht','success'); }
async function cycleTV(id){ const s=slides.find(x=>x.id===id); const nxt=s.tvAssignment==='both'?'left':s.tvAssignment==='left'?'right':'both'; await db.slides.update(id,{tvAssignment:nxt}); await loadSlides(); renderSlides(); toast(`TV: ${nxt}`,'info'); }
window.slideDragStart=slideDragStart; window.slideDrop=slideDrop; window.slideDragEnd=slideDragEnd; window.deleteSlide=deleteSlide; window.cycleTV=cycleTV;

/* SETTINGS */
async function loadConfig() {
  const cfg = await db.config.get('global') || DEFAULT_CONFIG;
  const set = (id, val) => { const el=document.getElementById(id); if(el){ if(el.type==='checkbox') el.checked=!!val; else el.value=val||''; } };
  set('cfgGridVisible', cfg.gridVisible);
  set('cfgGridColor', cfg.gridColor);
  set('cfgGridOpacity', cfg.gridOpacity);
  set('cfgGridWidth', cfg.gridWidthPx);
  set('cfgGridCols', cfg.gridCols || 2);
  set('cfgGridRows', cfg.gridRows || 2);
  set('cfgCropMode', cfg.cropMode);
  set('cfgTransition', cfg.transitionType);
  set('cfgTransDuration', cfg.transitionSettings?.duration || 1200);
  set('cfgSlideSpeed', cfg.slideshowSpeed || 5000);
  set('cfgShowLabel', cfg.showGroupLabel);
  set('cfgLabelPos', cfg.groupLabelPos);
  set('cfgDebug', cfg.debugOverlay);
}

async function saveConfig() {
  const get = id => { const el=document.getElementById(id); if(!el) return undefined; return el.type==='checkbox'?el.checked:el.value; };
  const cfg = {
    id:'global',
    gridVisible: get('cfgGridVisible'),
    gridColor: get('cfgGridColor'),
    gridOpacity: parseFloat(get('cfgGridOpacity')),
    gridWidthPx: parseInt(get('cfgGridWidth')),
    gridCols: parseInt(get('cfgGridCols')),
    gridRows: parseInt(get('cfgGridRows')),
    cropMode: get('cfgCropMode'),
    transitionType: get('cfgTransition'),
    transitionSettings:{ duration: parseInt(get('cfgTransDuration')||1200), easing:'ease-in-out' },
    slideshowSpeed: parseInt(get('cfgSlideSpeed')||5000),
    showGroupLabel: get('cfgShowLabel'),
    groupLabelPos: get('cfgLabelPos'),
    debugOverlay: get('cfgDebug')
  };
  await db.config.put(cfg);
  toast('Einstellungen gespeichert','success');
}
window.saveConfig = saveConfig; window.loadConfig = loadConfig;

/* TRANSITIONS */
function selectTransition(type){ currentTransition=type; document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('selected')); const t=document.querySelector(`.preset-card[data-type="${type}"]`); if(t) t.classList.add('selected'); }
window.selectTransition = selectTransition;

function startSlideshow() { window.open(`http://${serverIP}:3000/tv-left`,'tvLeft'); window.open(`http://${serverIP}:3000/tv-right`,'tvRight'); }
window.startSlideshow = startSlideshow;
