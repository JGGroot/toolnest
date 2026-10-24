const MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
async function download(url,progress){const r=await fetch(url,{credentials:'omit'});if(!r.ok)throw Error(`Model download failed (${r.status}).`);const total=+r.headers.get('content-length')||0,reader=r.body.getReader(),chunks=[];let loaded=0;for(;;){const {value,done}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;progress({phase:'download',loaded,total});}const out=new Uint8Array(loaded);let n=0;for(const chunk of chunks){out.set(chunk,n);n+=chunk.length;}return out;}
function canvasFor(image){const ratio=Math.min(1,1024/Math.max(image.width,image.height)),source=new OffscreenCanvas(image.width,image.height),ctx=source.getContext('2d');const data=new Uint8ClampedArray(image.data);for(let i=0;i<data.length;i+=4)if(!data[i+3]){data[i]=data[i+1]=data[i+2]=255;data[i+3]=255;}ctx.putImageData(new ImageData(data,image.width,image.height),0,0);const canvas=new OffscreenCanvas(Math.max(2,Math.round(image.width*ratio)),Math.max(2,Math.round(image.height*ratio)));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);return canvas;}
export async function createSegmenter(engine,progress,{light=false}={}){const started=performance.now();progress({phase:'runtime'});
 if(engine==='mediapipe'){
  const {FilesetResolver,InteractiveSegmenter}=await import(MP+'/vision_bundle.mjs'),bytes=await download('https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',progress),files=await FilesetResolver.forVisionTasks(MP+'/wasm');let model,device='GPU';
  const create=delegate=>InteractiveSegmenter.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes,delegate},outputConfidenceMasks:true,outputCategoryMask:false,canvas:new OffscreenCanvas(1024,1024)});
  progress({phase:'initializing'});try{model=await create('GPU');}catch{device='CPU';model=await create('CPU');}
  const loadMs=performance.now()-started;let canvas=null;const masks=new Map();
  const predict=p=>{let output;model.segment(canvas,{keypoint:{x:p.x,y:p.y}},result=>{const m=result.confidenceMasks[1]||result.confidenceMasks[0];output={mask:Uint8Array.from(m.getAsFloat32Array(),v=>v>.5?1:0),width:m.width,height:m.height};});return output;};
  return {async setImage(image,report){report({phase:'embedding'});canvas=canvasFor(image);masks.clear();},async segment(points){const t=performance.now();let output=null;
   for(const p of points){const key=p.x+','+p.y;let result=masks.get(key);if(!result){try{result=predict(p);}catch(e){if(device==='CPU')throw e;model.close();device='CPU';model=await create('CPU');result=predict(p);}masks.set(key,result);}if(!output)output={mask:new Uint8Array(result.mask.length),width:result.width,height:result.height};if(p.label===1)for(let i=0;i<result.mask.length;i++)output.mask[i]|=result.mask[i];}
   // Legacy MagicTouch has one point per inference; background taps subtract its region.
   for(const p of points.filter(p=>p.label===0)){const result=masks.get(p.x+','+p.y);for(let i=0;i<result.mask.length;i++)if(result.mask[i])output.mask[i]=0;}
   return {candidates:[{mask:output.mask,score:1}],width:output.width,height:output.height,timing:{loadMs,embeddingMs:0,tapMs:performance.now()-t,device,modelBytes:bytes.length}};
  }};
 }
 throw Error('Unknown segmentation engine.');
}
