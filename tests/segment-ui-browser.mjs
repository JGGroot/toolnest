import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.TOOLNEST_PLAYWRIGHT?pathToFileURL(process.env.TOOLNEST_PLAYWRIGHT).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TOOLNEST_CHANNEL?{channel:process.env.TOOLNEST_CHANNEL}:{})});
const base=process.env.TOOLNEST_URL||'http://localhost:3000/';
async function clickMM(page,x,y){const p=await page.locator('#editor').evaluate((svg,p)=>{const q=new DOMPoint(...p).matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};},[x,y]);await page.mouse.click(p.x,p.y);}
async function idle(page){await page.waitForFunction(()=>document.getElementById('tapCancel').hidden,{timeout:180000});}
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r);});await page.goto(base+'?sample&segcompare');await page.waitForFunction(()=>document.querySelectorAll('.tool-item').length===3);assert.equal(external.length,0);
  if(width<768)await page.locator('[data-panel=refine]').click();await page.locator('#traceMethod').selectOption('tap');await idle(page);assert.equal(await page.locator('#tapFallback').isVisible(),false);
  await clickMM(page,114,108);await idle(page);assert.equal(await page.locator('.tap-positive').count(),1);assert.equal(await page.locator('.tap-outline').count(),2);assert.match(await page.locator('#tapCompare').textContent(),/Quick: load.*Precise: load/s);
  // Moving a pointer and converting a tap to a pinch must never submit another prompt.
  const stage=await page.locator('#canvasArea').boundingBox();
  await page.mouse.move(stage.x+stage.width*.7,stage.y+stage.height*.6);await page.mouse.down();await page.mouse.move(stage.x+stage.width*.7+30,stage.y+stage.height*.6+20);await page.mouse.up();assert.equal(await page.locator('.tap-positive').count(),1);
  const cdp=await context.newCDPSession(page),a={x:stage.x+stage.width*.45,y:stage.y+stage.height*.5},b={x:stage.x+stage.width*.55,y:stage.y+stage.height*.5};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1},{...b,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x-10,y:a.y,id:1},{x:b.x+10,y:b.y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.locator('.tap-positive').count(),1);await cdp.detach();
  await page.locator('#undoBtn').click();assert.equal(await page.locator('.tap-positive').count(),0);await page.locator('#redoBtn').click();assert.equal(await page.locator('.tap-positive').count(),1);
  await page.locator('[data-segment-engine=sam]').click();await idle(page);assert.equal(await page.locator('.tap-positive').count(),1);
  // A second positive tap extends the current tool, including outside its first mask.
  await clickMM(page,105,180);await idle(page);assert.equal(await page.locator('.tap-positive').count(),2);
  await page.locator('#tapNegative').click();await clickMM(page,30,150);await idle(page);assert.equal(await page.locator('.tap-negative').count(),1);await page.locator('#tapNegative').click();
  await page.locator('#tapUndo').click();await idle(page);assert.equal(await page.locator('.tap-negative').count(),0);
  if(width<768)await page.locator('[data-panel=refine]').click();await page.locator('[data-outline-preset=smooth]').click();await page.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');assert.equal(await page.locator('.tap-positive').count(),2);
  await page.locator('.export-card>summary').click();const download=page.waitForEvent('download');await page.locator('#saveBtn').click();const project=await download;const path=await project.path();await page.locator('#projectInput').setInputFiles(path);await page.waitForTimeout(500);assert.equal(await page.locator('.tap-positive').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(external.every(r=>r.method()==='GET'));assert.deepEqual(errors,[]);console.log(`${width}px: real models, comparison, refinement, negative prompt, undo/redo, settings and project round-trip passed`);await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();await page.route(/https:\/\/(cdn\.jsdelivr\.net|huggingface\.co|storage\.googleapis\.com)\//,route=>route.abort());await page.goto(base+'?sample');await page.waitForFunction(()=>document.querySelectorAll('.tool-item').length===3);await page.locator('#traceMethod').selectOption('tap');await idle(page);assert.ok(await page.locator('#tapFallback').isVisible());await page.locator('#tapFallback').click();assert.equal(await page.locator('#traceMethod').inputValue(),'edges');assert.equal(await page.locator('#tapControls').isVisible(),false);console.log('Offline model failure and Smart edges fallback passed');await context.close();
 const cancelled=await browser.newContext(),cancelPage=await cancelled.newPage();await cancelPage.route('https://cdn.jsdelivr.net/**',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.abort();});await cancelPage.goto(base+'?sample');await cancelPage.waitForFunction(()=>document.querySelectorAll('.tool-item').length===3);await cancelPage.locator('#traceMethod').selectOption('tap');await cancelPage.locator('#tapCancel').click();await cancelPage.waitForTimeout(700);assert.equal(await cancelPage.locator('#tapStatus').textContent(),'Cancelled');assert.equal(await cancelPage.locator('.tool-item').count(),3);console.log('Model download cancellation preserved geometry');await cancelled.close();
}finally{await browser.close();}
