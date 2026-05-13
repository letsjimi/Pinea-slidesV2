// PINEA Slides V4.1 — DB Adapter (Dexie-Compatible, API-backed)
import * as api from './api.js';

/* ========== Table Adapter ========== */
function table(name){
    const t = { name };
    t.toArray = () => {
        if(name==='groups') return api.getGroups().then(r => r.groups || r || []);
        if(name==='slides') return api.getSlides().then(r => r.slides || r || []);
        if(name==='layouts') return api.getLayouts().then(r => {
            const layouts = r.layouts || r || {};
            return [layouts.left, layouts.right].filter(Boolean);
        });
        if(name==='config') return api.getConfig().then(r => [r.config || r]).catch(()=>[]);
        return Promise.resolve([]);
    };
    t.get = (id) => {
        if(name==='groups') return t.toArray().then(arr => arr.find(x=>x.id===id||String(x.id)===String(id)) || undefined);
        if(name==='slides') return api.getSlide(id).then(r => r.slide || r).catch(()=>undefined);
        if(name==='layouts') return api.getLayout(id).then(r => r.layout || r).catch(()=>undefined);
        return Promise.resolve(undefined);
    };
    t.put = (obj) => {
        if(name==='groups') return api.updateGroup(obj.id, obj).then(r=>r.id||obj.id);
        if(name==='slides') return api.updateSlide(obj.id, obj).then(r=>r.id||obj.id);
        if(name==='layouts') return api.putLayout(obj.tvId||obj.id, obj).then(r=>r.tvId||obj.tvId||obj.id);
        if(name==='config') return api.putConfig(obj).then(r=>r.id||'global');
        return Promise.resolve(obj.id);
    };
    t.add = (obj) => {
        if(name==='groups') return api.createGroup(obj).then(r=>r.id);
        if(name==='slides') return api.createSlide(obj).then(r=>r.id);
        return Promise.resolve(obj.id);
    };
    t.delete = (id) => {
        if(name==='groups') return api.deleteGroup(id).then(()=>id);
        if(name==='slides') return api.deleteSlide(id).then(()=>id);
        return Promise.resolve(id);
    };
    return t;
}

/* ========== DB ========== */
export const db = {
    groups:  table('groups'),
    slides:  table('slides'),
    layouts: table('layouts'),
    config:  table('config'),
    open:    () => Promise.resolve(db),
};

/* ========== Stubs für alte Dexie-Schnittstelle ========== */
export function initDB(){ return api.getConfig().catch(()=>null); }
export const DEFAULT_CONFIG = {
    id:'global', gridColor:'#ff3366', gridVisible:false, gridOpacity:0.4,
    gridWidthPx:1, gridCols:2, gridRows:2, cropMode:'cover', transitionType:'fade',
    transitionSettings:{duration:1200,easing:'ease-in-out'}, showGroupLabel:true,
    groupLabelPos:'bottom', labelColor:'#ffffff', labelBgOpacity:0.6,
    debugOverlay:false, autoStart:true, idleTimeout:0, slideshowSpeed:5000
};

export async function initGroupsIfEmpty(){
    const groups = await db.groups.toArray();
    if(!groups || groups.length===0){
        for(const g of [
            {id:1,name:'Allgemein',color:'#00aaff',sortOrder:0},
            {id:2,name:'Programm',color:'#ffaa00',sortOrder:1},
            {id:3,name:'Specials',color:'#00ff88',sortOrder:2}
        ]){
            await db.groups.put(g);
        }
    }
}
