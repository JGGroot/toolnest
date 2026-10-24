import {pathToFileURL} from 'node:url';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.TOOLNEST_PLAYWRIGHT?pathToFileURL(process.env.TOOLNEST_PLAYWRIGHT).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TOOLNEST_CHANNEL?{channel:process.env.TOOLNEST_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],remote=[];
if(process.env.TOOLNEST_FORCE_WASM)await page.route('**/segment-worker.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:"Object.defineProperty(self.navigator,'gpu',{value:undefined});\n"+await response.text()});});
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://localhost:3000/'))remote.push({url:r.url(),method:r.method()});});
page.on('console',m=>{if(m.type()==='error')console.log('Browser:',m.text().slice(0,300));});
await page.goto((process.env.TOOLNEST_URL||'http://localhost:3000/')+'?sample');await page.waitForFunction(()=>document.querySelectorAll('.tool-item').length===3);
assert.equal(remote.length,0,'Startup loaded an external runtime or model');
const reports=[];
try{for(const file of [null,...process.argv.slice(2)]){

 console.log('Testing',file||'Generated sample');
 const report=await page.evaluate(async ({file,bytes})=>{
  const [{prepareCapture},{makeFixture},{loadSegmenter},{maskToPaths,normalizedPrompts,insidePath},{DEFAULT_SETTINGS},{bounds,polygonArea}]=await Promise.all([import('./capture-model.js?v=20261025-tch1'),import('./fixtures.js?v=20261025-tch1'),import('./segment.js?v=20261025-tch1'),import('./segment-model.js?v=20261025-tch1'),import('./preview-model.js?v=20261025-tch1'),import('./vision.js?v=20261025-tch1')]);
  let image;if(file){const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))])),ratio=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();image=ctx.getImageData(0,0,canvas.width,canvas.height);}else image=makeFixture();
  let capture;try{capture=prepareCapture(image,{...DEFAULT_SETTINGS,paper:'a4'});}catch(e){return {file,error:'Calibration: '+e.message};}const {rect,paths,paper}=capture;
  const distance=(p,poly)=>Math.min(...poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}));
  const chosen=paths.slice(0,3).map(poly=>{const b=bounds(poly);let point=null,best=-1;for(let y=b.minY;y<=b.maxY;y+=1.5)for(let x=b.minX;x<=b.maxX;x+=1.5)if(insidePath({x,y},poly)){const d=distance([x,y],poly);if(d>best){best=d;point={x,y,label:1};}}return {point,poly};});const engines={};
  for(const engine of ['mediapipe']){try{const model=await loadSegmenter(engine),tools=[];for(const {point,poly} of chosen){if(!point)continue;const result=await (await import('./segment-tap.js?v=20261025-tch1')).segmentTap(model,rect,[point]),out=maskToPaths(result,rect,paper,{points:[point]}),b=out[0]?bounds(out[0]):null,ref=bounds(poly);let maxError=null;if(out[0])maxError=Math.max(...out[0].map(p=>distance(p,poly)),...poly.map(p=>distance(p,out[0])));tools.push({point,timing:result.timing,paths:out.length,maxEdgeDifferenceMm:maxError,referenceSize:[ref.maxX-ref.minX,ref.maxY-ref.minY],size:b?[b.maxX-b.minX,b.maxY-b.minY]:null,area:out[0]?polygonArea(out[0]):null});}engines[engine]=tools;}catch(e){engines[engine]={error:e.message};}}
  return {file:file||'generated sample',size:[rect.width,rect.height],origin:rect.origin,referenceTools:paths.length,engines};
 },{file,bytes:file?(await readFile(file)).toString('base64'):null});reports.push(report);console.log(JSON.stringify(report));}
 assert.deepEqual(errors,[]);assert.ok(remote.every(r=>r.method==='GET'),'A tracing request sent data off-device');
 if(process.env.TOOLNEST_REPORT)await writeFile(process.env.TOOLNEST_REPORT,JSON.stringify({reports,remote,errors},null,2));
}finally{await browser.close();}
