// PINEA Slides V4.2 — Drei-Port Server (Admin:8095, TV-Left:8096, TV-Right:8097)
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/* ===== PERSISTED JWT SECRET ===== */
const SECRET_FILE = path.join(__dirname, '.jwt_secret');
let JWT_SECRET;
if(fs.existsSync(SECRET_FILE)){
  JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
} else {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, JWT_SECRET, {mode:0o600});
  console.log('Generated new JWT_SECRET (persisted to .jwt_secret)');
}

const DATA_DIR = path.join(__dirname, 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');
const ROOT_DIR = __dirname;

/* ===== DATA HELPERS ===== */
function ensureDir(dir){ if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true}); }
ensureDir(DATA_DIR); ensureDir(IMG_DIR);
function loadJSON(file, def=null){ try{ return JSON.parse(fs.readFileSync(file, 'utf8')); }catch(e){ return def; } }
function saveJSON(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const LAYOUTS_FILE = path.join(DATA_DIR, 'layouts.json');
const SLIDES_FILE = path.join(DATA_DIR, 'slides.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

function initData(){
  if(!fs.existsSync(CONFIG_FILE)) saveJSON(CONFIG_FILE, {
    id:'global', gridColor:'#ff3366', gridVisible:false, gridOpacity:0.4,
    gridWidthPx:1, gridCols:2, gridRows:2, cropMode:'cover', transitionType:'fade',
    transitionSettings:{duration:1200,easing:'ease-in-out'}, showGroupLabel:true,
    groupLabelPos:'bottom', labelColor:'#ffffff', labelBgOpacity:0.6,
    debugOverlay:false, autoStart:true, idleTimeout:0, slideshowSpeed:5000
  });
  if(!fs.existsSync(LAYOUTS_FILE)) saveJSON(LAYOUTS_FILE, {
    left:{tvId:'left',rows:3,cols:2,timelines:[[],[],[]],rowLabels:['','',''],rowAnimationModes:['cell','cell','cell'],rowSteps:[1,1,1],stripSteps:[1,1,1],rowCellGaps:[4,4,4],rowOffsets:[0,2000,4000]},
    right:{tvId:'right',rows:3,cols:2,timelines:[[],[],[]],rowLabels:['','',''],rowAnimationModes:['cell','cell','cell'],rowSteps:[1,1,1],stripSteps:[1,1,1],rowCellGaps:[4,4,4],rowOffsets:[0,2000,4000]}
  });
  if(!fs.existsSync(SLIDES_FILE)) saveJSON(SLIDES_FILE, []);
  if(!fs.existsSync(GROUPS_FILE)) saveJSON(GROUPS_FILE, [
    {id:1,name:'Allgemein',color:'#00aaff',sortOrder:0},
    {id:2,name:'Programm',color:'#ffaa00',sortOrder:1},
    {id:3,name:'Specials',color:'#00ff88',sortOrder:2}
  ]);
  if(!fs.existsSync(AUTH_FILE)){
    saveJSON(AUTH_FILE, {users:[{username:'HannaM', password:bcrypt.hashSync('PineaSlides_V4.1!',10)}]});
  }
}
initData();

/* ===== MULTER (with MIME filter) ===== */
const ALLOWED_MIME = ['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/svg+xml'];
const ALLOWED_EXTS = ['.jpg','.jpeg','.png','.webp','.gif','.bmp','.svg'];

const fileFilter = (req,file,cb)=>{
  const ext = path.extname(file.originalname||'').toLowerCase();
  if(ALLOWED_MIME.includes(file.mimetype) && ALLOWED_EXTS.includes(ext)){
    cb(null,true);
  } else {
    cb(new Error('Invalid file type. Allowed: '+ALLOWED_EXTS.join(', ')),false);
  }
};

const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,IMG_DIR),
  filename:(req,file,cb)=>{
    const ext = path.extname(file.originalname)||'.jpg';
    cb(null, file.fieldname+'-'+Date.now()+'-'+Math.round(Math.random()*1e9)+ext);
  }
});
const upload = multer({storage, limits:{fileSize:20*1024*1024, files:50}, fileFilter});

/* ===== AUTH MIDDLEWARE ===== */
function authMW(req,res,next){
  const auth = req.headers.authorization;
  if(!auth||!auth.startsWith('Bearer ')) return res.status(401).json({error:'Unauthorized'});
  try{ req.user = jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({error:'Invalid token'}); }
}

/* ===== RATE LIMITERS ===== */
const loginLimiter = rateLimit({
  windowMs: 15*60*1000, // 15 Minuten
  max: 10,               // 10 Versuche pro IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,  // nur fehlgeschlagene zählen
  handler:(req,res)=>res.status(429).json({error:'Too many login attempts. Try again in 15 minutes.'})
});
const apiLimiter = rateLimit({
  windowMs: 60*1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip:(req)=>req.path==='/',
  handler:(req,res)=>res.status(429).json({error:'Too many requests. Slow down.'})
});

/* ===== PUBLIC API ROUTES ===== */
function setupPublicAPI(app){
  app.get('/api/config', (req,res)=>res.json(loadJSON(CONFIG_FILE)));
  app.get('/api/layouts', (req,res)=>res.json(loadJSON(LAYOUTS_FILE)));
  app.get('/api/layouts/:tvId', (req,res)=>{
    const all=loadJSON(LAYOUTS_FILE); const l=all[req.params.tvId];
    if(!l) return res.status(404).json({error:'Not found'});
    res.json(l);
  });
  app.get('/api/slides', (req,res)=>res.json(loadJSON(SLIDES_FILE,[])));
  app.get('/api/slides/:id', (req,res)=>{
    const slides=loadJSON(SLIDES_FILE,[]);
    const s=slides.find(x=>x.id==req.params.id);
    if(!s) return res.status(404).json({error:'Not found'});
    res.json({slide:s});
  });
  app.get('/api/groups', (req,res)=>res.json(loadJSON(GROUPS_FILE,[])));
  app.get('/api/images/:name', (req,res)=>{
    const p=path.join(IMG_DIR, path.basename(req.params.name));
    if(!fs.existsSync(p)) return res.status(404).json({error:'Image not found'});
    res.sendFile(p);
  });
}

/* ===== ADMIN API ROUTES ===== */
function setupAdminAPI(app){
  app.post('/api/auth/login', loginLimiter, (req,res)=>{
    const {username, password}=req.body||{};
    if(!username||!password) return res.status(400).json({error:'Missing credentials'});
    const auth=loadJSON(AUTH_FILE,{users:[]});
    const user=auth.users.find(u=>u.username===username);
    if(!user||!bcrypt.compareSync(password,user.password)) return res.status(401).json({error:'Invalid credentials'});
    const token=jwt.sign({username}, JWT_SECRET, {expiresIn:'7d'});
    res.json({token, username});
  });
  app.post('/api/auth/change-password', authMW, (req,res)=>{
    const {oldPassword,newPassword}=req.body||{};
    const auth=loadJSON(AUTH_FILE,{users:[]});
    const user=auth.users.find(u=>u.username===req.user.username);
    if(!user||!bcrypt.compareSync(oldPassword,user.password)) return res.status(403).json({error:'Wrong password'});
    if(!newPassword||newPassword.length<6) return res.status(400).json({error:'Password must be at least 6 characters'});
    user.password=bcrypt.hashSync(newPassword,10); saveJSON(AUTH_FILE,auth);
    res.json({ok:true});
  });
  app.put('/api/config', authMW, (req,res)=>{
    const merged={...loadJSON(CONFIG_FILE),...req.body,id:'global'}; saveJSON(CONFIG_FILE,merged); res.json(merged);
  });
  app.put('/api/layouts/:tvId', authMW, (req,res)=>{
    const all=loadJSON(LAYOUTS_FILE); all[req.params.tvId]={...req.body,tvId:req.params.tvId}; saveJSON(LAYOUTS_FILE,all); res.json(all[req.params.tvId]);
  });
  app.post('/api/slides', authMW, (req,res)=>{
    const slides=loadJSON(SLIDES_FILE,[]); const s=req.body; if(!s.id) s.id=Date.now()+Math.floor(Math.random()*1000); slides.push(s); saveJSON(SLIDES_FILE,slides); res.json(s);
  });
  app.put('/api/slides/:id', authMW, (req,res)=>{
    let slides=loadJSON(SLIDES_FILE,[]); const idx=slides.findIndex(x=>x.id==req.params.id); if(idx<0) return res.status(404).json({error:'Not found'});
    slides[idx]={...slides[idx],...req.body,id:Number(req.params.id)}; saveJSON(SLIDES_FILE,slides); res.json(slides[idx]);
  });
  app.delete('/api/slides/:id', authMW, (req,res)=>{
    let slides=loadJSON(SLIDES_FILE,[]); const slide=slides.find(x=>x.id==req.params.id);
    slides=slides.filter(x=>x.id!=req.params.id); saveJSON(SLIDES_FILE,slides);
    if(slide?.imageFilename){ try{fs.unlinkSync(path.join(IMG_DIR,slide.imageFilename));}catch(e){} }
    res.json({ok:true});
  });
  app.post('/api/slides/bulk', authMW, (req,res)=>{
    const slides=loadJSON(SLIDES_FILE,[]); const incoming=req.body.slides||[]; incoming.forEach(s=>{if(!s.id) s.id=Date.now()+Math.floor(Math.random()*1000); slides.push(s);}); saveJSON(SLIDES_FILE,slides); res.json({ok:true,count:incoming.length});
  });
  app.post('/api/groups', authMW, (req,res)=>{
    const groups=loadJSON(GROUPS_FILE,[]); const g=req.body; if(!g.id) g.id=Date.now()+Math.floor(Math.random()*1000); groups.push(g); saveJSON(GROUPS_FILE,groups); res.json(g);
  });
  app.put('/api/groups/:id', authMW, (req,res)=>{
    let groups=loadJSON(GROUPS_FILE,[]); const idx=groups.findIndex(x=>x.id==req.params.id); if(idx<0) return res.status(404).json({error:'Not found'});
    groups[idx]={...groups[idx],...req.body,id:Number(req.params.id)}; saveJSON(GROUPS_FILE,groups); res.json(groups[idx]);
  });
  app.delete('/api/groups/:id', authMW, (req,res)=>{
    let groups=loadJSON(GROUPS_FILE,[]); groups=groups.filter(x=>x.id!=req.params.id); saveJSON(GROUPS_FILE,groups); res.json({ok:true});
  });
  app.post('/api/upload', authMW, upload.array('images',50), (req,res)=>{
    const files=(req.files||[]).map(f=>({filename:f.filename, originalName:f.originalname, url:'/api/images/'+f.filename}));
    res.json({files});
  });
}

/* ===== ERROR HANDLER ===== */
function setupErrorHandler(app){
  app.use((err,req,res,next)=>{
    if(err instanceof multer.MulterError){
      if(err.code==='LIMIT_FILE_SIZE') return res.status(413).json({error:'File too large. Max 20MB.'});
      if(err.code==='LIMIT_FILE_COUNT') return res.status(413).json({error:'Too many files. Max 50.'});
      return res.status(400).json({error:err.message});
    }
    console.error(err);
    res.status(err.status||500).json({error:err.message||'Internal error'});
  });
}

/* ===== STATIC ASSETS (nur Assets, keine HTML-Roots) ===== */
function serveStaticAssets(app){
  ['/css','/js','/img','/lib'].forEach(p=>{
    app.use(p, express.static(path.join(ROOT_DIR, p.slice(1))));
  });
  app.use('/images', express.static(IMG_DIR));
  app.use('/unpkg', express.static(path.join(ROOT_DIR, 'node_modules')));
}

/* ===== COMMON MIDDLEWARE ===== */
function commonMW(app){
  app.use(helmet({contentSecurityPolicy:false}));
  app.use(express.json({limit:'50mb'}));
  app.use(express.urlencoded({extended:true,limit:'50mb'}));
  app.use(cors());
}

/* ===== DEV: only Admin + TV-Left ===== */

const adminApp = express();
commonMW(adminApp);
adminApp.use('/api/', apiLimiter);
setupPublicAPI(adminApp); setupAdminAPI(adminApp);
serveStaticAssets(adminApp);
adminApp.get('/', (req,res)=>res.sendFile(path.join(ROOT_DIR,'index.html')));
setupErrorHandler(adminApp);
const adminServer = adminApp.listen(8095, '0.0.0.0', ()=>{
  console.log(`\n🖥️  DEV-Admin  http://localhost:8095   → index.html`);
});

function hardenTV(app){
  app.use((req,res,next)=>{
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");
    next();
  });
}

const tvLeftApp = express();
commonMW(tvLeftApp);
hardenTV(tvLeftApp);
setupPublicAPI(tvLeftApp);
serveStaticAssets(tvLeftApp);
tvLeftApp.get('/', (req,res)=>res.sendFile(path.join(ROOT_DIR,'tv-left.html')));
setupErrorHandler(tvLeftApp);
const tvLeftServer = tvLeftApp.listen(8096, '0.0.0.0', ()=>{
  console.log(`📺 DEV-TVLeft http://localhost:8096   → tv-left.html`);
});

console.log(`\n🎬 PINEA DEV läuft auf Ports 8095 + 8096\n`);

process.on('SIGTERM', ()=>{ 
  adminServer.close(()=>tvLeftServer.close(()=>process.exit(0))); 
});
process.on('SIGINT',  ()=>{ 
  adminServer.close(()=>tvLeftServer.close(()=>process.exit(0))); 
});
