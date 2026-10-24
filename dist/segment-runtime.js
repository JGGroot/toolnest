import {bestMask} from './segment-model.js?v=20261025-seg5';
const MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21',HF='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/dist/transformers.min.js';
const MODEL='Xenova/slimsam-77-uniform',REVISION='5850ab45f587c112167512ffef949107115e26a0';
async function download(url,progress){const r=await fetch(url,{credentials:'omit'});if(!r.ok)throw Error(`Model download failed (${r.status}).`);const total=+r.headers.get('content-length')||0,reader=r.body.getReader(),chunks=[];let loaded=0;for(;;){const {value,done}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;progress({phase:'download',loaded,total});}const out=new Uint8Array(loaded);let n=0;for(const chunk of chunks){out.set(chunk,n);n+=chunk.length;}return out;}
function canvasFor(image){const ratio=Math.min(1,1024/Math.max(image.width,image.height)),source=new OffscreenCanvas(image.width,image.height),ctx=source.getContext('2d');const data=new Uint8ClampedArray(image.data);for(let i=0;i<data.length;i+=4)if(!data[i+3]){data[i]=data[i+1]=data[i+2]=255;data[i+3]=255;}ctx.putImageData(new ImageData(data,image.width,image.height),0,0);const canvas=new OffscreenCanvas(Math.max(2,Math.round(image.width*ratio)),Math.max(2,Math.round(image.height*ratio)));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);return canvas;}
// `light` (phones): SAM uses its 8-bit weights on the CPU path; full-precision WebGPU crashed phone browsers.
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
 const {SamModel,AutoProcessor,RawImage,Tensor,env}=await import(HF);env.allowLocalModels=false;env.useBrowserCache=true;env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;let model,device='wasm';
 const report=p=>progress({phase:p.status==='progress'?'download':'initializing',loaded:p.loaded,total:p.total,file:p.file});
 const options={revision:REVISION,progress_callback:report};progress({phase:'initializing'});
 // SlimSAM runs on the CPU with 8-bit weights everywhere: on WebGPU its answers degraded after a few
 // photos in one page (and it crashed phone browsers); 8-bit CPU results matched full precision in tests.
 const dtype='q8';
 if(!model)model=await SamModel.from_pretrained(MODEL,{...options,device:'wasm',dtype});
 const processor=await AutoProcessor.from_pretrained(MODEL,options),loadMs=performance.now()-started;let processed=null,embeddings=null,embeddingMs=0,fresh=false;
 return {async setImage(image,report){report({phase:'embedding'});for(const tensor of Object.values(embeddings||{}))tensor.dispose?.();const canvas=canvasFor(image),rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);const raw=new RawImage(rgba.data,canvas.width,canvas.height,4),t=performance.now();processed=await processor(raw);embeddings=await model.get_image_embeddings(processed);embeddingMs=performance.now()-t;fresh=true;},async segment(points,box){const t=performance.now(),[h,w]=processed.reshaped_input_sizes[0],input_boxes=box?new Tensor('float32',Float32Array.from([box[0]*w,box[1]*h,box[2]*w,box[3]*h]),[1,1,4]):null,input_points=new Tensor('float32',Float32Array.from(points.flatMap(p=>[p.x*w,p.y*h])),[1,1,points.length,2]),input_labels=new Tensor('int64',BigInt64Array.from(points.map(p=>BigInt(p.label))),[1,1,points.length]);let output;
  try{output=await model({...embeddings,input_points,input_labels,...(input_boxes?{input_boxes}:{})});const masks=await processor.post_process_masks(output.pred_masks,processed.original_sizes,processed.reshaped_input_sizes),image=RawImage.fromTensor(masks[0][0]),candidates=Array.from({length:image.channels},(_,c)=>{const mask=new Uint8Array(image.width*image.height);for(let i=0;i<mask.length;i++)mask[i]=image.data[i*image.channels+c]?1:0;return {mask,score:output.iou_scores.data[c]};});const timing={loadMs,embeddingMs:fresh?embeddingMs:0,tapMs:performance.now()-t,device,modelBytes:13786000};fresh=false;for(const group of masks)group.dispose?.();return {candidates,width:image.width,height:image.height,timing};}finally{input_boxes?.dispose?.();input_points.dispose?.();input_labels.dispose?.();output?.pred_masks.dispose?.();output?.iou_scores.dispose?.();}
 }};
}
