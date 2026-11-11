const TESSERACT_CDN="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const DATA_ROW_INDEXES=[0,1,2,4,5,6,8,9,10,12,13,14,15];
const FACTORY_IDS=["aro-1","aro-2","aro-3","sm-mailiao","sm-haifeng","phenol","longde-pia","mailiao-pta","hac","xingang-pabs","mailiao-pabs","pc","pp"];
const NUMERIC_CELLS=[[212,291],[291,351],[467,555],[555,614],[729,800],[800,860],[944,1040],[1040,1104]].map(([a,b])=>[a/1487,b/1487]);

function loadTesseract(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector("script[data-tesseract-loader]");
    if(existing){existing.addEventListener("load",()=>resolve(window.Tesseract),{once:true});existing.addEventListener("error",()=>reject(new Error("OCR 引擎載入失敗，請確認網路連線。")),{once:true});return;}
    const script=document.createElement("script");script.src=TESSERACT_CDN;script.async=true;script.dataset.tesseractLoader="1";
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error("OCR 引擎載入後未能初始化。"));
    script.onerror=()=>reject(new Error("OCR 引擎 CDN 無法連線，請稍後重試。"));document.head.appendChild(script);
  });
}
async function imageToCanvas(file){
  let bitmap;
  if(typeof createImageBitmap==="function"){
    try{bitmap=await createImageBitmap(file);}catch{}
  }
  const canvas=document.createElement("canvas");
  if(bitmap){
    const scale=Math.min(1,2200/bitmap.width);canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext("2d",{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return canvas;
  }
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error("圖片無法讀取。"));el.src=url;});
    const scale=Math.min(1,2200/img.naturalWidth);canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
    canvas.getContext("2d",{willReadFrequently:true}).drawImage(img,0,0,canvas.width,canvas.height);return canvas;
  }finally{URL.revokeObjectURL(url);}
}
function detectBodyRows(canvas){
  const {width:w,height:h}=canvas,data=canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const x0=Math.floor(w*.01),x1=Math.floor(w*.99),threshold=Math.floor(w*.30),candidates=[];
  for(let y=Math.floor(h*.17);y<Math.floor(h*.96);y++){
    let dark=0;
    for(let x=x0;x<x1;x++){const p=(y*w+x)*4;const gray=(data[p]*299+data[p+1]*587+data[p+2]*114)/1000;if(gray<150)dark++;}
    if(dark>threshold)candidates.push(y);
  }
  const clusters=[];
  for(const y of candidates){if(!clusters.length||y-clusters[clusters.length-1].at(-1)>2)clusters.push([y]);else clusters[clusters.length-1].push(y);}
  let lines=clusters.map(c=>Math.round(c.reduce((a,b)=>a+b,0)/c.length));
  if(lines.length!==19&&lines.length>19){
    let best=null;
    for(let i=0;i<=lines.length-19;i++){
      const seq=lines.slice(i,i+19),gaps=seq.slice(1).map((v,j)=>v-seq[j]),mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
      if(mean<h*.018||mean>h*.06)continue;
      const variance=gaps.reduce((s,v)=>s+(v-mean)**2,0)/gaps.length;
      if(!best||variance<best.variance)best={seq,variance};
    }
    if(best)lines=best.seq;
  }
  if(lines.length!==19)throw new Error(`未能辨識標準表格的 18 個資料列（目前偵測到 ${Math.max(0,lines.length-1)} 列）。請使用完整、正向、未裁切的統計表圖片。`);
  const gaps=lines.slice(1).map((v,i)=>v-lines[i]),mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  if(gaps.some(g=>g<mean*.65||g>mean*1.4))throw new Error("表格列距差異過大，無法安全套用固定欄位定位。");
  return lines;
}
function cropCell(source,left,right,top,bottom,scale=3.6){
  const x0=Math.max(0,Math.floor(source.width*left)+6),x1=Math.min(source.width,Math.ceil(source.width*right)-6);
  const y0=Math.max(0,top+2),y1=Math.min(source.height,bottom-2),w=Math.max(1,x1-x0),h=Math.max(1,y1-y0);
  const out=document.createElement("canvas");out.width=Math.max(1,Math.round(w*scale));out.height=Math.max(1,Math.round(h*scale));
  const ctx=out.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,out.width,out.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(source,x0,y0,w,h,0,0,out.width,out.height);return out;
}
function parseSingleInteger(text){
  const digits=String(text||"").replace(/[^0-9]/g,"");
  if(!digits)return null;
  const value=Number(digits);
  return Number.isSafeInteger(value)&&value>=0?value:null;
}
export async function recognizeEquipmentTable(file,onProgress=()=>{}){
  if(!file||!/^image\/(png|jpeg)$/.test(file.type))throw new Error("請上傳 PNG 或 JPG 圖片。");
  if(file.size>12*1024*1024)throw new Error("圖片超過 12 MB，請先縮小圖片後再上傳。");
  onProgress({stage:"prepare",percent:4,message:"正在檢查圖片版型…"});
  const source=await imageToCanvas(file),lines=detectBodyRows(source),Tesseract=await loadTesseract();
  const rows=[];
  onProgress({stage:"engine",percent:8,message:"載入數字辨識引擎…"});
  const numberWorker=await Tesseract.createWorker("eng",1,{logger:m=>{
    if(m.status==="recognizing text")onProgress({stage:"ocr",percent:Math.min(86,8+Math.round((m.progress||0)*78)),message:`數字辨識中 ${Math.round((m.progress||0)*100)}%…`});
  }});
  try{
    await numberWorker.setParameters({tessedit_pageseg_mode:"8",tessedit_char_whitelist:"0123456789",classify_bln_numeric_mode:"1",user_defined_dpi:"300"});
    let completedCells=0;
    for(let i=0;i<DATA_ROW_INDEXES.length;i++){
      const idx=DATA_ROW_INDEXES[i],values=[],cellConfidences=[],rawCells=[];
      for(let j=0;j<NUMERIC_CELLS.length;j++){
        const [left,right]=NUMERIC_CELLS[j];
        const cellCanvas=cropCell(source,left,right,lines[idx],lines[idx+1],6);
        const {data}=await numberWorker.recognize(cellCanvas);
        const value=parseSingleInteger(data.text);
        values.push(value);cellConfidences.push(Number(data.confidence||0));rawCells.push(String(data.text||"").trim());
        completedCells++;
        onProgress({stage:"ocr",percent:8+Math.round(completedCells/(DATA_ROW_INDEXES.length*NUMERIC_CELLS.length)*76),
          message:`數字辨識 ${completedCells}/${DATA_ROW_INDEXES.length*NUMERIC_CELLS.length} 個欄位：${FACTORY_IDS[i]}`});
      }
      const ok=values.every(v=>v!==null);
      rows.push({factoryId:FACTORY_IDS[i],ok,values,rawCells,confidence:cellConfidences.length?cellConfidences.reduce((a,b)=>a+b,0)/cellConfidences.length:0});
    }
  }finally{await numberWorker.terminate();}
  onProgress({stage:"labels",percent:87,message:"辨識廠別名稱及表格備註…"});
  const textWorker=await Tesseract.createWorker(["chi_tra","eng"],1,{logger:m=>{
    if(m.status==="recognizing text")onProgress({stage:"labels",percent:Math.min(98,87+Math.round((m.progress||0)*10)),message:"辨識標題及備註…"});
  }});
  let labels=[],titleText="",notesText="";
  try{
    await textWorker.setParameters({tessedit_pageseg_mode:"7"});
    for(let i=0;i<DATA_ROW_INDEXES.length;i++){
      const idx=DATA_ROW_INDEXES[i],labelCanvas=cropCell(source,105/1487,212/1487,lines[idx],lines[idx+1],4);
      const {data}=await textWorker.recognize(labelCanvas);
      labels.push({factoryId:FACTORY_IDS[i],text:String(data.text||"").trim(),confidence:Number(data.confidence||0)});
    }
    const titleCanvas=document.createElement("canvas");titleCanvas.width=source.width;titleCanvas.height=Math.max(1,Math.floor(source.height*.12));
    titleCanvas.getContext("2d").drawImage(source,0,0,source.width,titleCanvas.height,0,0,source.width,titleCanvas.height);
    const titleResult=await textWorker.recognize(titleCanvas);titleText=String(titleResult.data.text||"").trim();
    await textWorker.setParameters({tessedit_pageseg_mode:"6"});
    const noteTop=lines[18]+3,noteCanvas=document.createElement("canvas");
    noteCanvas.width=source.width;noteCanvas.height=Math.max(1,source.height-noteTop);
    noteCanvas.getContext("2d").drawImage(source,0,noteTop,source.width,noteCanvas.height,0,0,source.width,noteCanvas.height);
    const noteResult=await textWorker.recognize(noteCanvas);notesText=String(noteResult.data.text||"").trim();
  }finally{await textWorker.terminate();}
  const okCount=rows.filter(r=>r.ok).length;
  onProgress({stage:"done",percent:100,message:`辨識完成：${okCount}/13 個廠別的 8 個數字欄位均已辨識。`});
  return {rows,labels,titleText,notesText,okCount,total:rows.length,imageWidth:source.width,imageHeight:source.height,bodyRowCount:18};
}
