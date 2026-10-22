import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];
const ready=async p=>{await p.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready'&&document.querySelectorAll('.tool-path').length===3);};
async function input(p,id,value){await p.locator('#'+id).evaluate((el,v)=>{el.focus();el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
for(const [w,h,touch] of [[1440,1000,false],[390,844,true],[820,1180,true]]){
 const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch});const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3000');await ready(p);
 await p.locator('#addAllToFoam').evaluate(e=>e.click());await p.waitForFunction(()=>document.body.dataset.studio==='foam'&&document.querySelectorAll('.foam-instance').length===3);assert.equal(await p.locator('#foamStatus').textContent(),'Layout ready');
 if(w<768){await p.locator('[data-foam-panel=settings]').click();await p.locator('#foamDimensionSettings').evaluate(e=>e.open=true);}
 await input(p,'foamWidth',700);await input(p,'foamHeight',450);await input(p,'foamThickness',60);await input(p,'foamToolName','Torque wrench');await input(p,'foamDepth',18);await p.locator('#foamDepth').blur();
 assert.match(await p.locator('#foamDimensions').textContent(),/700 × 450 × 60/);assert.equal(await p.locator('#foamDepthRange').inputValue(),'18');
 // Real Three.js renderer must update its mesh depth data on input, before blur/change.
 await p.locator('#foam3D').click();await p.waitForFunction(()=>document.getElementById('foamWebGL').dataset.depths?.includes('18'));let revision=await p.locator('#foamWebGL').getAttribute('data-revision');await input(p,'foamDepthRange',26);await p.waitForFunction(r=>document.getElementById('foamWebGL').dataset.revision!==r,revision);assert.match(await p.locator('#foamWebGL').getAttribute('data-depths'),/26/);await p.locator('#foamDepthRange').blur();
 await p.screenshot({path:`/tmp/toolnest-foam-${w}-3d.png`});
 // Capture a reusable tool, insert a duplicate, and keep its depth through a page reload.
 await p.locator('#foamSaveTool').click();await p.locator('#libraryBtn').click();assert.match(await p.locator('#libraryRows').textContent(),/Torque wrench/);await p.locator('#librarySearch').fill('Torque');await p.locator('.foam-lib-row .secondary').first().click();await p.waitForFunction(()=>document.querySelectorAll('.foam-instance').length===4);assert.equal(await p.locator('#foamDepth').inputValue(),'26');
 if(w<768)await p.locator('[data-foam-panel=settings]').click();await p.locator('#foamToolName').fill('Copied wrench');await p.locator('#foamToolName').dispatchEvent('input');await p.locator('#foamToolName').blur();
 // Place on top of another pocket: export must be blocked, then undo must restore it.
 await input(p,'foamX',10);await input(p,'foamY',10);await p.locator('#foamY').blur();assert.equal(await p.locator('#foamExport').isDisabled(),true);assert.match(await p.locator('#foamStatus').textContent(),/overlap/);
 await p.locator('#foamUndo').click();await p.locator('#foamUndo').click();assert.equal(await p.locator('#foamExport').isEnabled(),true);
 await p.locator('#foam2D').click();await p.locator('#foamAddZone').click();
 // Draw a real depth rectangle using the SVG's screen transform, clipped to the selected tool.
 const points=await p.locator('#foamLayout').evaluate(svg=>{const path=svg.querySelector('.selected'),box=path.getBBox(),m=svg.getScreenCTM();return [[box.x,box.y],[box.x+box.width,box.y+box.height*.3]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(m);return {x:p.x,y:p.y};});});await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();await p.mouse.move(points[1].x,points[1].y,{steps:10});await p.mouse.up();assert.equal(await p.locator('.foam-zone').count(),1);
 if(w<768)await p.locator('[data-foam-panel=settings]').click();const region=p.locator('.foam-zone input');await region.evaluate(e=>{e.value='35';e.dispatchEvent(new Event('input',{bubbles:true}));});await p.locator('#foam3D').click();await p.waitForFunction(()=>document.getElementById('foamWebGL').dataset.depths?.includes('35'));
 // All saved dimensions, names, depths, regions and placements must survive a file round trip.
 const [save]=await Promise.all([p.waitForEvent('download'),p.locator('#foamSave').click()]);const saved=`/tmp/toolnest-foam-project-${w}.json`;await save.saveAs(saved);const project=JSON.parse(readFileSync(saved));assert.equal(project.foamDesigner.foam.width,700);assert.equal(project.foamDesigner.tools.length,4);assert.equal(project.foamDesigner.tools.at(-1).zones[0].depth,35);
 await p.locator('#foamFormat').selectOption('svg');const [exp]=await Promise.all([p.waitForEvent('download'),p.locator('#foamExport').click()]);const file=`/tmp/toolnest-foam-export-${w}.svg`;await exp.saveAs(file);const svg=readFileSync(file,'utf8');assert.ok(svg.includes('width="700mm"'));assert.ok(svg.includes('data-depth-mm="35"'));
 await p.locator('#projectInput').setInputFiles(saved);await p.waitForTimeout(500);assert.equal(await p.locator('.foam-instance').count(),4);assert.equal(await p.locator('#foamWidth').inputValue(),'700');await p.locator('.foam-instance').last().evaluate(e=>e.click());assert.equal(await p.locator('.foam-zone input').inputValue(),'35');
 await p.waitForTimeout(500);await p.reload();await p.waitForFunction(()=>document.body.dataset.studio==='foam');assert.equal(await p.locator('.foam-instance').count(),4);await p.locator('#libraryBtn').click();assert.match(await p.locator('#libraryRows').textContent(),/Torque wrench/);await p.locator('#closeModal').click();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
 if(w<768)await p.locator('[data-foam-panel=settings]').click();await p.screenshot({path:`/tmp/toolnest-foam-${w}-settings.png`});console.log(`${w}: 3D live depths, multi-tool layout, library, regions, export checks, file roundtrip and device reload passed`);await ctx.close();
}
assert.deepEqual(errors,[]);await browser.close();console.log('Foam browser checks passed without JavaScript errors.');
