import assert from 'node:assert/strict';
import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {DEFAULT_SETTINGS} from '../dist/preview-model.js';
const browser=await chromium.launch({executablePath:process.env.TOOLNEST_BROWSER||'/usr/bin/chromium',headless:true,proxy:process.env.TOOLNEST_PROXY?{server:process.env.TOOLNEST_PROXY}:undefined,args:['--no-sandbox']});
const ready=p=>p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');
const curve=p=>p.locator('.tool-path').first().getAttribute('d');
const errors=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1.5,hasTouch:width===390,isMobile:width===390}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.TOOLNEST_URL||'http://127.0.0.1:3000');await p.waitForFunction(()=>document.querySelectorAll('.tool-path').length===3);await ready(p);
 const project={...DEFAULT_SETTINGS,format:'toolnest-project',version:2,paper:'a4',name:'Finger live',tools:[{name:'Smooth grip',points:[[50,40],[70,40],[70,160],[50,160]]}],fingers:[{x:70,y:100,r:8,tool:0}]};
 await p.locator('#projectInput').setInputFiles({name:'finger.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.locator('#traceStudioBtn').click();await ready(p);
 const original=await curve(p),finger=p.locator('[data-finger="0"]');
 const from=await finger.evaluate(el=>{const q=new DOMPoint(+el.getAttribute('cx')+6,+el.getAttribute('cy')).matrixTransform(el.getScreenCTM());return {x:q.x,y:q.y};});
 await p.mouse.move(from.x,from.y);await p.mouse.down();let previous=original;
 for(const dy of [10,22,34]){
  await p.mouse.move(from.x+7,from.y+dy);await p.waitForFunction(before=>{const el=document.querySelector('.tool-path');return el&&el.getAttribute('d')!==before&&document.getElementById('previewStatus').dataset.state==='ready';},previous);
  const now=await curve(p);assert.notEqual(now,previous,'actual boolean cutout must update while held');previous=now;
  assert.ok(Math.abs(+(await finger.getAttribute('cx'))-70)<.0001,'grip must stay on the edge live');
  assert.equal(await p.locator('#exportBtn').isDisabled(),true);
 }
 const beforeRelease=await curve(p),center=await finger.getAttribute('cy');await p.mouse.up();await ready(p);assert.equal(await curve(p),beforeRelease,'finger cutout jumps on release');assert.equal(await finger.getAttribute('cy'),center,'center jumps on release');
 await p.locator('#undoBtn').click();await ready(p);assert.equal(await curve(p),original,'finger drag must be one undo');await p.locator('#redoBtn').click();await ready(p);assert.equal(await curve(p),beforeRelease);
 // Capture the actual generated profile for visual inspection, independent of
 // the dashed editing circle. Both export formats share this point geometry.
 const svg=await p.evaluate(()=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('xmlns',svg.namespaceURI);svg.setAttribute('viewBox','46 80 38 45');svg.setAttribute('width','760');svg.setAttribute('height','900');const path=document.querySelector('.tool-path').cloneNode(true);path.removeAttribute('class');path.setAttribute('fill','white');path.setAttribute('stroke','black');path.setAttribute('stroke-width','.08');svg.append(path);return svg.outerHTML;});
 const exported=await context.newPage();await exported.setContent(svg);await exported.screenshot({path:`/tmp/toolnest-finger-${width}.png`});await exported.close();
 console.log(`${width}: grip union updates while held; edge stays fixed; release, undo and redo preserve exact geometry`);await context.close();
}assert.deepEqual(errors,[]);}finally{await browser.close();}
