import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const errors=[];
async function ready(p){await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready'&&document.querySelectorAll('.tool-path').length>0);}
async function input(p,id,value){await p.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);await ready(p);}
for(const [width,height,touch] of [[1440,1100,false],[390,844,true],[820,1180,true]]){
 const ctx=await b.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3000/?sample');await p.waitForFunction(()=>document.querySelectorAll('.tool-path').length===3);await ready(p);assert.equal(await p.locator('#calBanner,.calibration-banner').count(),0);
 if(touch)await p.locator('#settingsBtn').tap();assert.equal(await p.locator('#workspacePanel').isVisible(),true);assert.equal(await p.locator('#refinePanel').isVisible(),true);
 let d=await p.locator('.tool-path').first().getAttribute('d');await input(p,'smoothing',4);assert.notEqual(await p.locator('.tool-path').first().getAttribute('d'),d,'smoothing must update before change/release');
 for(const style of ['detail','relax','round']){await input(p,'smoothingMode',style);assert.equal(await p.locator('#smoothingMode').inputValue(),style);}
 d=await p.locator('.tool-path').first().getAttribute('d');await input(p,'simplification',.9);assert.notEqual(await p.locator('.tool-path').first().getAttribute('d'),d);
 await input(p,'clearance',2);assert.match(await p.locator('#clearanceValue').textContent(),/2.0/);
 // Add a real grip, then retrace continuously without dropping it.
 await p.locator('#addFinger').evaluate(e=>e.click());const rect=await p.locator('#editor').boundingBox();await p.mouse.click(rect.x+55/210*rect.width,rect.y+115/297*rect.height);await ready(p);assert.equal(await p.locator('.finger-item').count(),1);
 if(touch)await p.locator('#settingsBtn').tap();await input(p,'threshold',150);assert.equal(await p.locator('.finger-item').count(),1,'threshold discarded grip');
 for(const [id,v] of [['weakRatio',.3],['gapMm',.8],['minToolArea',25]]){const before=await p.locator('#editor').getAttribute('data-preview-revision');await input(p,id,v);assert.notEqual(await p.locator('#editor').getAttribute('data-preview-revision'),before,id+' did not update live');}
 await p.locator('#finger-size-0').evaluate(e=>{e.focus();e.value='28';e.dispatchEvent(new Event('input',{bubbles:true}));});await ready(p);assert.equal(await p.locator('.finger-circle').first().getAttribute('r'),'14');await p.locator('#finger-size-0').evaluate(e=>e.blur());
 // Rapid successive inputs must finish at the last value, not an obsolete worker result.
 await p.locator('#clearance').evaluate(e=>{for(const v of [1,3,.5,2.5]){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}});await ready(p);assert.equal(await p.locator('#clearance').inputValue(),'2.5');assert.match(await p.locator('#clearanceValue').textContent(),/2.5/);
 await p.locator('#clearance').dispatchEvent('change');await p.locator('#undoBtn').evaluate(e=>e.click());await ready(p);assert.equal(await p.locator('#clearance').inputValue(),'2');await p.locator('#redoBtn').evaluate(e=>e.click());await ready(p);assert.equal(await p.locator('#clearance').inputValue(),'2.5');
 await p.locator('#toolWidth').evaluate(e=>{e.focus();e.value=String(Number(e.value)+1);e.dispatchEvent(new Event('input',{bubbles:true}));});await ready(p);await p.locator('#toolWidth').evaluate(e=>e.blur());
 await p.locator('#exportFormat').selectOption('svg');const paths=await p.locator('.tool-path').evaluateAll(a=>a.map(e=>e.getAttribute('d')));const [out]=await Promise.all([p.waitForEvent('download'),p.locator('#exportBtn').click()]);const dest=`/tmp/toolnest-live-${width}.svg`;await out.saveAs(dest);const content=readFileSync(dest,'utf8');for(const path of paths)assert.ok(content.includes(path),'export does not match visible preview');
 const [saved]=await Promise.all([p.waitForEvent('download'),p.locator('#saveBtn').click()]);await saved.saveAs(`/tmp/toolnest-live-${width}.json`);const project=JSON.parse(readFileSync(`/tmp/toolnest-live-${width}.json`));assert.equal(project.smoothing,4);assert.equal(project.smoothingMode,'round');assert.equal(project.simplification,.9);assert.equal(project.weakRatio,.3);assert.equal(project.fingers.length,1);
 await p.locator('#projectInput').setInputFiles(`/tmp/toolnest-live-${width}.json`);await ready(p);assert.equal(await p.locator('#smoothing').inputValue(),'4');assert.equal(await p.locator('#weakRatio').inputValue(),'0.3');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(touch){await p.locator('#settingsBtn').tap();await p.locator('#advanced').evaluate(e=>e.open=true);await p.locator('#threshold').scrollIntoViewIfNeeded();await p.screenshot({path:`/tmp/live-settings-${width}.png`});}
 console.log(`${width}×${height}: live input-only previews, styles, thresholds, grip preservation, rapid updates, matching SVG, save/reopen passed`);await ctx.close();
}
assert.deepEqual(errors,[]);await b.close();console.log('Live settings checks passed without browser errors.');
