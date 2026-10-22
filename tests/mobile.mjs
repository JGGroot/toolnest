import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
const sizes=[[320,568],[390,844],[430,932],[768,1024],[820,1180],[1024,768],[1180,820]];
for(const [width,height] of sizes){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3000');await page.waitForFunction(()=>document.querySelectorAll('.tool-path').length===3);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`page overflow ${width}`);
 const small=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').filter(e=>{const r=e.getBoundingClientRect();return r.width<43.9||r.height<43.9;}).map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
 assert.deepEqual(small,[],`undersized controls ${width}: ${JSON.stringify(small)}`);
 await page.locator('[data-panel="capture"]').tap();assert.equal(await page.locator('#capturePanel').isVisible(),true);assert.equal(await page.locator('#cameraBtn').isVisible(),true);assert.equal(await page.locator('#toolList').isVisible(),true);assert.equal(await page.locator('#cameraInput').getAttribute('capture'),'environment');await page.locator('.tool-item').nth(1).tap();assert.equal(await page.locator('#workspacePanel').isVisible(),true);assert.equal(await page.locator('body').getAttribute('data-mobile-panel'),'workspace');
 await page.locator('[data-panel="refine"]').tap();assert.equal(await page.locator('#refinePanel').isVisible(),true);const bounds=await page.locator('#clearance').boundingBox();assert.ok(bounds.height>=44);await page.locator('#addFinger').tap();await page.locator('[data-panel="workspace"]').tap();
 await page.locator('#focusBtn').tap();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('canvas-focus')),true);assert.equal(await page.locator('.mobile-nav').isVisible(),false);
 await page.locator('#selectMode').tap();await page.locator('#zoomIn').tap();assert.equal(await page.locator('#zoomLabel').textContent(),'125%');
 await page.locator('#focusBtn').tap();
 if(width===390||width===820){await page.screenshot({path:`tests/mobile-${width}.png`,fullPage:true});}
 await context.close();console.log(`${width}×${height}: layout, navigation, camera, controls, focus, zoom passed`);
}
// Real browser touch dispatch: pinch/pan over tools must preserve the cut geometry.
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3000');await page.waitForFunction(()=>document.querySelectorAll('.tool-path').length===3);await page.locator('#focusBtn').tap();
const session=await context.newCDPSession(page);
async function touch(type,points){await session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i+1,radiusX:3,radiusY:3,force:1}))});}
const area=await page.locator('#canvasArea').boundingBox(),cx=area.x+area.width/2,cy=area.y+area.height*.43;
const cutBefore=await page.locator('.tool-path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')));
await touch('touchStart',[[cx-30,cy],[cx+30,cy]]);await touch('touchMove',[[cx-75,cy+20],[cx+75,cy+20]]);await touch('touchEnd',[]);await page.waitForTimeout(100);
assert.ok(parseInt(await page.locator('#zoomLabel').textContent())>150,'pinch zoom did not change');assert.deepEqual(await page.locator('.tool-path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d'))),cutBefore,'pinch changed geometry');
// Pinch after a one-finger drag has started rolls that edit back.
await page.locator('#fitBtn').evaluate(e=>e.click());const tool=await page.locator('.tool-path').first().boundingBox(),tx=tool.x+tool.width*.48,ty=tool.y+tool.height*.6;
await touch('touchStart',[[tx,ty]]);await touch('touchMove',[[tx+10,ty+8]]);await touch('touchStart',[[tx+10,ty+8],[tx+45,ty+8]]);await touch('touchMove',[[tx-20,ty+12],[tx+75,ty+12]]);await touch('touchEnd',[]);await page.waitForTimeout(100);assert.deepEqual(await page.locator('.tool-path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d'))),cutBefore,'pinch did not roll back initial accidental drag');
console.log('Pinch/pan over tool geometry and drag-to-pinch rollback passed');
await page.locator('#fitBtn').evaluate(e=>e.click());await page.locator('#editMode').tap();assert.equal(await page.locator('#pointActions').isVisible(),true);await page.waitForTimeout(100);const handle=await page.locator('.node-hit').nth(3).boundingBox();await page.touchscreen.tap(handle.x+handle.width/2,handle.y+handle.height/2);assert.equal(await page.locator('#removePoint').isEnabled(),true);await page.locator('#removePoint').tap();await page.locator('#undoBtn').tap();await page.locator('#insertPoint').tap();const target=await page.locator('.tool-path.selected').boundingBox();await page.touchscreen.tap(target.x+target.width*.5,target.y+target.height*.4);assert.equal(await page.locator('#insertPoint').getAttribute('aria-pressed'),'false');await page.locator('#donePoints').tap();
await page.locator('#focusBtn').tap();await page.locator('[data-panel="refine"]').tap();await page.locator('#exportFormat').selectOption('svg');const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportBtn').tap()]);assert.ok(download.suggestedFilename().endsWith('.svg'));console.log('Touch point selection/removal/insertion and mobile export passed');
await page.locator('[data-panel="capture"]').tap();await page.locator('#mobileLabBtn').tap();assert.equal(await page.locator('#modal').isVisible(),true);const modal=await page.locator('#modal').boundingBox();assert.ok(modal.height<844);await page.locator('#closeModal').tap();
// Native photo picker pathway, with bitmap decoding unavailable (Safari-style fallback).
await page.locator('[data-panel="capture"]').tap();await page.evaluate(()=>window.createImageBitmap=undefined);await page.locator('#cameraInput').setInputFiles('/workspace/sites/toolnest/tests/upload.png');await page.waitForFunction(()=>document.getElementById('footerStatus').textContent==='Calibrated');assert.equal(await page.locator('body').getAttribute('data-mobile-panel'),'workspace');assert.equal(await page.locator('.tool-path').count(),3);console.log('Camera input and native image decoder fallback passed');
// Orientation change retains section and geometry and clamps the viewport.
await page.locator('[data-panel="workspace"]').tap();await page.setViewportSize({width:844,height:390});await page.locator('#focusBtn').tap();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'tests/mobile-landscape.png',fullPage:true});await context.close();
assert.deepEqual(errors,[]);await browser.close();console.log('All mobile checks passed; no browser errors.');
