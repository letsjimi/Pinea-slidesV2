// PINEA Slides V4.1 — Server DB (Dexie-API kompatibel via REST)
import * as api from './api.js';

const DEFAULT_CONFIG = {
    id:'global',
    gridColor:'#ff3366', gridVisible:false, gridOpacity:0.4, gridWidthPx:1,
    gridCols:2, gridRows:2, cropMode:'cover',
    transitionType:'fade',
    transitionSettings:{duration:1200, easing:'ease-in-out'},
    showGroupLabel:true, groupLabelPos:'bottom',
    labelColor:'#ffffff', labelBgOpacity:0.6,
    debugOverlay:false, autoStart:true,
    idleTimeout:0, slideshowSpeed:5000
};

class FakeCollection{
    constructor(arr){this._arr=arr;}
    toArray(){return Promise.resolve(this._arr);}
    sortBy(key){
        return Promise.resolve([...this._arr].sort((a,b)=>{
            const va=a[key]===undefined?0:a[key], vb=b[key]===undefined?0:b[key];
            return va-vb;
        }));
    }
    count(){return Promise.resolve(this._arr.length);}
    first(){return Promise.resolve(this._arr[0]);}
    modify(fn){this._arr.forEach(fn); return Promise.resolve();}
}
class FakeWhere{
    constructor(arr,key){this._arr=arr; this._key=key;}
    anyOf(...vals){ const s=new Set(vals.flat()); return new FakeCollection(this._arr.filter(x=>s.has(x[this._key]))); }
    equals(v){return new FakeCollection(this._arr.filter(x=>x[this._key]===v));}
    above(v){return new FakeCollection(this._arr.filter(x=>x[this._key]>v));}
    notEqual(v){return new FakeCollection(this._arr.filter(x=>x[this._key]!==v));}
}

/* === Config === */
const configTable = {
    async get(id){ if(id!=='global') return undefined; return api.getConfig().catch(()=>DEFAULT_CONFIG); },
    async put(cfg){ return api.putConfig(cfg); },
    async add(cfg){ return api.putConfig(cfg); }
};

/* === Slides === */
let _slidesCache=null;
const slidesTable = {
    async _load(){ if(!_slidesCache)_slidesCache=await api.getSlides(); return _slidesCache; },
    async get(id){ return (await this._load()).find(x=>x.id===Number(id)); },
    where(key){ return new FakeWhere(_slidesCache||[], key); },
    async toArray(){ return this._load(); },
    async count(){ return (await this._load()).length; },
    async add(item){ _slidesCache=null; return api.createSlide(item); },
    async put(item){ _slidesCache=null; return api.updateSlide(item.id, item); },
    async delete(id){ _slidesCache=null; return api.deleteSlide(id); },
    async bulkAdd(items){ _slidesCache=null; return api.bulkSlides({slides:items}); },
    _invalidate(){ _slidesCache=null; }
};

/* === Groups === */
let _groupCache=null;
const groupsTable = {
    async _load(){ if(!_groupCache)_groupCache=await api.getGroups(); return _groupCache; },
    async get(id){ return (await this._load()).find(x=>x.id===Number(id)); },
    where(key){ return new FakeWhere(_groupCache||[], key); },
    async count(){ return (await this._load()).length; },
    async add(g){ _groupCache=null; return api.createGroup(g); },
    async put(g){ _groupCache=null; return api.updateGroup(g.id, g); },
    async delete(id){ _groupCache=null; return api.deleteGroup(id); },
    _invalidate(){ _groupCache=null; }
};

/* === Layouts === */
let _layoutCache=null;
const layoutsTable = {
    async get(tvId){ if(!tvId) return undefined; if(!_layoutCache)_layoutCache=await api.getLayouts(); return _layoutCache[tvId]; },
    async put(layout){ await api.putLayout(layout.tvId, layout); if(_layoutCache)_layoutCache[layout.tvId]=layout; return layout; },
    _invalidate(){ _layoutCache=null; }
};

const db = { config: configTable, slides: slidesTable, groups: groupsTable, layouts: layoutsTable };

async function initDB(){
    try{ await api.getConfig(); }catch(e){console.warn('[DB] Server offline?',e.message);}
    return db;
}
export { db, initDB, DEFAULT_CONFIG };
