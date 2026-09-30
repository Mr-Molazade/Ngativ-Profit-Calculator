const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];

const state = {
  items: [],
  avifSupported: false,
  settingsKey: "ngativ-image-optimizer-settings-v1"
};

const els = {
  fileInput: $("#fileInput"),
  chooseBtn: $("#chooseBtn"),
  dropzone: $("#dropzone"),
  queue: $("#queue"),
  format: $("#format"),
  quality: $("#quality"),
  qualityOut: $("#qualityOut"),
  maxW: $("#maxW"),
  maxH: $("#maxH"),
  targetToggle: $("#targetToggle"),
  targetKB: $("#targetKB"),
  jpegBg: $("#jpegBg"),
  jpegBgText: $("#jpegBgText"),
  stripMeta: $("#stripMeta"),
  smartNames: $("#smartNames"),
  keepFolder: $("#keepFolder"),
  optimizeAllBtn: $("#optimizeAllBtn"),
  clearBtn: $("#clearBtn"),
  resetSettingsBtn: $("#resetSettingsBtn"),
  fileCount: $("#fileCount"),
  beforeSize: $("#beforeSize"),
  afterSize: $("#afterSize"),
  savedSize: $("#savedSize"),
  summaryBar: $("#summaryBar"),
  formatSupport: $("#formatSupport"),
  previewModal: $("#previewModal"),
  modalClose: $("#modalClose"),
  modalTitle: $("#modalTitle"),
  modalStats: $("#modalStats"),
  beforeImg: $("#beforeImg"),
  afterImg: $("#afterImg"),
};

const fa = n => new Intl.NumberFormat("fa-IR").format(n);
const fmtBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "۰ B";
  const units = ["B","KB","MB","GB"];
  let i = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1);
  const v = bytes / Math.pow(1024,i);
  return `${fa(v < 10 && i ? v.toFixed(1) : Math.round(v))} ${units[i]}`;
};
const pct = n => `${fa(Math.max(0, Math.round(n)))}٪`;
const extFor = mime => ({ "image/webp":"webp","image/avif":"avif","image/jpeg":"jpg","image/png":"png" }[mime] || "img");

function saveSettings(){
  const s = {
    format: els.format.value, quality: +els.quality.value, maxW:+els.maxW.value, maxH:+els.maxH.value,
    targetToggle: els.targetToggle.checked, targetKB:+els.targetKB.value, jpegBg:els.jpegBg.value,
    stripMeta:els.stripMeta.checked, smartNames:els.smartNames.checked, keepFolder:els.keepFolder.checked
  };
  localStorage.setItem(state.settingsKey, JSON.stringify(s));
}
function loadSettings(){
  try{
    const s = JSON.parse(localStorage.getItem(state.settingsKey) || "null");
    if(!s) return;
    for(const [k,v] of Object.entries(s)){
      if(k in els){
        if(els[k].type === "checkbox") els[k].checked = !!v;
        else els[k].value = v;
      }
    }
  }catch{}
}
function resetSettings(){
  localStorage.removeItem(state.settingsKey);
  location.reload();
}
function supports(mime){
  const c=document.createElement("canvas");
  try{return c.toDataURL(mime).startsWith("data:"+mime)}
  catch{return false}
}
function updateSupport(){
  state.avifSupported = supports("image/avif");
  els.formatSupport.textContent = state.avifSupported ? "AVIF پشتیبانی می‌شود" : "AVIF پشتیبانی نشد";
  els.formatSupport.style.color = state.avifSupported ? "var(--accent)" : "#98a096";
  [...els.format.options].forEach(o=>{
    if(o.value==="avif") o.disabled = !state.avifSupported;
  });
  if(!state.avifSupported && els.format.value==="avif") els.format.value="webp";
}
function markFormatUI(){
  const png = els.format.value === "png";
  els.targetToggle.disabled = png;
  els.targetKB.disabled = png;
  if(png) els.targetToggle.checked = false;
  saveSettings();
}
function calcCanvasSize(w,h,maxW,maxH){
  const scale=Math.min(1,maxW/w,maxH/h);
  return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale))};
}
async function loadImage(file){
  const url=URL.createObjectURL(file);
  try{
    const img = await new Promise((resolve,reject)=>{
      const i=new Image();
      i.onload=()=>resolve(i);
      i.onerror=reject;
      i.src=url;
    });
    return {img,w:img.naturalWidth,h:img.naturalHeight,url};
  }catch(e){ URL.revokeObjectURL(url); throw e; }
}
function toBlob(canvas,mime,quality){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(b=>b?resolve(b):reject(new Error("encoding failed")),mime,quality);
  });
}
async function encode(item, qualityOverride=null){
  const s=getSettings();
  const {img,w,h}=item.decoded;
  const size=calcCanvasSize(w,h,s.maxW,s.maxH);
  const canvas=document.createElement("canvas");
  canvas.width=size.w; canvas.height=size.h;
  const ctx=canvas.getContext("2d",{alpha:true});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";

  const mime = s.format === "webp" ? "image/webp" :
               s.format === "avif" ? "image/avif" :
               s.format === "jpeg" ? "image/jpeg" : "image/png";

  if(mime==="image/jpeg"){
    ctx.fillStyle=s.jpegBg; ctx.fillRect(0,0,size.w,size.h);
  }
  ctx.drawImage(img,0,0,size.w,size.h);

  let q = qualityOverride ?? (s.quality/100);
  return {blob:await toBlob(canvas,mime,q), width:size.w,height:size.h,mime};
}
function getSettings(){
  return {
    format:els.format.value, quality:+els.quality.value,
    maxW:Math.max(100,+els.maxW.value||1800), maxH:Math.max(100,+els.maxH.value||1800),
    targetToggle:els.targetToggle.checked, targetKB:Math.max(20,+els.targetKB.value||220),
    jpegBg:els.jpegBg.value, stripMeta:els.stripMeta.checked, smartNames:els.smartNames.checked,
    keepFolder:els.keepFolder.checked
  };
}
async function encodeTarget(item){
  const s=getSettings();
  if(s.format==="png" || !s.targetToggle) return encode(item);
  const target=s.targetKB*1024;
  let lo=0.1,hi=1,best=null;
  for(let i=0;i<8;i++){
    const mid=(lo+hi)/2;
    const result=await encode(item,mid);
    if(result.blob.size<=target){best=result;lo=mid;}
    else hi=mid;
  }
  return best || await encode(item,lo);
}

function outputName(originalName){
  const s=getSettings();
  const dot=originalName.lastIndexOf(".");
  const base=dot>0?originalName.slice(0,dot):originalName;
  const suffix=s.smartNames?"-optimized":"";
  return `${base}${suffix}.${extFor(getMime())}`;
}
function getMime(){
  return ({webp:"image/webp",avif:"image/avif",jpeg:"image/jpeg",png:"image/png"})[els.format.value];
}
function addFiles(files){
  const images=[...files].filter(f=>f.type.startsWith("image/"));
  if(!images.length) return;
  if(state.items.length===0) els.queue.innerHTML="";
  for(const file of images){
    const item={
      id:crypto.randomUUID(),file,decoded:null,output:null,previewUrl:null,originalUrl:URL.createObjectURL(file),status:"waiting"
    };
    item.card=buildCard(item);
    state.items.push(item);
    decodeItem(item);
  }
  updateSummary();
}
async function decodeItem(item){
  try{
    item.decoded=await loadImage(item.file);
    $(".thumb",item.card).src=item.originalUrl;
    $(".file-dimensions",item.card).textContent=`${fa(item.decoded.w)} × ${fa(item.decoded.h)} px`;
    $(".orig-size",item.card).textContent=fmtBytes(item.file.size);
  }catch{
    setStatus(item,"error","خطا در خواندن");
  }
}
function buildCard(item){
  const node=$("#itemTemplate").content.firstElementChild.cloneNode(true);
  node.querySelector(".file-name").textContent=item.file.name;
  node.querySelector(".orig-size").textContent=fmtBytes(item.file.size);
  node.querySelector(".preview-btn").addEventListener("click",()=>openPreview(item));
  node.querySelector(".download-btn").addEventListener("click",()=>downloadItem(item));
  return node;
}
function setStatus(item,type,label){
  item.status=type;
  const s=$(".item-status",item.card);
  s.className=`item-status status-${type}`;
  s.textContent=label;
}
async function optimizeItem(item){
  if(!item.decoded) await decodeItem(item);
  if(!item.decoded) throw new Error("decode");
  setStatus(item,"processing","در حال بهینه‌سازی");
  $(".progress span",item.card).style.width="25%";
  await new Promise(r=>requestAnimationFrame(r));
  const result=await encodeTarget(item);
  item.output=result;
  item.previewUrl=URL.createObjectURL(result.blob);
  $(".progress span",item.card).style.width="100%";
  $(".out-size",item.card).textContent=fmtBytes(result.blob.size);
  const saved=(1-result.blob.size/item.file.size)*100;
  $(".saving",item.card).textContent=saved>=0?pct(saved):`+${pct(-saved)}`;
  $(".saving",item.card).style.color=saved>=0?"var(--accent)":"#ff9d9d";
  $(".thumb",item.card).src=item.previewUrl;
  $(".thumb-badge",item.card).textContent=extFor(result.mime).toUpperCase();
  $(".download-btn",item.card).disabled=false;
  setStatus(item,"done",saved>=0?"آماده":"حجم بیشتر شد");
  return result;
}
async function optimizeAll(){
  const btn=els.optimizeAllBtn;
  if(!state.items.length){flashButton(btn,"ابتدا عکس اضافه کن");return}
  btn.disabled=true;
  btn.textContent="در حال بهینه‌سازی…";
  saveSettings();
  for(const item of state.items){
    try{ await optimizeItem(item); }catch{ setStatus(item,"error","خطا"); }
  }
  btn.disabled=false;
  btn.textContent="بهینه‌سازی همه";
  updateSummary();
}
function downloadItem(item){
  if(!item.output) return;
  const a=document.createElement("a");
  a.href=item.previewUrl;
  a.download=outputName(item.file.name);
  document.body.appendChild(a);a.click();a.remove();
}
async function downloadAllZip(){
  const ready=state.items.filter(x=>x.output);
  if(!ready.length) return;
  const zip=await makeZip(ready.map(item=>({name:outputName(item.file.name),data:item.output.blob})));
  const url=URL.createObjectURL(zip);
  const a=document.createElement("a"); a.href=url; a.download="ngativ-optimized-images.zip"; document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function updateSummary(){
  els.fileCount.textContent=fa(state.items.length);
  const before=state.items.reduce((a,x)=>a+x.file.size,0);
  const done=state.items.filter(x=>x.output);
  const after=done.reduce((a,x)=>a+x.output.blob.size,0);
  els.beforeSize.textContent=fmtBytes(before);
  els.afterSize.textContent=done.length?fmtBytes(after):"—";
  if(done.length){
    const saved=before-after;
    els.savedSize.textContent=saved>=0?`${fmtBytes(saved)} (${pct((saved/before)*100)})`:`+${fmtBytes(-saved)}`;
  }else els.savedSize.textContent="—";
  let zipBtn=els.summaryBar.querySelector(".zip-btn");
  if(done.length && !zipBtn){
    zipBtn=document.createElement("button"); zipBtn.className="ghost-btn zip-btn"; zipBtn.textContent="دانلود ZIP";
    zipBtn.addEventListener("click",downloadAllZip); els.summaryBar.appendChild(zipBtn);
  }else if(zipBtn){zipBtn.style.display=done.length?"block":"none"}
}
function clearAll(){
  state.items.forEach(x=>{URL.revokeObjectURL(x.originalUrl); if(x.previewUrl) URL.revokeObjectURL(x.previewUrl); if(x.decoded?.url) URL.revokeObjectURL(x.decoded.url)});
  state.items=[];
  els.queue.innerHTML=`<div class="empty-state"><div class="empty-orb">◌</div><h3>هنوز تصویری اضافه نشده</h3><p>با چند فایل شروع کن؛ نتیجه و درصد فشرده‌سازی همین‌جا نمایش داده می‌شود.</p></div>`;
  updateSummary();
}
function openPreview(item){
  if(!item.output) return;
  els.previewModal.classList.add("open");
  els.previewModal.setAttribute("aria-hidden","false");
  els.modalTitle.textContent=item.file.name;
  els.modalStats.textContent=`${fmtBytes(item.file.size)} ← ${fmtBytes(item.output.blob.size)} • ${item.output.width}×${item.output.height}px`;
  els.beforeImg.src=item.originalUrl;
  els.afterImg.src=item.previewUrl;
}
function closePreview(){els.previewModal.classList.remove("open");els.previewModal.setAttribute("aria-hidden","true")}
function flashButton(btn,text){
  const old=btn.textContent; btn.textContent=text; setTimeout(()=>btn.textContent=old,1400);
}

/* Minimal dependency-free ZIP writer (stored method, because WebP/AVIF/JPEG/PNG are already compressed). */
function crc32(bytes){
  let c=0xffffffff;
  for(let i=0;i<bytes.length;i++){
    c^=bytes[i];
    for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concat(parts){
  const total=parts.reduce((s,p)=>s+p.length,0); const out=new Uint8Array(total); let o=0;
  for(const p of parts){out.set(p,o);o+=p.length} return out;
}
function enc(s){return new TextEncoder().encode(s)}
async function makeZip(entries){
  const local=[], central=[]; let offset=0;
  const now=new Date(); const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(Math.floor(now.getSeconds()/2));
  const dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const e of entries){
    const data=new Uint8Array(await e.data.arrayBuffer());
    const name=enc(e.name); const crc=crc32(data);
    const lh=concat([
      new Uint8Array([0x50,0x4b,0x03,0x04]),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data
    ]);
    local.push(lh);
    const ch=concat([
      new Uint8Array([0x50,0x4b,0x01,0x02]),u16(20),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name
    ]);
    central.push(ch); offset+=lh.length;
  }
  const centralData=concat(central);
  const end=concat([new Uint8Array([0x50,0x4b,0x05,0x06]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralData.length),u32(offset),u16(0)]);
  return new Blob([concat([...local,centralData,end])],{type:"application/zip"});
}

els.chooseBtn.addEventListener("click",()=>els.fileInput.click());
els.fileInput.addEventListener("change",e=>{addFiles(e.target.files); e.target.value=""});
["dragenter","dragover"].forEach(ev=>els.dropzone.addEventListener(ev,e=>{e.preventDefault();els.dropzone.classList.add("dragging")}));
["dragleave","drop"].forEach(ev=>els.dropzone.addEventListener(ev,e=>{e.preventDefault();els.dropzone.classList.remove("dragging")}));
els.dropzone.addEventListener("drop",e=>addFiles(e.dataTransfer.files));
document.addEventListener("paste",e=>{
  const imgs=[...e.clipboardData.items].filter(i=>i.type.startsWith("image/")).map(i=>i.getAsFile()).filter(Boolean);
  if(imgs.length)addFiles(imgs);
});
els.quality.addEventListener("input",()=>{els.qualityOut.textContent=`${fa(els.quality.value)}٪`;saveSettings()});
els.format.addEventListener("change",markFormatUI);
els.jpegBg.addEventListener("input",()=>{els.jpegBgText.textContent=els.jpegBg.value.toUpperCase();saveSettings()});
[els.maxW,els.maxH,els.targetKB,els.stripMeta,els.smartNames,els.keepFolder,els.targetToggle].forEach(el=>el.addEventListener("change",saveSettings));
els.optimizeAllBtn.addEventListener("click",optimizeAll);
els.clearBtn.addEventListener("click",clearAll);
els.resetSettingsBtn.addEventListener("click",resetSettings);
els.modalClose.addEventListener("click",closePreview);
els.previewModal.addEventListener("click",e=>{if(e.target===els.previewModal)closePreview()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closePreview(); if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="o"){e.preventDefault();els.fileInput.click()}});

loadSettings();
els.qualityOut.textContent=`${fa(els.quality.value)}٪`;
els.jpegBgText.textContent=els.jpegBg.value.toUpperCase();
updateSupport();
markFormatUI();
updateSummary();
