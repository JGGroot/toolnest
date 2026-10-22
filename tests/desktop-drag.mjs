import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../dist/preview-model.js';
import {DEFAULT_FOAM,rectShape} from '../dist/foam-model.js';
const base=process.env.TOOLNEST_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:process.env.TOOLNEST_PROXY?{server:process.env.TOOLNEST_PROXY}:undefined,args:['--no-sandbox']});
const trace=[{name:'Wrench',points:[[45,55],[70,55],[70,120],[45,120]]},{name:'Driver',points:[[100,70],[120,70],[120,145],[100,145]]}];
const project={...DEFAULT_SETTINGS,format:'toolnest-project',version:2,name:'Drag regression',paper:'a4',tools:trace,fingers:[{x:70,y:85,r:8,tool:0}],foamDesigner:{name:'Drag drawer',foam:{...DEFAULT_FOAM,width:500,height:400,keepouts:[{id:'area',name:'Existing pocket',shape:rectShape(350,250,60,60)}]},tools:[{id:'a',name:'Wrench',shape:rectShape(0,0,40,100),x:40,y:50,depth:20,rotation:0,zones:[{id:'region',shape:rectShape(0,0,40,20),depth:30}]},{id:'b',name:'Driver',shape:rectShape(0,0,25,100),x:220,y:80,depth:20,rotation:30,zones:[]}]}};
const near=(actual,expected,message,tolerance=1)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} vs ${expected}`);
async function frame(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function position(page,id,xy){return page.locator('#'+id).evaluate((svg,[x,y])=>{const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};},xy);}
async function screenBox(locator){return locator.evaluate(e=>{const b=e.getBBox(),m=e.getScreenCTM(),p=new DOMPoint(b.x,b.y).matrixTransform(m);return {x:p.x,y:p.y};});}
async function load(p){await p.goto(base);await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready'&&document.querySelectorAll('.tool-path').length===3);await p.locator('#projectInput').setInputFiles({name:'drag.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.waitForFunction(()=>document.querySelectorAll('.foam-instance').length===2);await p.locator('#traceStudioBtn').click();await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');}
const errors=[];
try{
for(const [width,height] of [[1440,1000],[1024,800]]){
 const ctx=await browser.newContext({viewport:{width,height}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await load(p);
 // The actual cut outline, base silhouette and finger grip must follow every mouse movement before release.
 const cut=p.locator('.tool-path[data-tool="0"]').first(),raw=p.locator('.raw-path').first(),finger=p.locator('[data-finger="0"]');
 const start=await position(p,'editor',[55,80]),cutStart=await screenBox(cut),rawStart=await screenBox(raw),fingerStart=await screenBox(finger);
 await p.mouse.move(start.x,start.y);await p.mouse.down();
 for(const [dx,dy] of [[12,8],[45,25],[-8,-10],[24,16]]){await p.mouse.move(start.x+dx,start.y+dy);await frame(p);for(const [name,node,before] of [['cut',cut,cutStart],['base',raw,rawStart],['grip',finger,fingerStart]]){const actual=await screenBox(node);near(actual.x,before.x+dx,`${width} trace ${name} x`);near(actual.y,before.y+dy,`${width} trace ${name} y`);}}
 await p.mouse.up();await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');
 const rawEnd=await screenBox(raw);near(rawEnd.x,rawStart.x+24,'drop stays at cursor');await p.locator('#undoBtn').click();await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');near((await screenBox(raw)).x,rawStart.x,'one undo restores entire drag');await p.locator('#redoBtn').click();await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');near((await screenBox(raw)).x,rawEnd.x,'redo restores drop');
 // A second drag must pick up the visible tool at its new position, including after zoom.
 await p.locator('#zoomIn').click();const second=await raw.boundingBox(),at={x:second.x+second.width/2,y:second.y+second.height/2},beforeSecond=await screenBox(raw);await p.mouse.move(at.x,at.y);await p.mouse.down();await p.mouse.move(at.x+14,at.y+11,{steps:5});await frame(p);near((await screenBox(raw)).x,beforeSecond.x+14,'repeated zoomed trace drag');await p.mouse.up();
 await p.locator('#foamStudioBtn').click();const tool=p.locator('[data-instance="0"]'),zone=p.locator('.foam-layout-zone').first();
 for(let repeat=0;repeat<3;repeat++){
  const b=await tool.boundingBox(),from={x:b.x+b.width/2,y:b.y+b.height/2},original=await screenBox(tool),zoneOriginal=await screenBox(zone);
  await p.mouse.move(from.x,from.y);await p.mouse.down();for(const [dx,dy] of [[15,8],[55,30],[-10,-5],[28,15]]){await p.mouse.move(from.x+dx,from.y+dy);await frame(p);near((await screenBox(tool)).x,original.x+dx,'foam tool follows pointer');near((await screenBox(zone)).y,zoneOriginal.y+dy,'depth region follows tool');assert.equal(await p.locator('#foamExport').isDisabled(),true,'cannot export uncommitted drag');}
  await p.mouse.up();near((await screenBox(tool)).x,original.x+28,'foam release keeps position');await p.locator('#foamUndo').click();near((await screenBox(tool)).x,original.x,'foam drag is one undo');await p.locator('#foamRedo').click();near((await screenBox(tool)).x,original.x+28,'foam redo');
 }
 // Pan across the blank workspace at different aspect ratios; return to the start without drift.
 const empty=await position(p,'foamLayout',[400,100]),oldView=await p.locator('#foamLayout').getAttribute('viewBox');await p.mouse.move(empty.x,empty.y);await p.mouse.down();for(const [dx,dy] of [[50,20],[80,40],[15,10],[0,0]]){await p.mouse.move(empty.x+dx,empty.y+dy);await frame(p);}await p.mouse.up();const panView=(await p.locator('#foamLayout').getAttribute('viewBox')).split(' ').map(Number),expected=oldView.split(' ').map(Number);panView.forEach((v,i)=>near(v,expected[i],'pan must return to start',.001));
 // Captured mouse release outside the SVG must commit once, then permit the next drag.
 const outsideBox=await tool.boundingBox(),stage=await p.locator('#foamLayout').boundingBox(),outsideStart={x:outsideBox.x+outsideBox.width/2,y:outsideBox.y+outsideBox.height/2},outsideBefore=await screenBox(tool);await p.mouse.move(outsideStart.x,outsideStart.y);await p.mouse.down();await p.mouse.move(stage.x-25,outsideStart.y+15,{steps:6});await frame(p);const outsidePosition=await screenBox(tool);await p.mouse.up();near((await screenBox(tool)).x,outsidePosition.x,'release outside SVG commits');await p.locator('#foamUndo').click();near((await screenBox(tool)).x,outsideBefore.x,'outside drop undo');
 // Escape and focus loss cancel only the current edit, keeping committed geometry and history intact.
 const b=await tool.boundingBox(),from={x:b.x+b.width/2,y:b.y+b.height/2},original=await screenBox(tool);await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+40,from.y+20);await frame(p);await p.keyboard.press('Escape');await p.mouse.up();near((await screenBox(tool)).x,original.x,'Escape cancels drag');
 await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+20,from.y+10);await frame(p);await p.evaluate(()=>dispatchEvent(new Event('blur')));await p.mouse.up();near((await screenBox(tool)).x,original.x,'focus loss cancels drag');
 console.log(`${width}: continuous Trace/Foam tool and grip movement, repeated zoomed drags, depth regions, pan, undo/redo, Escape and focus-loss recovery passed`);await ctx.close();
}
// Touch must still turn an accidental one-finger move into a pinch without moving a tool.
{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await load(p);await p.locator('[data-panel=workspace]').click();
 const cdp=await ctx.newCDPSession(p),touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],i)=>({x,y,id:i+1,radiusX:3,radiusY:3,force:1}))});
 for(const studio of ['trace','foam']){
  if(studio==='foam')await p.locator('#foamStudioBtn').tap();
  const id=studio==='trace'?'editor':'foamLayout',selector=studio==='trace'?'.raw-path':'[data-instance]',xy=studio==='trace'?[55,80]:[60,80],before=await p.locator(selector).evaluateAll(es=>es.map(e=>e.getAttribute('d'))),at=await position(p,id,xy),x=at.x,y=at.y;
  await touch('touchStart',[[x,y]]);await touch('touchMove',[[x+12,y+8]]);await frame(p);await touch('touchStart',[[x+12,y+8],[x+45,y+8]]);await touch('touchMove',[[x-15,y+12],[x+70,y+12]]);await touch('touchEnd',[]);await frame(p);
  assert.deepEqual(await p.locator(selector).evaluateAll(es=>es.map(e=>e.getAttribute('d'))),before,studio+' pinch preserves geometry');
 }
 console.log('390: real touch drag-to-pinch rollback preserved in Trace and Foam');await ctx.close();
}
// Overlapping cut paths must not make a different tool move with the selected body.
{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await load(p);const merged=structuredClone(project);merged.tools[1].points=[[60,80],[85,80],[85,140],[60,140]];await p.locator('#projectInput').setInputFiles({name:'merged.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(merged))});await p.locator('#traceStudioBtn').click();await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready'&&document.querySelectorAll('.tool-path').length===1);const first=p.locator('.raw-path').nth(0),second=p.locator('.raw-path').nth(1),a=await screenBox(first),b=await screenBox(second),at=await position(p,'editor',[50,70]);await p.mouse.move(at.x,at.y);await p.mouse.down();await p.mouse.move(at.x-20,at.y-10);await frame(p);near((await screenBox(first)).x,a.x-20,'merged component selects actual tool');near((await screenBox(second)).x,b.x,'other tool remains stationary');await p.mouse.up();await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');console.log('Overlapping trace profiles remain independently draggable');await ctx.close();
}
// Dense contours must follow the pointer during the gesture, not catch up only at mouse-up.
{
 const dense=structuredClone(project);dense.tools=[];dense.fingers=[];dense.foamDesigner.foam={...DEFAULT_FOAM,width:700,height:650};dense.foamDesigner.tools=Array.from({length:40},(_,i)=>{const ring=Array.from({length:401},(_,j)=>{const a=(j%400)/400*2*Math.PI;return [25+25*Math.cos(a),45+45*Math.sin(a)];});return {id:'dense'+i,name:'Dense tool '+i,shape:[[ring]],x:20+i%8*80,y:20+Math.floor(i/8)*120,depth:20,rotation:0,zones:[]};});const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await load(p);await p.locator('#projectInput').setInputFiles({name:'dense.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(dense))});await p.waitForFunction(()=>document.querySelectorAll('.foam-instance').length===40);const tool=p.locator('[data-instance="0"]'),box=await tool.boundingBox(),at={x:box.x+box.width/2,y:box.y+box.height/2},before=await screenBox(tool);await p.mouse.move(at.x,at.y);await p.mouse.down();for(const [dx,dy] of [[10,10],[50,20],[90,40],[30,25],[15,15]]){await p.mouse.move(at.x+dx,at.y+dy);await frame(p);near((await screenBox(tool)).x,before.x+dx,'dense layout tracks each movement');}await p.mouse.up();console.log('40 tools / 16,040 contour points: continuous placement passed');await ctx.close();
}
// Live clearance checks may run off-thread, but release must always validate, including without workers.
for(const fallback of [false,true]){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await load(p);await p.locator('#foamStudioBtn').click();if(fallback)await p.evaluate(()=>{const NativeWorker=window.Worker;window.Worker=function(url,options){if(String(url).includes('layout-worker'))throw Error('Workers unavailable');return new NativeWorker(url,options);};});const tool=p.locator('[data-instance="0"]'),start=await position(p,'foamLayout',[60,80]),end=await position(p,'foamLayout',[240,100]);await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:5});await frame(p);if(!fallback)await p.waitForFunction(()=>document.querySelector('[data-instance="0"]').classList.contains('invalid'));await p.mouse.up();assert.equal(await p.locator('#foamExport').isDisabled(),true);assert.match(await p.locator('#foamStatus').textContent(),/overlap|apart/);await p.locator('#foamUndo').click();assert.equal(await p.locator('#foamExport').isEnabled(),true);console.log(`Clearance validation and undo passed (${fallback?'no-worker fallback':'background worker'})`);await ctx.close();
}
assert.deepEqual(errors,[]);
}finally{await browser.close();}
