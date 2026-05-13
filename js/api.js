// PINEA Slides V4.1 — API Client
const API_BASE = '';

function api(path, opts={}){
    opts.headers = {...(opts.headers||{})};
    const token = localStorage.getItem('pinea_token');
    if(token) opts.headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, opts).then(async r=>{
        if(r.status===401){
            localStorage.removeItem('pinea_token');
            if(typeof window !== 'undefined' && window.dispatchEvent){
                window.dispatchEvent(new CustomEvent('pinea-logout'));
            }
            throw new Error('Unauthorized');
        }
        if(!r.ok){
            const err = await r.json().catch(()=>({}));
            throw new Error(err.error || `HTTP ${r.status}`);
        }
        const ct = r.headers.get('content-type') || '';
        if(ct.includes('application/json')) return r.json();
        return r.text();
    });
}

export const login = (body) => api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>{localStorage.setItem('pinea_token',r.token); return r;});
export const changePassword = (body) => api('/api/auth/change-password',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const getConfig = () => api('/api/config');
export const putConfig = (body) => api('/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const getLayouts = () => api('/api/layouts');
export const getLayout = (tvId) => api('/api/layouts/'+tvId);
export const putLayout = (tvId, body) => api('/api/layouts/'+tvId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const getSlides = () => api('/api/slides');
export const getSlide = (id) => api('/api/slides/'+id);
export const createSlide = (body) => api('/api/slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const updateSlide = (id, body) => api('/api/slides/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const deleteSlide = (id) => api('/api/slides/'+id,{method:'DELETE'});
export const bulkSlides = (body) => api('/api/slides/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const getGroups = () => api('/api/groups');
export const createGroup = (body) => api('/api/groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const updateGroup = (id, body) => api('/api/groups/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const deleteGroup = (id) => api('/api/groups/'+id,{method:'DELETE'});
export const uploadImages = (formData) => api('/api/upload',{method:'POST',body:formData});

export function isLoggedIn(){ return !!localStorage.getItem('pinea_token'); }
export function logout(){ localStorage.removeItem('pinea_token'); }
