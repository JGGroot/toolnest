// This module and every remote dependency are imported only once AI Trace is used.
const engines=new Map(),photos=new WeakMap();let photoSerial=0;
export function cancelSegmenter(engine){const entry=engines.get(engine);if(!entry)return;entry.worker.terminate();for(const job of entry.jobs.values()){clearTimeout(job.timer);job.reject(new DOMException('Cancelled','AbortError'));}engines.delete(engine);}
export async function loadSegmenter(engine,onProgress=()=>{},options={light:matchMedia('(pointer:coarse)').matches||(navigator.deviceMemory||8)<=4}){if(engine!=='mediapipe')throw Error('Unknown segmentation engine.');let e=engines.get(engine);
 if(!e){const worker=new Worker(new URL('./segment-worker.js?v=20261025-fpk2',import.meta.url)),jobs=new Map();e={worker,jobs,serial:0,photo:null,progress:onProgress};engines.set(engine,e);
  worker.onmessage=({data:m})=>{const job=jobs.get(m.id);if(!job)return;if(m.progress){job.progress?.(m.progress);return;}clearTimeout(job.timer);jobs.delete(m.id);m.error?job.reject(Error(m.error)):job.resolve(m.result);};worker.onerror=ev=>{for(const job of jobs.values()){clearTimeout(job.timer);job.reject(Error(ev.message||'Segmentation worker failed.'));}jobs.clear();worker.terminate();engines.delete(engine);};
  e.call=(type,data={},progress=e.progress)=>new Promise((resolve,reject)=>{const id=++e.serial,timer=setTimeout(()=>{jobs.delete(id);if(engines.get(engine)===e)cancelSegmenter(engine);reject(Error('Segmentation timed out. Try Smart edges.'));},180000);jobs.set(id,{resolve,reject,progress,timer});worker.postMessage({id,type,engine,options,...data});});
  e.ready=e.call('load').catch(error=>{if(engines.get(engine)===e)cancelSegmenter(engine);throw error;});
 }e.progress=onProgress;await e.ready;
 return {engine,light:!!options.light,async segment(imageData,points,box=null){let photo=photos.get(imageData);if(!photo){photo=++photoSerial;photos.set(imageData,photo);}const image=e.photo===photo?null:{width:imageData.width,height:imageData.height,data:imageData.data};const result=await e.call('segment',{image,photo,points,box});e.photo=photo;return result;}};
}
